import { getAllTasks, computeGlobalKpis, type TaskRow } from "@/lib/queries";
import { isOpen } from "@/lib/derive";
import { getAppSettings } from "@/lib/settings";
import { HubTabs, type HubTab } from "@/components/hub-tabs";
import { WelcomeHero } from "@/components/welcome-hero";
import { OverviewSection } from "./_hub/overview-section";
import { CompaniesSection } from "./_hub/companies-section";
import { TasksSection } from "./_hub/tasks-section";

export const dynamic = "force-dynamic";

type Sp = {
  tab?: string;
  co?: string;
  // task filter params
  company?: string;
  priority?: string;
  flag?: string;
  status?: string;
  noOwner?: string;
  closed?: string;
  view?: string;
  month?: string;
  q?: string;
  all?: string;
};

function parseTab(v: string | undefined): HubTab {
  if (v === "companies" || v === "tasks") return v;
  return "overview";
}

/** One-line operational summary for the hero. */
function buildPulse(rows: TaskRow[]): string {
  const k = computeGlobalKpis(rows);

  // Hotspot = company with the most overdue/critical open items.
  const heat = new Map<string, number>();
  for (const r of rows) {
    if (!isOpen(r.status)) continue;
    const hot = r.flag === "overdue" || r.flag === "escalate-now" || r.priority === "Critical";
    if (hot) heat.set(r.companyName, (heat.get(r.companyName) ?? 0) + 1);
  }
  const hotspot = [...heat.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const parts = [`${k.open} open`];
  if (k.overdue) parts.push(`${k.overdue} overdue`);
  if (k.critical) parts.push(`${k.critical} critical`);
  const stat = parts.join(" · ");

  if (k.overdue === 0 && k.critical === 0) return `${stat} — everything's on track. 🎉`;
  return `${stat}${hotspot ? ` — ${hotspot} needs the most attention today.` : "."}`;
}

export default async function HubPage({ searchParams }: { searchParams: Promise<Sp> }) {
  const sp = await searchParams;
  const tab = parseTab(sp.tab);
  const coId = sp.co ? parseInt(sp.co, 10) : null;

  // Overview needs all tasks for stats; companies/tasks fetch their own.
  const rows = tab === "overview" ? await getAllTasks() : [];
  const settings = tab === "overview" ? await getAppSettings() : null;

  return (
    <div className="space-y-4">
      {/* Overview opens with the welcome hero. Companies & Tasks render their own headers. */}
      {tab === "overview" && settings && (
        <WelcomeHero
          pulse={buildPulse(rows)}
          city={settings.weatherCity}
          lat={settings.weatherLat}
          lon={settings.weatherLon}
        />
      )}

      <HubTabs current={tab} />

      {tab === "overview" && <OverviewSection rows={rows} />}
      {tab === "companies" && <CompaniesSection coId={coId} />}
      {tab === "tasks" && (
        <TasksSection
          sp={{
            company: sp.company,
            priority: sp.priority,
            flag: sp.flag,
            status: sp.status,
            noOwner: sp.noOwner,
            closed: sp.closed,
            view: sp.view,
            month: sp.month,
            q: sp.q,
            all: sp.all,
          }}
        />
      )}
    </div>
  );
}

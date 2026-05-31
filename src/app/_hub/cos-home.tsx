import type { TaskRow } from "@/lib/queries";
import { computeGlobalKpis } from "@/lib/queries";
import { isOpen } from "@/lib/derive";
import { getAppSettings } from "@/lib/settings";
import { WelcomeHero } from "@/components/welcome-hero";
import { AttentionList } from "@/components/attention-list";
import { CompaniesWidget, type CompanyGlance } from "@/components/companies-widget";
import type { AttnItem } from "@/components/attention-panel";

/**
 * One short, human insight — not a count dump (the stat chips already show
 * the numbers). Points the operator at where to look first.
 */
function buildPulse(rows: TaskRow[]): string {
  const k = computeGlobalKpis(rows);
  const heat = new Map<string, number>();
  for (const r of rows) {
    if (!isOpen(r.status)) continue;
    if (r.flag === "overdue" || r.flag === "escalate-now" || r.priority === "Critical")
      heat.set(r.companyName, (heat.get(r.companyName) ?? 0) + 1);
  }
  const hotspot = [...heat.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  if (k.overdue === 0 && k.critical === 0) return "Everything's on track today. 🎉";
  if (hotspot) return `${hotspot} needs the most attention today.`;
  return "A few items need a look today.";
}

const PRIORITY_ORDER = ["Critical", "High", "Medium", "Low"];

export async function CosHome({ rows }: { rows: TaskRow[] }) {
  const settings = await getAppSettings();
  const isOpenRow = (r: TaskRow) => r.status !== "Completed" && r.status !== "Closed";

  // The one focused list: anything genuinely needing attention, most urgent first.
  const attention = rows
    .filter((r) =>
      r.flag === "escalate-now" || r.flag === "overdue" || r.flag === "escalated" ||
      r.flag === "stalled" || r.status === "Escalated" || r.escalation === "Yes" ||
      (r.flag === "due-soon") || (r.priority === "Critical" && isOpenRow(r))
    )
    .sort((a, b) => {
      const pa = PRIORITY_ORDER.indexOf(a.priority), pb = PRIORITY_ORDER.indexOf(b.priority);
      const da = typeof a.daysToDeadline === "number" ? a.daysToDeadline : 9999;
      const db = typeof b.daysToDeadline === "number" ? b.daysToDeadline : 9999;
      if (da !== db) return da - db;
      return pa - pb;
    });

  const attnItems: AttnItem[] = attention.map((r) => ({
    code: r.code, actionItem: r.actionItem, companyName: r.companyName,
    status: r.status, flag: r.flag, priority: r.priority,
    deadlineTs: r.deadline ? r.deadline.getTime() : null,
    updatedTs: r.lastUpdatedAt ? r.lastUpdatedAt.getTime() : null,
    latestUpdate: r.latestUpdate,
  }));

  // Per-company roll-up for the subtle dashboard widget.
  const byCompany = new Map<number, CompanyGlance>();
  for (const r of rows) {
    const g = byCompany.get(r.companyId) ?? {
      id: r.companyId, name: r.companyName, accent: r.companyAccent, open: 0, closed: 0, openTitles: [] as string[],
    };
    if (isOpenRow(r)) { g.open += 1; if (g.openTitles.length < 8) g.openTitles.push(r.actionItem); }
    else g.closed += 1;
    byCompany.set(r.companyId, g);
  }
  const companyGlances = [...byCompany.values()].sort((a, b) => b.open - a.open || a.name.localeCompare(b.name));

  return (
    <div className="space-y-4">
      <WelcomeHero
        pulse={buildPulse(rows)}
        city={settings.weatherCity}
        lat={settings.weatherLat}
        lon={settings.weatherLon}
      />
      <AttentionList items={attnItems} swipeRight={settings.swipeRightAction} swipeLeft={settings.swipeLeftAction} />
      <CompaniesWidget companies={companyGlances} />
    </div>
  );
}

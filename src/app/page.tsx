import { getAllTasks } from "@/lib/queries";
import { PageHeader } from "@/components/ui";
import { HubTabs, type HubTab } from "@/components/hub-tabs";
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

const today = () =>
  new Date().toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

export default async function HubPage({ searchParams }: { searchParams: Promise<Sp> }) {
  const sp = await searchParams;
  const tab = parseTab(sp.tab);
  const coId = sp.co ? parseInt(sp.co, 10) : null;

  // Overview needs all tasks for stats; companies/tasks fetch their own.
  const rows = tab === "overview" ? await getAllTasks() : [];

  return (
    <div className="space-y-2">
      {/* Only the Overview tab gets a PageHeader. Companies & Tasks render their own headings. */}
      {tab === "overview" && (
        <PageHeader title="Command Centre" sub={today()} />
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

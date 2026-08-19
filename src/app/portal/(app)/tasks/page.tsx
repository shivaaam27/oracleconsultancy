import { redirect } from "next/navigation";
import { Hero, HeroMetrics } from "@/components/surface-kit";
import { Reveal } from "@/components/reveal";
import { AutoRefresh } from "@/components/auto-refresh";
import { getPortalPerson, visibleTaskIds } from "@/lib/portal-auth";
import { getScopedPickerData, type PickerCompany, type PickerPerson } from "@/lib/portal-picker";
import { buildCommandTasks } from "@/lib/portal-command-tasks";
import { PortalTasksCommand, type Filter } from "@/components/portal-tasks-command";
import { PortalRecurringTasks } from "@/components/portal-recurring-tasks";
import { portalListRecurringTasks } from "./automations-actions";

const FILTERS: Filter[] = ["all", "inprogress", "overdue", "soon", "fromme", "mine", "done", "notstarted"];

/** Build the command-view task list from the shared builder, scoped to the
 *  viewer's role. Filtered to their visible tasks. */
function CommandTasks({
  me, cmd, initialFilter, canCreate, companies, people,
}: {
  me: NonNullable<Awaited<ReturnType<typeof getPortalPerson>>>;
  cmd: Awaited<ReturnType<typeof buildCommandTasks>>;
  initialFilter: Filter;
  /** Staff get the SAME design but can't raise tasks (no quick-add / FAB). */
  canCreate: boolean;
  companies: PickerCompany[];
  people: PickerPerson[];
}) {
  return <PortalTasksCommand tasks={cmd} people={people} companies={companies} role={me.portalRole} viewerId={me.id} canCreate={canCreate} canManageAny={me.caps.manageAnyTask} canRepeat={me.caps.recurringTasks} initialFilter={initialFilter} />;
}

export const dynamic = "force-dynamic";
export const metadata = { title: "Tasks — Oracle Consultancy" };

export default async function PortalTasksPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");
  // The Tasks tab is owner-configurable per role (Settings → Portals). By default
  // staff have no Tasks page (tasks live on Home) — bounce anyone without the tab.
  if (!me.caps.navTasks) redirect("/portal");

  const { filter } = await searchParams;
  const initialFilter: Filter = FILTERS.includes(filter as Filter) ? (filter as Filter) : "all";

  const ids = await visibleTaskIds(me);
  // One scoped source for the create pickers (same helper as home / new-task /
  // board) so every surface shows the SAME permission-scoped companies + people:
  // director/HR → all; company-scoped director → their companies; manager → the
  // companies they belong to + the people in them. Shared by the task list AND
  // (when the cap is on) the Recurring tasks section below.
  const [cmd, { companies, people }, recurring] = await Promise.all([
    buildCommandTasks(ids, me.id, me.name),
    getScopedPickerData(me),
    me.caps.recurringTasks ? portalListRecurringTasks() : Promise.resolve([]),
  ]);
  // EVERY role gets the one Aurora command view (portaltaskdesign). Permissions
  // are enforced inside it AND server-side; task creation follows me.caps.createTasks.
  // The hero figures. Open is everything not Completed/Closed; the other two are
  // the ones worth walking towards, so both are links into that filter.
  const openCount = cmd.filter((t) => !t.isDone).length;
  const overdueCount = cmd.filter((t) => !t.isDone && t.overdue).length;
  const soonCount = cmd.filter((t) => !t.isDone && !t.overdue && t.withinSoon).length;

  const scopeNote =
    me.portalRole === "hr" || me.portalRole === "director"
      ? "Every task across all companies."
      : me.portalRole === "manager"
        ? "Your company's tasks, plus your own and your team's."
        : "Tasks assigned to you.";

  return (
    <div className="flex flex-col gap-3">
      <AutoRefresh seconds={30} />
      <Reveal delay={0}>
        <Hero title="Tasks" subtitle={scopeNote}>
          <HeroMetrics
            items={[
              { label: "open", value: openCount },
              { label: "overdue", value: overdueCount, tone: "danger", href: "/portal/tasks?filter=overdue" },
              { label: "due soon", value: soonCount, tone: "warn", href: "/portal/tasks?filter=soon" },
            ]}
          />
        </Hero>
      </Reveal>
      <Reveal delay={0.05}>
        <CommandTasks me={me} cmd={cmd} initialFilter={initialFilter} canCreate={me.caps.createTasks} companies={companies} people={people} />
      </Reveal>
      {me.caps.recurringTasks && (
        <Reveal delay={0.08}>
          <PortalRecurringTasks rules={recurring} companies={companies} people={people} />
        </Reveal>
      )}
    </div>
  );
}

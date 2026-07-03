import { redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { Hero } from "@/components/surface-kit";
import { Reveal } from "@/components/reveal";
import { AutoRefresh } from "@/components/auto-refresh";
import { getPortalPerson, visibleTaskIds } from "@/lib/portal-auth";
import { getScopedPickerData } from "@/lib/portal-picker";
import { buildCommandTasks } from "@/lib/portal-command-tasks";
import { PortalTasksCommand, type Filter } from "@/components/portal-tasks-command";

const FILTERS: Filter[] = ["all", "inprogress", "overdue", "soon", "mine", "done"];

/** Build the command-view task list from the shared builder, then scope the
 *  create pickers to the viewer's role. Filtered to their visible tasks. */
async function CommandTasks({
  me, ids, initialFilter, canCreate,
}: {
  me: NonNullable<Awaited<ReturnType<typeof getPortalPerson>>>;
  ids: number[];
  initialFilter: Filter;
  /** Staff get the SAME design but can't raise tasks (no quick-add / FAB). */
  canCreate: boolean;
}) {
  // One scoped source for the create pickers (same helper as home / new-task /
  // board) so every surface shows the SAME permission-scoped companies + people:
  // director/HR → all; company-scoped director → their companies; manager → the
  // companies they belong to + the people in them.
  const [cmd, { companies, people }] = await Promise.all([
    buildCommandTasks(ids, me.id, me.name),
    getScopedPickerData(me),
  ]);

  return <PortalTasksCommand tasks={cmd} people={people} companies={companies} role={me.portalRole} viewerId={me.id} canCreate={canCreate} initialFilter={initialFilter} />;
}

export const dynamic = "force-dynamic";
export const metadata = { title: "Tasks — Oracle Consultancy" };

export default async function PortalTasksPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");

  const { filter } = await searchParams;
  const initialFilter: Filter = FILTERS.includes(filter as Filter) ? (filter as Filter) : "all";

  const ids = await visibleTaskIds(me);

  // EVERY role now gets the one Aurora command view (portaltaskdesign) — staff
  // included. Permissions are enforced inside it (status set, completion via the
  // secure sheet, no bulk-remind) AND server-side; staff just can't raise tasks.
  const isManagement = me.portalRole === "manager" || me.portalRole === "hr" || me.portalRole === "director";
  const scopeNote =
    me.portalRole === "hr" || me.portalRole === "director"
      ? "Every task across all companies."
      : me.portalRole === "manager"
        ? "Your company's tasks, plus your own and your team's."
        : "Tasks assigned to you.";

  return (
    <div className="flex flex-col gap-5">
      <AutoRefresh seconds={30} />
      <Reveal delay={0}>
        <Hero title="Tasks" subtitle={scopeNote}>
          <div className="flex items-center gap-2 text-sm text-fg-muted">
            <ClipboardList size={15} /> {ids.length} task{ids.length === 1 ? "" : "s"} in view
          </div>
        </Hero>
      </Reveal>
      <Reveal delay={0.05}>
        <CommandTasks me={me} ids={ids} initialFilter={initialFilter} canCreate={isManagement} />
      </Reveal>
    </div>
  );
}

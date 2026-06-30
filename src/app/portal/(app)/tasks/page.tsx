import { redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { sb } from "@/db/supabase";
import { Hero } from "@/components/surface-kit";
import { Reveal } from "@/components/reveal";
import { AutoRefresh } from "@/components/auto-refresh";
import { getPortalPerson, visibleTaskIds, directReportIds, seesAllCompanies, isScopedDirector } from "@/lib/portal-auth";
import { getPersonCompaniesMap } from "@/lib/people-queries";
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
  const groupWide = seesAllCompanies(me);

  const [cmd, { data: companiesRaw }, { data: peopleRaw }, personCompanies] = await Promise.all([
    buildCommandTasks(ids, me.id),
    sb.from("companies").select("id,name").order("name"),
    sb.from("people").select("id,name,company_id").eq("active", true).order("name"),
    getPersonCompaniesMap(),
  ]);

  // Scope the create pickers: group-wide for director/HR; a manager creates only
  // in their own company, for themselves or their direct reports.
  let companies = (companiesRaw ?? []).map((c) => ({ id: c.id as number, name: c.name as string }));
  let people = (peopleRaw ?? []).map((p) => {
    const id = p.id as number;
    const primary = (p.company_id as number | null) ?? null;
    return { id, name: p.name as string, companyId: primary, companyIds: personCompanies.get(id) ?? (primary != null ? [primary] : []) };
  });
  if (isScopedDirector(me)) {
    // Company director: pickers cover their WHOLE company (not just direct reports).
    const scope = me.directorCompanyId as number;
    people = people.filter((p) => p.companyIds.includes(scope));
    companies = companies.filter((c) => c.id === scope);
  } else if (!groupWide) {
    const reportSet = new Set([me.id, ...(await directReportIds(me.id))]);
    people = people.filter((p) => reportSet.has(p.id));
    if (me.companyId != null) companies = companies.filter((c) => c.id === me.companyId);
  }

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

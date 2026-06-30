import { redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { sb } from "@/db/supabase";
import { Hero } from "@/components/surface-kit";
import { Reveal } from "@/components/reveal";
import { AutoRefresh } from "@/components/auto-refresh";
import { getPortalPerson, visibleTaskIds, directReportIds, seesAllCompanies, isScopedDirector } from "@/lib/portal-auth";
import { getAllTasks } from "@/lib/queries";
import { getPersonCompaniesMap } from "@/lib/people-queries";
import { getCompanyLogoMap } from "@/lib/company-brand";
import { PortalTasksTable, type PortalTaskRow } from "@/components/portal-tasks-table";
import { PortalTasksCommand, type CommandTask, type Filter } from "@/components/portal-tasks-command";

const CLOSED = new Set(["Completed", "Closed"]);
const FILTERS: Filter[] = ["all", "inprogress", "overdue", "soon", "mine", "done"];

/** Short "2d ago" / "5h ago" relative time for the latest-update line. */
function relTime(iso: string, now: Date): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.round((now.getTime() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  const wks = Math.round(days / 7);
  if (wks < 5) return `${wks}w ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** Build the command-view task list (manager / HR / director) from the SAME
 *  source the admin command centre uses (`getAllTasks`) — so owner, status,
 *  priority, deadline, the overdue flag and the latest update are identical to
 *  task management. Filtered to the viewer's visible tasks. */
async function ManagementTasks({
  me, ids, initialFilter,
}: {
  me: NonNullable<Awaited<ReturnType<typeof getPortalPerson>>>;
  ids: number[];
  initialFilter: Filter;
}) {
  const groupWide = seesAllCompanies(me);

  const [allRows, { data: companiesRaw }, { data: peopleRaw }, personCompanies, logoMap] = await Promise.all([
    getAllTasks(),
    sb.from("companies").select("id,name").order("name"),
    sb.from("people").select("id,name,company_id").eq("active", true).order("name"),
    getPersonCompaniesMap(),
    getCompanyLogoMap(),
  ]);

  const idSet = new Set(ids);
  const rows = allRows.filter((r) => idSet.has(r.id));

  const now = new Date();
  const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayMs = 86400000;
  const toInput = (d: Date | null) =>
    d ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10) : null;

  const cmd: CommandTask[] = rows.map((r) => {
    const isDone = CLOSED.has(r.status);
    const overdue = r.flag === "overdue" || r.flag === "escalate-now";
    const dl = r.deadline;
    const dlDay = dl ? new Date(dl.getFullYear(), dl.getMonth(), dl.getDate()) : null;
    const diff = dlDay ? Math.round((dlDay.getTime() - t0.getTime()) / dayMs) : null;
    const withinSoon = !isDone && !overdue && diff != null && diff >= 0 && diff <= 7;
    const dueLabel = diff == null ? null : diff < 0 ? `${Math.abs(diff)}d overdue` : diff === 0 ? "due today" : `in ${diff}d`;
    // Owner = the command-centre resolved owner (owner_id OR first assignee).
    const ownerName = r.owner || r.assignees[0] || null;
    const accountableId = r.ownerId ?? r.assigneeIds[0] ?? null;
    const act = r.latestActivity;
    const note = act ? (act.kind === "status" ? act.body : act.body) : (r.latestUpdate || null);
    const mine = (r.ownerId === me.id) || r.assigneeIds.includes(me.id);
    return {
      taskId: r.id,
      code: r.code,
      actionItem: r.actionItem,
      createdByPersonId: r.createdByPersonId,
      companyId: r.companyId,
      companyName: r.companyName,
      companyAccent: r.companyAccent,
      companyLogoUrl: logoMap.get(r.companyId) ?? null,
      overdue,
      priority: r.priority,
      dueLabel,
      deadlineInput: toInput(r.deadline),
      accountableId,
      accountableName: ownerName,
      leadIds: r.leadIds.length ? r.leadIds : (accountableId != null ? [accountableId] : []),
      assignees: r.assignees,
      assigneeIds: r.assigneeIds,
      description: r.comments?.trim() || null,
      status: r.status,
      statusLabel: r.status,
      note: note ? note.slice(0, 160) : null,
      updateAuthor: act?.author ?? null,
      updateAgo: act ? relTime(act.atISO, now) : null,
      raisedByMe: mine,
      isDone,
      withinSoon,
    };
  });

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

  return <PortalTasksCommand tasks={cmd} people={people} companies={companies} role={me.portalRole} viewerId={me.id} canCreate initialFilter={initialFilter} />;
}

export const dynamic = "force-dynamic";
export const metadata = { title: "Tasks — Oracle Consultancy" };

/** Display name for a task-update `created_by` stamp (the line-4 author).
 *  Mirrors authorOf on the portal activity page; the viewer's own posts read
 *  "You". Unknown/admin stamps fall back to a neutral "Management". */
function updateAuthor(by: string | null, myName: string): string {
  if (!by) return "System";
  for (const prefix of ["portal-dir:", "portal-mgr:", "portal-hr:", "portal:"]) {
    if (by.startsWith(prefix)) {
      const n = by.slice(prefix.length);
      return n === myName ? "You" : n;
    }
  }
  if (by === "ai-command") return "ORI";
  return "Management";
}

/** Whether an update body is an auto "Moved to X." status change (drives the
 *  line-4 "moved to X" rendering). Matches the status words the portal can set. */
const STATUS_WORDS = ["Not Started", "In Progress", "Under Review", "Blocked", "Waiting External", "Escalated", "Completed", "Closed"];
function isStatusUpdate(body: string): boolean {
  return /^moved to /i.test(body.trim()) && STATUS_WORDS.some((s) => body.includes(s));
}

export default async function PortalTasksPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");

  const { filter } = await searchParams;
  const initialFilter: Filter = FILTERS.includes(filter as Filter) ? (filter as Filter) : "all";

  const ids = await visibleTaskIds(me);

  const isManagement = me.portalRole === "manager" || me.portalRole === "hr" || me.portalRole === "director";
  const scopeNote =
    me.portalRole === "hr" || me.portalRole === "director"
      ? "Every task across all companies."
      : me.portalRole === "manager"
        ? "Your company's tasks, plus your own and your team's."
        : "Tasks assigned to you.";

  // Management roles (manager / HR / director) get the command-centre view:
  // search + live filters + inline quick-add + swipe/tap-to-edit rows.
  if (isManagement) {
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
          <ManagementTasks me={me} ids={ids} initialFilter={initialFilter} />
        </Reveal>
      </div>
    );
  }

  let rows: PortalTaskRow[] = [];
  if (ids.length > 0) {
    const [{ data: tasks }, { data: assignees }, { data: updates }] = await Promise.all([
      sb
        .from("tasks")
        .select("id,code,action_item,status,priority,deadline,owner_id,created_by_person_id,comments,requires_attachment,companies(name)")
        .in("id", ids)
        .eq("archived", false)
        .order("deadline", { ascending: true, nullsFirst: false }),
      sb.from("task_assignees").select("task_id,person_id").in("task_id", ids),
      // One batched read of every live update (newest first) for the rich-row
      // enrichment — latest body/time/author + per-task count + pinned. Mirrors
      // the admin pattern in src/lib/queries.ts (getAllTasks) so the portal twin
      // shows the same line 3/4 as the admin list. No per-task query (no N+1).
      sb
        .from("task_updates")
        .select("id,task_id,body,created_at,created_by,pinned_at")
        .in("task_id", ids)
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
    ]);

    // Owner names — one lookup for every owner referenced.
    const ownerIds = Array.from(
      new Set((tasks ?? []).map((t) => t.owner_id as number | null).filter((x): x is number => x != null))
    );
    const { data: owners } = ownerIds.length
      ? await sb.from("people").select("id,name").in("id", ownerIds)
      : { data: [] as { id: number; name: string }[] };
    const ownerName = new Map((owners ?? []).map((o) => [o.id as number, o.name as string]));

    const teamCount = new Map<number, number>();
    const onTask = new Set<number>();
    for (const r of assignees ?? []) {
      const tid = r.task_id as number;
      teamCount.set(tid, (teamCount.get(tid) ?? 0) + 1);
      if ((r.person_id as number) === me.id) onTask.add(tid);
    }

    // Fold the updates per task in a single pass. `updates` is newest-first, so
    // the first row we see for a task is its latest; we still tally count +
    // pinned. Mirrors getAllTasks in src/lib/queries.ts.
    type Upd = { id: number; task_id: number; body: string | null; created_at: string; created_by: string | null; pinned_at: string | null };
    const latestByTask = new Map<number, Upd>();
    const countByTask = new Map<number, number>();
    const pinnedByTask = new Set<number>();
    const lastActivityByTask = new Map<number, string>();
    for (const raw of updates ?? []) {
      const u = raw as unknown as Upd;
      if (!latestByTask.has(u.task_id)) {
        latestByTask.set(u.task_id, u);
        lastActivityByTask.set(u.task_id, u.created_at);
      }
      countByTask.set(u.task_id, (countByTask.get(u.task_id) ?? 0) + 1);
      if (u.pinned_at) pinnedByTask.add(u.task_id);
    }

    rows = (tasks ?? []).map((t) => {
      const tid = t.id as number;
      const latest = latestByTask.get(tid) ?? null;
      const latestActivity = latest
        ? {
            id: latest.id,
            body: (latest.body ?? "").trim(),
            author: updateAuthor(latest.created_by, me.name),
            atISO: latest.created_at,
            kind: isStatusUpdate(latest.body ?? "") ? ("status" as const) : ("comment" as const),
          }
        : null;
      // Latest signal of life: newest update, else the deadline anchor we hold.
      const lastActivityISO = lastActivityByTask.get(tid) ?? (t.deadline as string | null) ?? null;
      return {
        id: tid,
        code: t.code as string,
        actionItem: t.action_item as string,
        status: t.status as string,
        priority: t.priority as string,
        deadline: t.deadline as string | null,
        companyName: (t.companies as unknown as { name: string } | null)?.name ?? null,
        ownerName: ownerName.get((t.owner_id as number | null) ?? -1) ?? null,
        teamSize: teamCount.get(tid) ?? 1,
        mine: onTask.has(tid) || (t.owner_id as number | null) === me.id,
        raisedByMe: (t.created_by_person_id as number | null) === me.id,
        description: (t.comments as string | null) ?? null,
        latestActivity,
        updateCount: countByTask.get(tid) ?? 0,
        pinned: pinnedByTask.has(tid),
        lastActivityISO,
        requiresAttachment: (t.requires_attachment as boolean) ?? false,
        createdByPersonId: (t.created_by_person_id as number | null) ?? null,
      };
    });
  }

  // Staff: the original conversational task table.
  return (
    <div className="flex flex-col gap-5">
      <AutoRefresh seconds={30} />
      <Reveal delay={0}>
        <Hero title="Tasks" subtitle={scopeNote}>
          <div className="flex items-center gap-2 text-sm text-fg-muted">
            <ClipboardList size={15} />
            {rows.length} task{rows.length === 1 ? "" : "s"} in view
          </div>
        </Hero>
      </Reveal>
      <Reveal delay={0.05}>
        <PortalTasksTable rows={rows} canRaise={false} viewerRole={me.portalRole} viewerId={me.id} />
      </Reveal>
    </div>
  );
}

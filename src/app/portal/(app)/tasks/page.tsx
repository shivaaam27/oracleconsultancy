import { redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { sb } from "@/db/supabase";
import { Hero } from "@/components/surface-kit";
import { Reveal } from "@/components/reveal";
import { AutoRefresh } from "@/components/auto-refresh";
import { getPortalPerson, visibleTaskIds } from "@/lib/portal-auth";
import { PortalTasksTable, type PortalTaskRow } from "@/components/portal-tasks-table";

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

export default async function PortalTasksPage() {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");

  const ids = await visibleTaskIds(me);

  let rows: PortalTaskRow[] = [];
  if (ids.length > 0) {
    const [{ data: tasks }, { data: assignees }, { data: updates }] = await Promise.all([
      sb
        .from("tasks")
        .select("id,code,action_item,status,priority,deadline,owner_id,created_by_person_id,comments,companies(name)")
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
      };
    });
  }

  const canRaise = me.portalRole !== "staff";
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
            <ClipboardList size={15} />
            {rows.length} task{rows.length === 1 ? "" : "s"} in view
          </div>
        </Hero>
      </Reveal>
      <Reveal delay={0.05}>
        <PortalTasksTable rows={rows} canRaise={canRaise} viewerRole={me.portalRole} />
      </Reveal>
    </div>
  );
}

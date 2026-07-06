import "server-only";
import { sb } from "@/db/supabase";

/* Task performance analytics (Phase 3) — deterministic, owner-only. Powers ORI
 * answers like "how efficient is X", "how many tasks did Y complete", "X's
 * response rate". All maths here; the resolvers/AI just phrase it. */

const DAY = 86_400_000;
const OPEN_STATUSES = ["Completed", "Closed"];

/** Task ids a person is ON (owner or assignee). */
export async function taskIdsForPerson(personId: number): Promise<number[]> {
  const [{ data: owned }, { data: links }] = await Promise.all([
    sb.from("tasks").select("id").eq("archived", false).eq("owner_id", personId),
    sb.from("task_assignees").select("task_id").eq("person_id", personId),
  ]);
  return [...new Set([
    ...((owned ?? []) as { id: number }[]).map((r) => r.id),
    ...((links ?? []) as { task_id: number }[]).map((r) => r.task_id),
  ])];
}

export type CompletionStats = {
  completed: number;
  avgDays: number | null;      // avg (closed − created) over completed tasks with both dates
  onTime: number;              // completed on/before deadline
  onTimePct: number | null;    // of those with a deadline
};

/** Completion + efficiency for a person (or the whole portfolio if no id). */
export async function completionStats(personId?: number): Promise<CompletionStats> {
  let ids: number[] | null = null;
  if (personId != null) {
    ids = await taskIdsForPerson(personId);
    if (ids.length === 0) return { completed: 0, avgDays: null, onTime: 0, onTimePct: null };
  }
  let q = sb.from("tasks").select("created_date,closed_date,deadline,status").eq("archived", false).in("status", OPEN_STATUSES);
  if (ids) q = q.in("id", ids);
  const { data } = await q.limit(2000);
  const rows = (data ?? []) as { created_date: string | null; closed_date: string | null; deadline: string | null }[];

  let durSum = 0, durN = 0, withDeadline = 0, onTime = 0;
  for (const r of rows) {
    if (r.created_date && r.closed_date) {
      const d = (new Date(r.closed_date).getTime() - new Date(r.created_date).getTime()) / DAY;
      if (d >= 0) { durSum += d; durN++; }
    }
    if (r.deadline && r.closed_date) {
      withDeadline++;
      if (new Date(r.closed_date).getTime() <= new Date(r.deadline).getTime() + DAY) onTime++;
    }
  }
  return {
    completed: rows.length,
    avgDays: durN ? Math.round((durSum / durN) * 10) / 10 : null,
    onTime,
    onTimePct: withDeadline ? Math.round((onTime / withDeadline) * 100) : null,
  };
}

export type ResponseStats = {
  assigned: number;            // open+closed tasks the person is on
  responded: number;           // tasks with at least one update by anyone
  responseRatePct: number | null;
  avgFirstResponseDays: number | null; // avg (first update − created)
};

/** How responsive a person is on their tasks (do updates get posted, how fast). */
export async function responseStats(personId: number): Promise<ResponseStats> {
  const ids = await taskIdsForPerson(personId);
  if (ids.length === 0) return { assigned: 0, responded: 0, responseRatePct: null, avgFirstResponseDays: null };

  const { data: tasks } = await sb.from("tasks").select("id,created_date").in("id", ids);
  const createdById = new Map(((tasks ?? []) as { id: number; created_date: string | null }[]).map((t) => [t.id, t.created_date]));

  const { data: updates } = await sb.from("task_updates")
    .select("task_id,created_at").in("task_id", ids).is("deleted_at", null).order("created_at", { ascending: true });
  const firstUpdate = new Map<number, string>();
  for (const u of ((updates ?? []) as { task_id: number; created_at: string }[])) {
    if (!firstUpdate.has(u.task_id)) firstUpdate.set(u.task_id, u.created_at);
  }

  let respSum = 0, respN = 0;
  for (const [tid, created] of createdById) {
    const fu = firstUpdate.get(tid);
    if (fu && created) {
      const d = (new Date(fu).getTime() - new Date(created).getTime()) / DAY;
      if (d >= 0) { respSum += d; respN++; }
    }
  }
  const responded = firstUpdate.size;
  return {
    assigned: ids.length,
    responded,
    responseRatePct: ids.length ? Math.round((responded / ids.length) * 100) : null,
    avgFirstResponseDays: respN ? Math.round((respSum / respN) * 10) / 10 : null,
  };
}

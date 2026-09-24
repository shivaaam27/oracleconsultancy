import { NextResponse } from "next/server";
import { sb } from "@/db/supabase";
import { isAdminSession } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Admin op: re-derive tasks.latest_update + tasks.last_updated_at from the
 * latest non-deleted row in task_updates for each task. Used to repair drift
 * after bulk edits, manual SQL, or deleted updates.
 *
 * Pure HTTP because it's a one-shot admin button on /audit. POST only.
 *
 * Defence-in-depth (ACTPORTAL-03): the edge gate (src/proxy.ts) already covers
 * /api/admin, but this is a bulk-write maintenance op, so it re-checks the admin
 * session itself — it must never be reachable unauthenticated if a future
 * matcher change ever exempts it.
 */
export async function POST() {
  if (!(await isAdminSession())) {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 401 });
  }
  // Pull every task id + its latest non-deleted update.
  const { data: tasks, error: tErr } = await sb.from("tasks").select("id");
  if (tErr) return NextResponse.json({ ok: false, error: tErr.message }, { status: 500 });

  const { data: allUpdates, error: uErr } = await sb
    .from("task_updates")
    .select("task_id,body,created_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (uErr) return NextResponse.json({ ok: false, error: uErr.message }, { status: 500 });

  // Reduce to one (latest) update per task.
  const latestByTask = new Map<number, { body: string; created_at: string }>();
  for (const u of (allUpdates ?? []) as Array<{ task_id: number; body: string; created_at: string }>) {
    if (!latestByTask.has(u.task_id)) {
      latestByTask.set(u.task_id, { body: u.body, created_at: u.created_at });
    }
  }

  // Only the summary line is re-derived, and only where it has drifted. It used
  // to rewrite last_updated_at to the last note's time too — which threw away
  // every later edit and made 55 of 184 tasks look stalled overnight — and it
  // blanked a summary typed on the form for tasks with no notes (audit 24 Sept
  // 2026). A task with no notes is left exactly as it is.
  const { data: current } = await sb.from("tasks").select("id,latest_update");
  const now = new Map(((current ?? []) as Array<{ id: number; latest_update: string | null }>).map((t) => [t.id, t.latest_update]));
  let updated = 0;
  const cleared = 0;
  for (const t of (tasks ?? []) as Array<{ id: number }>) {
    const latest = latestByTask.get(t.id);
    if (!latest || now.get(t.id) === latest.body) continue;
    const { error } = await sb.from("tasks").update({ latest_update: latest.body }).eq("id", t.id);
    if (!error) updated++;
  }

  return NextResponse.json({ ok: true, scanned: tasks?.length ?? 0, updated, cleared });
}

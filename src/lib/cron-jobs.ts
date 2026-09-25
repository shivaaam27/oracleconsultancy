/**
 * The bodies of the daily housekeeping jobs, in ONE place (26 Sept 2026).
 *
 * The cron routes and the watchdog's self-repair (lib/system-repair.ts) both
 * call these. Before, the repair kept its own copies and they drifted — the
 * repaired "cleanup" only cleared undo tokens, and the repaired reminders lost
 * the note deep-link. A job has one body; how it was started is the caller's
 * business.
 */
import { sb } from "@/db/supabase";
import { getAllTasks, computeCompanyKpis } from "@/lib/queries";

/** One KPI row per company for today (idempotent upsert). */
export async function runSnapshots(): Promise<{ written: number; snapshotDate: string }> {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const snapshotDate = d.toISOString();
  const kpis = computeCompanyKpis(await getAllTasks());
  let written = 0;
  for (const k of kpis) {
    const { error } = await sb.from("daily_snapshots").upsert(
      {
        snapshot_date: snapshotDate,
        company_id: k.id,
        total: k.total, open: k.open, overdue: k.overdue, due_soon: k.dueSoon,
        blocked: k.blocked, critical: k.critical, escalated: k.escalated,
        completed: k.completed, closed: k.closed, risk_score: k.riskScore,
      },
      { onConflict: "company_id,snapshot_date" },
    );
    if (error) throw new Error(error.message);
    written++;
  }
  return { written, snapshotDate };
}

/** Expired undo tokens, spent MCP sign-in codes and finished MCP grants.
 *  Revoked grants are KEPT — they are the record of what was once connected. */
export async function runCleanup(): Promise<{ undoTokensDeleted: number; codesDeleted: number; grantsDeleted: number }> {
  const nowIso = new Date().toISOString();
  const { data: deleted, error } = await sb.from("undo_tokens").delete().lt("expires_at", nowIso).select("id");
  if (error) throw new Error(error.message);
  let codesDeleted = 0;
  try {
    const { data } = await sb.from("mcp_oauth_codes").delete().lt("expires_at", nowIso).select("id");
    codesDeleted = (data ?? []).length;
  } catch { /* housekeeping — never fail the run over it */ }
  let grantsDeleted = 0;
  try {
    const { data } = await sb.from("mcp_oauth_tokens").delete().lt("refresh_expires_at", nowIso).select("id");
    grantsDeleted = (data ?? []).length;
  } catch { /* ditto */ }
  return { undoTokensDeleted: (deleted ?? []).length, codesDeleted, grantsDeleted };
}

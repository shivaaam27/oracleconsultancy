import { NextResponse } from "next/server";
import { sb } from "@/db/supabase";
import { lastEvent } from "@/lib/system-events";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, unknown> = {};
  let ok = true;

  // DB ping
  try {
    const { error } = await sb.from("companies").select("id").limit(1);
    checks.db = error ? error.message : "ok";
    if (error) ok = false;
  } catch (err) {
    ok = false;
    checks.db = err instanceof Error ? err.message : "error";
  }

  // Last cron runs
  try {
    const [snap, cleanup, heartbeat] = await Promise.all([
      lastEvent("cron.snapshots"),
      lastEvent("cron.cleanup"),
      lastEvent("heartbeat"),
    ]);
    checks.lastSnapshot = snap;
    checks.lastCleanup = cleanup;
    checks.lastHeartbeat = heartbeat;
  } catch {
    checks.events = "error";
  }

  // Active undo tokens (non-expired, non-consumed)
  try {
    const nowIso = new Date().toISOString();
    const { count } = await sb
      .from("undo_tokens")
      .select("id", { count: "exact", head: true })
      .is("consumed_at", null)
      .gte("expires_at", nowIso);
    checks.activeUndoTokens = count ?? 0;
  } catch {
    checks.activeUndoTokens = "error";
  }

  return NextResponse.json(
    { ok, time: new Date().toISOString(), checks },
    { status: ok ? 200 : 503 }
  );
}

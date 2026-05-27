import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { sql, isNull, and, gte } from "drizzle-orm";
import { lastEvent } from "@/lib/system-events";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, unknown> = {};
  let ok = true;

  // DB ping
  try {
    await db.execute(sql`select 1`);
    checks.db = "ok";
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
    const rows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.undoTokens)
      .where(and(isNull(schema.undoTokens.consumedAt), gte(schema.undoTokens.expiresAt, new Date())));
    checks.activeUndoTokens = rows[0]?.count ?? 0;
  } catch {
    checks.activeUndoTokens = "error";
  }

  return NextResponse.json(
    { ok, time: new Date().toISOString(), checks },
    { status: ok ? 200 : 503 }
  );
}

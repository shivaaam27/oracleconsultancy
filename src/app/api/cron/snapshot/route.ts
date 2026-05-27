import { NextResponse } from "next/server";
import { sb } from "@/db/supabase";
import { getAllTasks, computeCompanyKpis } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Daily snapshot writer.
 *
 * One row per company per day, upserted via the unique
 * (company_id, snapshot_date) index. Safe to call multiple times in a day —
 * the row for today is overwritten with current counts each time.
 *
 * Auth: requires `Authorization: Bearer <CRON_SECRET>` (set CRON_SECRET in env).
 * Scheduled by .github/workflows/daily-snapshot.yml.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") || "";
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const rows = await getAllTasks();
  const kpis = computeCompanyKpis(rows);

  // Snapshot date = today at 00:00 UTC. The unique index pins one row per day.
  const today = new Date();
  const snapshotDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const snapshotIso = snapshotDate.toISOString();

  const payload = kpis.map((k) => ({
    company_id: k.id,
    snapshot_date: snapshotIso,
    total: k.total,
    open: k.open,
    overdue: k.overdue,
    due_soon: k.dueSoon,
    blocked: k.blocked,
    critical: k.critical,
    escalated: k.escalated,
    completed: k.completed,
    closed: k.closed,
    risk_score: k.riskScore,
  }));

  if (payload.length === 0) {
    return NextResponse.json({ ok: true, wrote: 0, snapshotDate: snapshotIso });
  }

  const { error } = await sb
    .from("daily_snapshots")
    .upsert(payload, { onConflict: "company_id,snapshot_date" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    wrote: payload.length,
    snapshotDate: snapshotIso,
    companies: kpis.map((k) => ({ id: k.id, name: k.name, open: k.open, overdue: k.overdue, riskScore: k.riskScore })),
  });
}

// Allow POST too so cron-tooling that defaults to POST still works.
export const POST = GET;

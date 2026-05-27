import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { getAllTasks, computeCompanyKpis } from "@/lib/queries";
import { authoriseCron } from "@/lib/cron-auth";
import { recordEvent } from "@/lib/system-events";
import { reportError } from "@/lib/sentry";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function GET(req: NextRequest) {
  const auth = authoriseCron(req);
  if (!auth.ok) return NextResponse.json({ ok: false, message: auth.message }, { status: auth.status });

  const snapshotDate = startOfToday();
  try {
    const tasks = await getAllTasks();
    const kpis = computeCompanyKpis(tasks);

    let written = 0;
    for (const k of kpis) {
      // Idempotent upsert via the unique (company_id, snapshot_date) index.
      await db
        .insert(schema.dailySnapshots)
        .values({
          snapshotDate,
          companyId: k.id,
          total: k.total,
          open: k.open,
          overdue: k.overdue,
          dueSoon: k.dueSoon,
          blocked: k.blocked,
          critical: k.critical,
          escalated: k.escalated,
          completed: k.completed,
          closed: k.closed,
          riskScore: k.riskScore,
        })
        .onConflictDoUpdate({
          target: [schema.dailySnapshots.companyId, schema.dailySnapshots.snapshotDate],
          set: {
            total: k.total,
            open: k.open,
            overdue: k.overdue,
            dueSoon: k.dueSoon,
            blocked: k.blocked,
            critical: k.critical,
            escalated: k.escalated,
            completed: k.completed,
            closed: k.closed,
            riskScore: k.riskScore,
          },
        });
      written++;
    }

    await recordEvent("cron.snapshots", "ok", { written, snapshotDate: snapshotDate.toISOString() });
    return NextResponse.json({ ok: true, written, snapshotDate: snapshotDate.toISOString() });
  } catch (err) {
    await reportError(err, { route: "cron.snapshots" });
    await recordEvent("cron.snapshots", "error", {
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ ok: false, message: "Snapshot run failed." }, { status: 500 });
  }
}

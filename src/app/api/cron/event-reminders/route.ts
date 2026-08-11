// /api/cron/event-reminders — "your 3 o'clock is in an hour".
//
// Sweeps the calendar and delivers every reminder that has fallen due since the
// last sweep (push + the person's Reminders chat channel, plus the branded email
// when that's switched on). See src/lib/event-reminders.ts for the rules.
//
// ── HOW OFTEN IT RUNS ─────────────────────────────────────────────────────────
// Reminders are only as punctual as the sweep. Two schedules drive it:
//
//   1. vercel.json runs it daily at 05:00 UTC (08:00 EAT) — the floor. On its own
//      that reliably delivers "the day before" style reminders, but a "30 minutes
//      before" reminder would land at 8am, not 30 minutes before.
//   2. /api/cron/tick runs it too. Point a free external scheduler (cron-job.org,
//      EasyCron, a GitHub Actions schedule) at that URL every 5–15 minutes and
//      reminders land on time. This is the setup that makes short lead times work.
//
// Running it often is harmless: every reminder fires at most once, remembered by
// a pruned ledger in `settings`.

import { NextRequest, NextResponse } from "next/server";
import { authoriseCron } from "@/lib/cron-auth";
import { recordEvent } from "@/lib/system-events";
import { reportError } from "@/lib/sentry";
import { runEventReminders } from "@/lib/event-reminders";
import { backfillGoogleEvents } from "@/lib/calendar-google-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = authoriseCron(req);
  if (!auth.ok) return NextResponse.json({ ok: false, message: auth.message }, { status: auth.status });

  try {
    // Re-try any upcoming event that never reached Google (a create-time push can
    // fail transiently). Independently guarded so it can't cost us the reminders.
    let backfill = null;
    try {
      backfill = await backfillGoogleEvents();
    } catch (err) {
      reportError(err, { route: "cron/event-reminders/backfill" });
    }

    const r = await runEventReminders();
    await recordEvent("cron.event-reminders", "ok", { ...r, backfilled: backfill?.pushed ?? 0 });
    return NextResponse.json({ ok: true, ...r, backfill });
  } catch (err) {
    reportError(err, { route: "cron/event-reminders" });
    await recordEvent("cron.event-reminders", "error", { message: String(err) });
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

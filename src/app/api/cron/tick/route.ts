// /api/cron/tick — a SECURED heartbeat for an EXTERNAL scheduler.
//
// WHY: Vercel's cron only fires the ORI automation sweep once a day, but
// smart_reminder rules carry a TIME-OF-DAY trigger (e.g. "by 11:00") that needs a
// finer tick to fire on time. Point a free external scheduler at this URL every
// 15–60 minutes and the same sweep runs precisely when a rule's window opens.
//
// IT RUNS THE EXACT SAME SWEEP as /api/cron/ori-automations (runDueRules) — it does
// NOT duplicate any firing logic. It's idempotent: every rule fires at most once per
// day-slot (lastFiredKey / last_fired_at dedupe), so pinging 100×/day is harmless.
// Fail-open, returns a small JSON summary.
//
// ── OWNER SETUP ────────────────────────────────────────────────────────────────
//   1) Env var (already used by every other cron route): CRON_SECRET=<a long random
//      string> — set it in .env.local AND in Vercel (Project → Settings → Env Vars).
//   2) Give your scheduler this URL (key in the query string, or as an "x-cron-key"
//      header):
//         https://<your-app>/api/cron/tick?key=<CRON_SECRET>
//      e.g. https://oracleconsultancy.vercel.app/api/cron/tick?key=YOUR_SECRET
//   3) Cadence: hourly is plenty; every 15 min for tighter time-of-day firing.
//   4) Free schedulers that can hit a URL on a cron:
//        · cron-job.org (free, simple URL pinger — recommended)
//        · EasyCron (free tier)
//        · GitHub Actions `schedule:` workflow (a curl step; free for public repos)
//   Do NOT add this to vercel.json — the whole point is the EXTERNAL scheduler.

import { NextRequest, NextResponse } from "next/server";
import { runDueRules } from "@/app/api/cron/ori-automations/route";
import { recordEvent } from "@/lib/system-events";
import { reportError } from "@/lib/sentry";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Accept the secret via `?key=` OR an `x-cron-key` header, compared to CRON_SECRET
 *  (the same secret every other cron route uses). Mismatch → 401. In production a
 *  missing CRON_SECRET rejects (a forgotten env var must not leave this open); in
 *  local dev, a missing secret is allowed for convenience. */
function authoriseTick(req: NextRequest): { ok: true } | { ok: false; status: number; message: string } {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") return { ok: false, status: 503, message: "CRON_SECRET is not configured." };
    return { ok: true };
  }
  const supplied = req.nextUrl.searchParams.get("key") || req.headers.get("x-cron-key") || "";
  // Also accept the Bearer form so the standard Vercel-cron header works too.
  const bearer = req.headers.get("authorization") || "";
  if (supplied === secret || bearer === `Bearer ${secret}`) return { ok: true };
  return { ok: false, status: 401, message: "Unauthorised." };
}

async function tick(req: NextRequest) {
  const auth = authoriseTick(req);
  if (!auth.ok) return NextResponse.json({ ok: false, message: auth.message }, { status: auth.status });
  try {
    const { evaluated, fired, retired } = await runDueRules();
    await recordEvent("cron.tick", "ok", { evaluated, fired, retired });
    return NextResponse.json({ ok: true, ran: evaluated, fired, retired });
  } catch (err) {
    // Fail-open: report + a soft 200 so a flaky sweep doesn't make the scheduler
    // hammer with retries; the next tick simply tries again.
    await reportError(err, { route: "cron.tick" });
    await recordEvent("cron.tick", "error", { message: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ ok: false, ran: 0, fired: 0 });
  }
}

export const GET = tick;
export const POST = tick; // some schedulers only do POST

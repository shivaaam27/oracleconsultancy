import { NextRequest, NextResponse } from "next/server";
import { authoriseCron } from "@/lib/cron-auth";
import { recordEvent } from "@/lib/system-events";
import { reportError } from "@/lib/sentry";
import { runDueAutomations } from "@/lib/email-automation";

export const dynamic = "force-dynamic";

/**
 * Email-automation dispatcher. Safe to hit frequently (e.g. an external pinger
 * every ~15 min) — each daily category runs at most once per EAT day, and the
 * engine enforces the send window + pause. Secured by CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const auth = authoriseCron(req);
  if (!auth.ok) return NextResponse.json({ ok: false, message: auth.message }, { status: auth.status });

  try {
    const summary = await runDueAutomations();
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    await reportError(err, { route: "cron.email" });
    await recordEvent("cron.email", "error", { message: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ ok: false, message: "Email automation run failed." }, { status: 500 });
  }
}

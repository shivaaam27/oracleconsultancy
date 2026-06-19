import { NextRequest, NextResponse } from "next/server";
import { authoriseCron } from "@/lib/cron-auth";
import { recordEvent } from "@/lib/system-events";
import { reportError } from "@/lib/sentry";
import { runTimeAutomations } from "@/lib/automation-time";

export const dynamic = "force-dynamic";

// Phase 2 time automations: each day, create the work that a passing date implies
// — a renewal task for an expiring/expired document, a notice task for a lease /
// insurance / contract entering its notice window. Idempotent (dedup guards), so
// a daily run never piles up duplicates. Everything it creates is logged to the
// Automations feed and is undoable.
export async function GET(req: NextRequest) {
  const auth = authoriseCron(req);
  if (!auth.ok) return NextResponse.json({ ok: false, message: auth.message }, { status: auth.status });

  try {
    const res = await runTimeAutomations();
    return NextResponse.json({ ok: true, ...res });
  } catch (err) {
    await reportError(err, { route: "cron.automations" });
    await recordEvent("cron.automations", "error", { message: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ ok: false, message: "Automations run failed." }, { status: 500 });
  }
}

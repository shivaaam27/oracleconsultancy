import { NextRequest, NextResponse } from "next/server";
import { authoriseCron } from "@/lib/auth/cron-auth";
import { recordEvent } from "@/lib/system-events";
import { reportError } from "@/lib/sentry";
import { runCleanup } from "@/lib/automation/cron-jobs";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = authoriseCron(req);
  if (!auth.ok) return NextResponse.json({ ok: false, message: auth.message }, { status: auth.status });
  try {
    const r = await runCleanup();
    await recordEvent("cron.cleanup", "ok", r);
    await recordEvent("heartbeat", "ok");
    return NextResponse.json({ ok: true, ...r });
  } catch (err) {
    await reportError(err, { route: "cron.cleanup" });
    await recordEvent("cron.cleanup", "error", { message: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ ok: false, message: "Cleanup run failed." }, { status: 500 });
  }
}

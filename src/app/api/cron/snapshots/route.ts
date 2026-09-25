import { NextRequest, NextResponse } from "next/server";
import { authoriseCron } from "@/lib/cron-auth";
import { recordEvent } from "@/lib/system-events";
import { reportError } from "@/lib/sentry";
import { runSnapshots } from "@/lib/cron-jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = authoriseCron(req);
  if (!auth.ok) return NextResponse.json({ ok: false, message: auth.message }, { status: auth.status });
  try {
    const r = await runSnapshots();
    await recordEvent("cron.snapshots", "ok", r);
    return NextResponse.json({ ok: true, ...r });
  } catch (err) {
    await reportError(err, { route: "cron.snapshots" });
    await recordEvent("cron.snapshots", "error", { message: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ ok: false, message: "Snapshot run failed." }, { status: 500 });
  }
}

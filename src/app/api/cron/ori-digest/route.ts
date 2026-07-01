// Proactive ORI — enqueues a daily "what needs attention" digest job. The ORI
// worker (Max plan) answers it grounded in live data; the answer is stored on the
// job (and posted to a thread when one is set). memory/cloud_agent_plan.md Phase 5.
// Schedule in vercel.json (e.g. weekday mornings).

import { NextRequest, NextResponse } from "next/server";
import { authoriseCron } from "@/lib/cron-auth";
import { recordEvent } from "@/lib/system-events";
import { reportError } from "@/lib/sentry";
import { enqueueDigest } from "@/lib/agent-enqueue";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = authoriseCron(req);
  if (!auth.ok) return NextResponse.json({ ok: false, message: auth.message }, { status: auth.status });
  try {
    const job = await enqueueDigest();
    await recordEvent("cron.oriDigest", "ok", { jobId: job.id });
    return NextResponse.json({ ok: true, jobId: job.id });
  } catch (err) {
    await reportError(err, { route: "cron.oriDigest" });
    await recordEvent("cron.oriDigest", "error", { message: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ ok: false, message: "Could not enqueue digest." }, { status: 500 });
  }
}

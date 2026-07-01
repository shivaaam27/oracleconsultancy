import { NextRequest, NextResponse } from "next/server";
import { pendingCount } from "@/lib/ai-jobs";

export const dynamic = "force-dynamic";

/**
 * POST /api/agent/trigger — the "wake the cloud agent" endpoint.
 *
 * The live app calls this the instant a fast-lane job is queued (event-driven
 * wake, memory/cloud_agent_plan.md). Phase 0: it authenticates the caller and
 * reports the pending queue. Phase 4 wires the actual remote wake (a signal to
 * the Claude Code cloud routine); until then a 1-minute cloud-cron heartbeat
 * drains the queue, so nothing is ever missed even without the live wake.
 *
 * Auth: shared secret in the `x-agent-secret` header, matched against
 * AGENT_TRIGGER_SECRET. Never exposed to the browser.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.AGENT_TRIGGER_SECRET;
  if (!secret || req.headers.get("x-agent-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const [fast, batch] = await Promise.all([pendingCount("fast"), pendingCount("batch")]);
  // TODO(Phase 4): fire the remote wake here (RemoteTrigger) when fast > 0.
  return NextResponse.json({ ok: true, pending: { fast, batch }, wake: fast > 0 });
}

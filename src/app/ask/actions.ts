"use server";

import { enqueueJob, getJob } from "@/lib/ai-jobs";

/**
 * Ask ORI (cloud-agent engine). Instead of calling an AI provider, we ENQUEUE a
 * fast-lane `ask` job; the ORI worker (Claude Code on the Max plan) answers it and
 * writes the result back. The UI polls `pollAsk` until it's done. No API key.
 * See memory/cloud_agent_plan.md.
 */

export async function askOri(
  question: string,
  opts?: { history?: { role: "user" | "assistant"; content: string }[]; pageContext?: Record<string, unknown>; threadId?: number },
): Promise<{ jobId: number }> {
  const q = (question ?? "").trim();
  if (!q) throw new Error("Type a question first.");
  const job = await enqueueJob({
    kind: "ask", lane: "fast",
    payload: { question: q, history: opts?.history ?? [], pageContext: opts?.pageContext ?? null },
    threadId: opts?.threadId ?? null, requestedBy: "web-ui",
  });
  // Best-effort event wake (Phase 4b wires the real remote trigger; until then the
  // ori-worker's short poll picks it up). Never blocks the ask.
  void wake();
  return { jobId: job.id };
}

export async function pollAsk(jobId: number): Promise<{ status: string; answer: string | null; error: string | null }> {
  const job = await getJob(jobId);
  if (!job) return { status: "error", answer: null, error: "Job not found." };
  return {
    status: job.status,
    answer: (job.result?.answer as string | undefined) ?? null,
    error: job.error,
  };
}

/** Fire the wake endpoint so the agent runs now rather than on its next poll. */
async function wake(): Promise<void> {
  try {
    const secret = process.env.AGENT_TRIGGER_SECRET;
    const base = process.env.NEXT_PUBLIC_APP_URL;
    if (!secret || !base) return;
    await fetch(`${base}/api/agent/trigger`, {
      method: "POST",
      headers: { "x-agent-secret": secret },
    });
  } catch {
    /* best-effort */
  }
}

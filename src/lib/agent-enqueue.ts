import { enqueueJob } from "./ai-jobs";

/**
 * agent-enqueue.ts — thin, app-facing helpers to drop work on the ORI queue. The
 * cloud-agent worker (Max plan) does the rest. One place so every surface enqueues
 * consistently (memory/cloud_agent_plan.md).
 */

/** Ask ORI a question (fast lane). Optionally posts the answer to a chat thread. */
export async function enqueueAsk(question: string, opts?: { threadId?: number; requestedBy?: string }) {
  return enqueueJob({
    kind: "ask", lane: "fast", payload: { question },
    threadId: opts?.threadId ?? null, requestedBy: opts?.requestedBy ?? "web-ui",
  });
}

/** Turn a natural-language request into an action (meeting/task/reminder). */
export async function enqueueAction(request: string, opts?: { confirmed?: boolean; requestedBy?: string }) {
  return enqueueJob({
    kind: "action", lane: "fast",
    payload: { request, confirmed: opts?.confirmed ?? false },
    requestedBy: opts?.requestedBy ?? "web-ui", tier: 2,
  });
}

/** Proactive daily digest — "what needs attention today", answered + posted. */
export async function enqueueDigest(opts?: { threadId?: number }) {
  return enqueueJob({
    kind: "ask", lane: "batch",
    payload: {
      question:
        "Give the owner a short morning digest: what needs attention today across all companies — " +
        "overdue tasks, items due soon, blocked work, expiring documents, and anything unusual. " +
        "Be concise, grouped, and cite task codes / document titles.",
    },
    threadId: opts?.threadId ?? null, requestedBy: "system",
  });
}

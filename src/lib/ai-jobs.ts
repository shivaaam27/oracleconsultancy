// NB: no `server-only` — the cloud-agent runner (scripts/agent-runner.ts) imports
// this from plain node/tsx. `@/db/supabase` (sb) already gates it to the server
// (throws without SUPABASE_SERVICE_ROLE_KEY), so it can't reach a client bundle.
import { sb } from "@/db/supabase";

/**
 * ai-jobs.ts — the queue that lets the Claude Code cloud agent power the site
 * WITHOUT an API key (memory/cloud_agent_plan.md). The app ENQUEUES jobs; a cloud
 * routine (owner's Max plan, PC-independent) CLAIMS + completes them, writing back.
 *
 * Two lanes: "fast" (interactive — chat, quick actions; woken by a trigger) and
 * "batch" (heavy/scheduled — document extraction, curation). Claiming is atomic
 * via the claim_next_ai_job() Postgres function (FOR UPDATE SKIP LOCKED), so two
 * concurrent runners never grab the same job.
 */

export type AiJobKind = "ping" | "ask" | "action";
export type AiJobLane = "fast" | "batch";
export type AiJobStatus = "queued" | "running" | "done" | "error";

export type AiJob = {
  id: number;
  kind: string;
  status: AiJobStatus;
  lane: AiJobLane;
  priority: number;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: string | null;
  requestedBy: string | null;
  threadId: number | null;
  tier: number;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  pickedAt: string | null;
  finishedAt: string | null;
  undoToken: string | null;
};

function fromRow(r: Record<string, unknown>): AiJob {
  return {
    id: r.id as number,
    kind: r.kind as string,
    status: r.status as AiJobStatus,
    lane: (r.lane as AiJobLane) ?? "batch",
    priority: (r.priority as number) ?? 0,
    payload: (r.payload as Record<string, unknown>) ?? {},
    result: (r.result as Record<string, unknown> | null) ?? null,
    error: (r.error as string | null) ?? null,
    requestedBy: (r.requested_by as string | null) ?? null,
    threadId: (r.thread_id as number | null) ?? null,
    tier: (r.tier as number) ?? 1,
    attempts: (r.attempts as number) ?? 0,
    maxAttempts: (r.max_attempts as number) ?? 3,
    createdAt: r.created_at as string,
    pickedAt: (r.picked_at as string | null) ?? null,
    finishedAt: (r.finished_at as string | null) ?? null,
    undoToken: (r.undo_token as string | null) ?? null,
  };
}

/** Add a job to the queue. Fast-lane jobs default to higher priority. */
export async function enqueueJob(input: {
  kind: AiJobKind | string;
  lane?: AiJobLane;
  priority?: number;
  payload?: Record<string, unknown>;
  requestedBy?: string;
  threadId?: number | null;
  tier?: number;
}): Promise<AiJob> {
  const lane = input.lane ?? "batch";
  const { data, error } = await sb
    .from("ai_jobs")
    .insert({
      kind: input.kind,
      lane,
      priority: input.priority ?? (lane === "fast" ? 100 : 0),
      payload: input.payload ?? {},
      requested_by: input.requestedBy ?? "system",
      thread_id: input.threadId ?? null,
      tier: input.tier ?? 1,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return fromRow(data as Record<string, unknown>);
}

/** Atomically claim the next queued job (optionally scoped to one lane and/or a
 *  set of kinds). Returns null when the queue is empty. The deterministic runner
 *  claims mechanical kinds; the AI cloud agent claims the intelligence kinds — so
 *  they never fight over the same job. */
export async function claimNextJob(lane?: AiJobLane, kinds?: string[]): Promise<AiJob | null> {
  const { data, error } = await sb.rpc("claim_next_ai_job", {
    p_lane: lane ?? null,
    p_kinds: kinds && kinds.length ? kinds : null,
  });
  if (error) throw new Error(error.message);
  const rows = (data as Record<string, unknown>[]) ?? [];
  return rows.length ? fromRow(rows[0]) : null;
}

/** Mark a claimed job done, storing its result. */
export async function completeJob(id: number, result: Record<string, unknown>, undoToken?: string): Promise<void> {
  const { error } = await sb
    .from("ai_jobs")
    .update({ status: "done", result, finished_at: new Date().toISOString(), undo_token: undoToken ?? null })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/** Mark a job failed. Re-queues for another attempt unless max_attempts reached. */
export async function failJob(id: number, message: string): Promise<void> {
  const { data } = await sb.from("ai_jobs").select("attempts,max_attempts").eq("id", id).maybeSingle();
  const attempts = (data?.attempts as number) ?? 0;
  const max = (data?.max_attempts as number) ?? 3;
  const retryable = attempts < max;
  const { error } = await sb
    .from("ai_jobs")
    .update(retryable ? { status: "queued", error: message } : { status: "error", error: message, finished_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Recover jobs stuck in "running" — a worker that claimed a job but died/hung
 * (headless `claude -p` can hang) would otherwise leave it "running" forever, so
 * the UI polls "Thinking…" with no end. Any job whose pick is older than
 * `staleMinutes` is either re-queued for another attempt or, once out of
 * attempts, marked "error" so the caller gets a clear message instead of an
 * infinite spinner. Safe to call every tick — it only touches genuinely stale rows.
 * Returns how many jobs it reaped.
 */
export async function reapStaleJobs(staleMinutes = 4): Promise<number> {
  const cutoff = new Date(Date.now() - staleMinutes * 60_000).toISOString();
  const { data } = await sb
    .from("ai_jobs")
    .select("id,attempts,max_attempts")
    .eq("status", "running")
    .lt("picked_at", cutoff);
  const stale = (data as Record<string, unknown>[]) ?? [];
  for (const j of stale) {
    const attempts = (j.attempts as number) ?? 0;
    const max = (j.max_attempts as number) ?? 3;
    const retryable = attempts < max;
    await sb
      .from("ai_jobs")
      .update(
        retryable
          ? { status: "queued", error: "worker stalled — retrying" }
          : { status: "error", error: "worker stalled and out of attempts", finished_at: new Date().toISOString() },
      )
      .eq("id", j.id as number);
  }
  return stale.length;
}

/** Count of jobs waiting, by lane — drives the "wake the agent?" decision. */
export async function pendingCount(lane?: AiJobLane): Promise<number> {
  let q = sb.from("ai_jobs").select("id", { count: "exact", head: true }).eq("status", "queued");
  if (lane) q = q.eq("lane", lane);
  const { count } = await q;
  return count ?? 0;
}

export async function getJob(id: number): Promise<AiJob | null> {
  const { data } = await sb.from("ai_jobs").select("*").eq("id", id).maybeSingle();
  return data ? fromRow(data as Record<string, unknown>) : null;
}

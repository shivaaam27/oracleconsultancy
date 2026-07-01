/**
 * agent-complete.ts — the cloud agent runs this to SUBMIT its result for a claimed
 * job. It applies the real side-effect (post answer / file doc / create meeting etc.
 * via agent-apply.ts) and marks the job done. On failure it re-queues (up to
 * max_attempts) so nothing is silently lost.
 *
 *   npx tsx scripts/agent-complete.ts <jobId> <result.json>   # result from a file
 *   npx tsx scripts/agent-complete.ts <jobId> '{"answer":"…"}' # result inline
 *   echo '{...}' | npx tsx scripts/agent-complete.ts <jobId>   # result from stdin
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { readFileSync, existsSync } from "fs";

async function readResult(arg: string | undefined): Promise<Record<string, unknown>> {
  let raw = arg;
  if (raw && existsSync(raw)) raw = readFileSync(raw, "utf8");
  if (!raw) raw = readFileSync(0, "utf8"); // stdin
  return JSON.parse(raw) as Record<string, unknown>;
}

async function main() {
  const jobId = Number(process.argv[2]);
  if (!jobId) { console.error("usage: agent-complete.ts <jobId> <result.json|json|-stdin>"); process.exit(1); }

  const { getJob, completeJob, failJob } = await import("@/lib/ai-jobs");
  const { applyResult } = await import("@/lib/agent-apply");

  const job = await getJob(jobId);
  if (!job) { console.error(`job #${jobId} not found`); process.exit(1); }

  try {
    const result = await readResult(process.argv[3]);
    const outcome = await applyResult(job, result);
    await completeJob(jobId, { ...result, _applied: outcome.applied, _detail: outcome.detail });
    console.log(JSON.stringify({ ok: true, jobId, applied: outcome.applied, detail: outcome.detail }));
    process.exit(0);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await failJob(jobId, msg);
    console.error(JSON.stringify({ ok: false, jobId, error: msg }));
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

/**
 * agent-runner.ts — the loop the Claude Code CLOUD ROUTINE runs (owner's Max plan,
 * PC-independent). It drains the ai_jobs queue: claim → dispatch by kind → write
 * the result back. No API key — the intelligence is the cloud agent itself.
 *
 *   npx tsx scripts/agent-runner.ts            # drain both lanes, then exit
 *   npx tsx scripts/agent-runner.ts fast       # drain only the fast (interactive) lane
 *   npx tsx scripts/agent-runner.ts fast 20    # cap at 20 jobs this run
 *
 * Phase 0 handles only `ping` (proof the loop works). Phase 1+ registers real
 * handlers (extract, ask, action) in HANDLERS below — one place to grow.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

type Lane = "fast" | "batch";

async function main() {
  const laneArg = process.argv[2] as Lane | undefined;
  const lane = laneArg === "fast" || laneArg === "batch" ? laneArg : undefined;
  const cap = Number(process.argv[3]) || 100;

  const { claimNextJob, completeJob, failJob } = await import("@/lib/ai-jobs");
  type AiJob = import("@/lib/ai-jobs").AiJob;

  // Dispatch table — kind → handler. Handlers return the result object to store.
  // These are DETERMINISTIC (no AI). The intelligence kinds (ask/extract/action)
  // are done by the Claude Code cloud agent via agent-next.ts / agent-complete.ts.
  const HANDLERS: Record<string, (job: AiJob) => Promise<Record<string, unknown>>> = {
    // Proof handler: echoes the payload back so we can watch the loop end-to-end.
    async ping(job) {
      return { pong: true, echo: job.payload?.message ?? null, at: new Date().toISOString() };
    },
  };
  const KINDS = Object.keys(HANDLERS);

  let processed = 0;
  for (let i = 0; i < cap; i++) {
    const job = await claimNextJob(lane, KINDS);
    if (!job) break; // queue empty
    const handler = HANDLERS[job.kind];
    try {
      if (!handler) throw new Error(`No handler for kind "${job.kind}" (not built yet)`);
      const result = await handler(job);
      await completeJob(job.id, result);
      console.log(`✓ #${job.id} ${job.kind} [${job.lane}] → done`);
      processed++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await failJob(job.id, msg);
      console.log(`✗ #${job.id} ${job.kind} → ${msg}`);
    }
  }

  console.log(`\nRunner done — ${processed} job(s) processed${lane ? ` (lane: ${lane})` : ""}.`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });

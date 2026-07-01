/**
 * agent-next.ts — the cloud agent runs this to CLAIM the next intelligence job and
 * receive everything it needs to do it (memory/cloud_agent_plan.md). It prints one
 * JSON object: { job, instruction, context, resultShape }. The agent reads that,
 * reasons, then calls `scripts/agent-complete.ts <id> <result.json>`.
 *
 *   npx tsx scripts/agent-next.ts          # any AI job, fast lane first
 *   npx tsx scripts/agent-next.ts batch    # only batch-lane jobs
 *
 * Prints { "empty": true } when the queue has nothing for the agent.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

const AI_KINDS = ["ask", "extract", "action"];

async function main() {
  const laneArg = process.argv[2];
  const { claimNextJob } = await import("@/lib/ai-jobs");
  const { gatherContext } = await import("@/lib/agent-context");

  // Fast lane first (interactive), then batch — unless a lane was forced.
  const lanes: ("fast" | "batch")[] = laneArg === "fast" || laneArg === "batch" ? [laneArg] : ["fast", "batch"];
  let job = null;
  for (const lane of lanes) {
    job = await claimNextJob(lane, AI_KINDS);
    if (job) break;
  }
  if (!job) {
    console.log(JSON.stringify({ empty: true }));
    process.exit(0);
  }
  const ctx = await gatherContext(job);
  console.log(JSON.stringify(ctx, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
  process.exit(1);
});

/**
 * agent-dispatcher.ts — the ALWAYS-ON engine for 24/7 + near-instant ORI.
 *
 * Runs as a long-lived process on an always-on host (VPS / spare machine — see
 * SETUP_24_7.md). It's a cheap plain-node loop that watches the ai_jobs queue and,
 * the moment a job appears, wakes a Claude Code worker (on the Max plan) to drain
 * it. While the queue is empty it spends ZERO tokens — it just polls a counter.
 *
 * This gives "instant wake" without a webhook: a ~3s poll on an always-on host is
 * effectively instant, and — unlike the local scheduled task — it runs with the
 * owner's PC off.
 *
 *   npx tsx scripts/agent-dispatcher.ts
 *   DISPATCH_INTERVAL_MS=3000 npx tsx scripts/agent-dispatcher.ts
 *
 * Requires on the host: Node, this repo, .env with the Supabase creds, and the
 * `claude` CLI logged into the Max plan (see SETUP_24_7.md).
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true } as never);
config({ path: ".env", quiet: true } as never);
import { spawnSync } from "child_process";
import { existsSync } from "fs";
import { join } from "path";

const INTERVAL = Number(process.env.DISPATCH_INTERVAL_MS) || 3000;

/** Resolve the claude CLI robustly (npm global shim), else fall back to PATH. */
function claudeBin(): string {
  const appdata = process.env.APPDATA;
  if (appdata) {
    for (const name of ["claude.cmd", "claude.exe", "claude"]) {
      const p = join(appdata, "npm", name);
      if (existsSync(p)) return p;
    }
  }
  return "claude";
}

const WORKER_PROMPT =
  "You are ORI's worker. Open AGENT_WORKER.md and follow it exactly: drain the " +
  "ai_jobs queue — run `npx tsx scripts/agent-next.ts`, reason over ONLY the " +
  "provided context, write result.json, run `npx tsx scripts/agent-complete.ts " +
  "<id> result.json`; repeat until agent-next prints {\"empty\":true}, then stop. " +
  "Never call any external model — you are the intelligence. British English. " +
  "Leave ids null rather than guessing.";

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

// A worker that hasn't finished within this many ms is assumed hung; we kill it
// and the reaper re-queues whatever it had claimed. Keeps one bad session from
// wedging the whole queue (and the live "Thinking…" spinner) forever.
const WORKER_TIMEOUT_MS = Number(process.env.WORKER_TIMEOUT_MS) || 5 * 60_000;

async function main() {
  const { pendingCount, reapStaleJobs } = await import("@/lib/ai-jobs");
  console.log(`[dispatcher] up — polling every ${INTERVAL}ms. Waiting for jobs…`);
  let idleLogged = true;

  // Graceful shutdown.
  let stop = false;
  process.on("SIGINT", () => { stop = true; });
  process.on("SIGTERM", () => { stop = true; });

  while (!stop) {
    // Recover any job a dead/hung worker left stranded in "running" so the live
    // UI never spins forever. Best-effort; a DB blip just retries next tick.
    try {
      const reaped = await reapStaleJobs();
      if (reaped > 0) console.log(`[dispatcher] recovered ${reaped} stalled job(s).`);
    } catch { /* transient — try again next tick */ }

    let pending = 0;
    try {
      pending = await pendingCount();
    } catch {
      // transient DB blip — back off one tick, don't crash the daemon.
      await sleep(INTERVAL);
      continue;
    }

    if (pending > 0) {
      idleLogged = false;
      console.log(`[dispatcher] ${pending} job(s) pending → waking the ORI worker…`);
      // Wake a headless Claude Code worker to drain the whole queue in one session.
      // --dangerously-skip-permissions: this host is trusted; the worker only runs
      // the repo's own agent scripts.
      // Make sure the npm global bin (where `claude` installs) is on PATH.
      const npmBin = process.platform === "win32" ? `${process.env.APPDATA}\\npm` : "/usr/local/bin";
      const PATH = `${process.env.PATH ?? ""}${process.platform === "win32" ? ";" : ":"}${npmBin}`;
      const bin = claudeBin();
      // Pass the prompt via STDIN (claude -p reads it) so quotes/backticks in the
      // prompt can never break the Windows command line.
      const res = process.platform === "win32"
        ? spawnSync("cmd.exe", ["/d", "/s", "/c", bin, "-p", "--dangerously-skip-permissions"], {
            cwd: process.cwd(), input: WORKER_PROMPT, env: { ...process.env, PATH }, stdio: ["pipe", "inherit", "inherit"],
            timeout: WORKER_TIMEOUT_MS, killSignal: "SIGKILL",
          })
        : spawnSync(bin, ["-p", "--dangerously-skip-permissions"], {
            cwd: process.cwd(), input: WORKER_PROMPT, env: { ...process.env, PATH }, stdio: ["pipe", "inherit", "inherit"],
            timeout: WORKER_TIMEOUT_MS, killSignal: "SIGKILL",
          });
      if (res.error) console.error(`[dispatcher] worker spawn failed: ${res.error.message}`);
      if ((res as { signal?: string }).signal === "SIGKILL")
        console.warn(`[dispatcher] worker hit the ${WORKER_TIMEOUT_MS}ms timeout — killed; reaper will retry its job.`);
      console.log("[dispatcher] worker finished; back to watching.");
    } else if (!idleLogged) {
      console.log("[dispatcher] queue empty — idle (0 tokens).");
      idleLogged = true;
    }
    await sleep(INTERVAL);
  }
  console.log("[dispatcher] shutting down.");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });

// Self-repair — when the watchdog (checkSystemHealth) or the morning run spots a
// scheduled job that has FAILED or gone STALE (missed its window), try to re-run
// it ONCE, here, before anyone is alerted. Most stalls are transient (a cold
// function, a brief DB blip, a single bad call); a quiet retry fixes them without
// the owner ever seeing red.
//
// Rules of the road:
//  - One attempt per job per run. We never loop or cascade.
//  - Each underlying job function is called directly (the same code the cron hits),
//    fully guarded — a repair NEVER throws, so it can sit inside a health check or
//    the morning run with zero risk to the surrounding work.
//  - Every attempt + outcome is logged to system_events as "system.repair" (ok =
//    the re-run succeeded, error = it failed again and an alert is warranted).
//  - Tier-3 work (send/spend/delete) is NOT auto-repaired blindly: each underlying
//    job already enforces its own pause/mode/window guards (e.g. runDueAutomations
//    respects the send window + pause, runTimeAutomations respects the automation
//    mode), so re-running them is as safe as the original scheduled run — no more.
//
// Used by: src/lib/automation/system-health.ts (repair-before-alert) and the morning-run cron.

import { recordEvent } from "@/lib/system-events";

export type RepairOutcome = {
  kind: string;          // the job kind, e.g. "cron.snapshots"
  label: string;         // human label
  ok: boolean;           // did the re-run succeed?
  message: string;       // short outcome note (for logs + the brief)
};

// The set of jobs we know how to re-run. Each `run` calls the SAME function the
// cron route calls — imported lazily so a heavy/optional dependency (embeddings,
// AI) never loads unless we actually need to repair that job. Every `run` must
// resolve; throwing is caught by attemptRepair and counted as a failed repair.
//
// Deliberately omitted (no safe direct re-run, or nothing to "repair"):
//  - cron.reminders / cron.email beyond the engine call — both are folded in via
//    their underlying engine functions which self-guard windows + pause.
const REPAIRABLE: Record<string, { label: string; run: () => Promise<string> }> = {
  "cron.morning": {
    label: "Morning date-chase",
    // Re-run only the date-chasing half (the part that builds the day's work).
    // The notification/brief half is owner-comms (tier 3) and re-sending it on a
    // repair could double-ping — the next scheduled run handles comms.
    run: async () => {
      const { runTimeAutomations } = await import("@/lib/automation/automation-time");
      const r = await runTimeAutomations();
      return `renewals ${r.renewals}, probations ${r.probations}, obligations ${r.obligations}`;
    },
  },
  "cron.snapshots": {
    label: "Daily snapshot",
    run: async () => {
      const { runSnapshots } = await import("@/lib/automation/cron-jobs");
      const r = await runSnapshots();
      await recordEvent("cron.snapshots", "ok", { ...r, repaired: true });
      return `${r.written} company snapshots written`;
    },
  },
  "cron.cleanup": {
    label: "Cleanup",
    run: async () => {
      const { runCleanup } = await import("@/lib/automation/cron-jobs");
      const r = await runCleanup();
      await recordEvent("cron.cleanup", "ok", { ...r, repaired: true });
      return `${r.undoTokensDeleted} expired undo tokens, ${r.codesDeleted} sign-in codes, ${r.grantsDeleted} finished connections cleared`;
    },
  },
  "cron.reminders": {
    label: "Reminders",
    // The route's own function, so a repaired run behaves exactly like a
    // scheduled one (note deep-links included).
    run: async () => {
      const { runTodoReminders } = await import("@/app/api/cron/reminders/route");
      const r = await runTodoReminders();
      await recordEvent("cron.reminders", "ok", { ...r, repaired: true });
      return `${r.due} due, ${r.sent} pushed`;
    },
  },
  "cron.email": {
    label: "Automated emails",
    // runDueAutomations self-enforces the send window + pause + once-per-day, so a
    // repair re-run is exactly as safe as the scheduled run (no double-send risk).
    run: async () => {
      const { runDueAutomations } = await import("@/lib/automation");
      const s = await runDueAutomations();
      await recordEvent("cron.email", "ok", { repaired: true, ...s });
      return `email automations dispatched`;
    },
  },
  "cron.reindex": {
    label: "Search re-index",
    run: async () => {
      const { getAppSettings } = await import("@/lib/settings");
      if (!(await getAppSettings()).semanticSearch) {
        await recordEvent("cron.reindex", "ok", { skipped: "semantic search off", repaired: true });
        return "semantic search off (nothing to index)";
      }
      const { reindexAll } = await import("@/lib/search/embeddings-reindex");
      const { checked, orphansRemoved } = await reindexAll();
      await recordEvent("cron.reindex", "ok", { checked, orphansRemoved, repaired: true });
      return `${checked} checked, ${orphansRemoved} orphans removed`;
    },
  },
};

/** Is this job kind one we know how to re-run? */
export function isRepairable(kind: string): boolean {
  return kind in REPAIRABLE;
}

/**
 * Attempt to re-run ONE job, once. Logs a "system.repair" event with the outcome
 * and returns it. NEVER throws — a repair that itself fails is reported as
 * `ok:false` (which tells the caller to go ahead and alert).
 */
export async function attemptRepair(kind: string): Promise<RepairOutcome> {
  const job = REPAIRABLE[kind];
  if (!job) {
    return { kind, label: kind, ok: false, message: "no repair available" };
  }
  try {
    const message = await job.run();
    await recordEvent("system.repair", "ok", { job: kind, message });
    return { kind, label: job.label, ok: true, message };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await recordEvent("system.repair", "error", { job: kind, message });
    return { kind, label: job.label, ok: false, message };
  }
}

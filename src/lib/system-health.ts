// System health — catches a cron or AI job that fails silently. Every scheduled
// job already writes a system_events row (ok/error/skip); this knows what SHOULD
// run and how often, then flags anything that errored, went stale (stopped running)
// or never ran. Read-only, no AI. In-app only — surfaced on /inbox + logged so a
// silent failure becomes loud.

import { sb } from "@/db/supabase";
import { auditCoverage } from "@/lib/coverage-audit";
import { isRepairable, attemptRepair } from "@/lib/system-repair";
import { checkGroqKeyHealth, type GroqKeyHealth } from "@/lib/model-watch";

// "off" = switched off on purpose. Distinct from "never", which means it was
// supposed to run and did not — the difference between a decision and a fault.
export type JobState = "healthy" | "failed" | "stale" | "never" | "off";

export type JobHealth = {
  kind: string;
  label: string;
  state: JobState;
  lastRun: string | null;   // ISO — most recent run of any status
  lastOk: string | null;    // ISO — most recent successful run
  detail: string | null;    // why it's unhealthy (error message / how overdue)
  repaired?: boolean;       // this run self-repaired the job (re-ran it, it's healthy now)
};

// Calm positive picture for the "all is well" state — so the card can SAY
// something good (not just go quiet) when everything is healthy.
export type HealthSummary = {
  totalJobs: number;        // jobs we watch
  healthyJobs: number;      // …that are currently healthy
  repairedJobs: number;     // …that this run self-repaired (only set on a repair pass)
  recentlyRepaired: string[]; // job labels self-repaired in the last 24h (from the log)
  lastRun: string | null;   // ISO — newest run of any watched job (the "heartbeat")
  itemsIndexed: number | null; // distinct records in the search index (null = search off)
};

export type SystemHealth = {
  status: "ok" | "warn" | "down";   // worst across jobs
  jobs: JobHealth[];
  schedulerStale: boolean;          // nothing at all has run recently (dead-man switch)
  summary: HealthSummary;           // glanceable "all N healthy" line
  keyHealth: GroqKeyHealth;         // is the active Groq API key still good?
  checkedAt: string;
};

// What should run, and the window before "stale". Daily jobs get a generous grace
// so a slightly-late run doesn't cry wolf. Hours.
//
// ⚠️ KEEP THIS LIST HONEST. A check that can never go green is worse than no
// check: it teaches you to ignore the panel, and then a real failure hides in the
// noise. Two were doing exactly that until 21 Aug 2026 —
//   • "Inbox auto-sort" watched cron.auto-sort, a job DELETED with the document
//     intelligence layer in Aug 2026. It reported "never" for ever.
//   • "Automated emails" is switched OFF by the owner (email.automation.paused),
//     so reporting it as down was wrong. `skipWhen` handles that below.
// When a feature is removed, remove its entry here too.
const JOBS: Array<{
  kind: string;
  label: string;
  everyHours: number;
  graceHours: number;
  /** Deliberately switched off = not a fault. Checked before the job is judged. */
  skipWhen?: (settings: Record<string, string | null>) => boolean;
}> = [
  { kind: "cron.morning", label: "Morning run (chase dates + self-heal)", everyHours: 24, graceHours: 6 },
  { kind: "cron.snapshots", label: "Daily snapshot", everyHours: 24, graceHours: 8 },
  { kind: "cron.cleanup", label: "Cleanup", everyHours: 24, graceHours: 8 },
  { kind: "cron.reminders", label: "Reminders", everyHours: 24, graceHours: 8 },
  {
    kind: "cron.email",
    label: "Automated emails",
    everyHours: 24,
    graceHours: 8,
    // Paused on purpose is not "down".
    skipWhen: (st) => {
      try { return JSON.parse(st["email.automation"] ?? "{}")?.paused === true; }
      catch { return false; }
    },
  },
  { kind: "cron.reindex", label: "Search re-index", everyHours: 24, graceHours: 8 },
];

const AI_KIND = "doc-extraction";
const MODEL_KIND = "model.deprecation";   // a configured Groq model is no longer served
const AI_ERROR_RATE = 0.5;   // flag if >50% of recent reads failed
const AI_MIN_SAMPLE = 4;     // …over at least this many reads

function fmtOverdue(ageMs: number): string {
  const h = Math.floor(ageMs / 3_600_000);
  if (h < 48) return `no success for ${h}h`;
  return `no success for ${Math.floor(h / 24)}d`;
}

export async function checkSystemHealth(
  // repair: when true, a failed/stale job we know how to re-run gets ONE repair
  // attempt before it's reported — so a transient stall self-heals and never
  // reaches the owner as red. Off by default: a page render must stay side-effect
  // free; the morning-run cron opts in. Best-effort — a failed repair just leaves
  // the job in its original unhealthy state (so the alert still fires).
  opts: { repair?: boolean } = {},
): Promise<SystemHealth> {
  const now = Date.now();
  const sinceIso = new Date(now - 7 * 86_400_000).toISOString();
  const REPAIR_KIND = "system.repair";
  const kinds = [...JOBS.map((j) => j.kind), AI_KIND, MODEL_KIND, REPAIR_KIND];

  const { data } = await sb
    .from("system_events")
    .select("kind,status,created_at,details")
    .in("kind", kinds)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as Array<{ kind: string; status: string; created_at: string; details: string | null }>;

  // Settings that decide whether a job is switched off rather than broken.
  const settings: Record<string, string | null> = {};
  try {
    const { data: rowsS } = await sb.from("settings").select("key,value").in("key", ["email.automation"]);
    for (const r of (rowsS ?? []) as Array<{ key: string; value: string | null }>) settings[r.key] = r.value;
  } catch {
    // Unreadable settings must not turn every job red; the rules just don't fire.
  }

  const jobs: JobHealth[] = JOBS.map((j) => {
    // Switched off on purpose is not a fault, and must not colour the whole
    // system amber for ever.
    if (j.skipWhen?.(settings)) {
      return { kind: j.kind, label: j.label, state: "off" as JobState, lastRun: null, lastOk: null, detail: "switched off" };
    }
    const mine = rows.filter((r) => r.kind === j.kind);
    const last = mine[0] ?? null;
    const lastOkRow = mine.find((r) => r.status === "ok") ?? null;
    const window = (j.everyHours + j.graceHours) * 3_600_000;

    let state: JobState;
    let detail: string | null = null;
    if (!last) { state = "never"; detail = "hasn’t run in the last 7 days"; }
    else if (!lastOkRow || now - new Date(lastOkRow.created_at).getTime() > window) {
      // No recent success → stale, unless the very last run errored (call it failed).
      if (last.status === "error") {
        state = "failed";
        try { detail = (JSON.parse(last.details ?? "{}").message as string) ?? "last run failed"; } catch { detail = "last run failed"; }
      } else {
        state = "stale";
        detail = lastOkRow ? fmtOverdue(now - new Date(lastOkRow.created_at).getTime()) : "no successful run on record";
      }
    } else {
      state = "healthy";
    }
    return { kind: j.kind, label: j.label, state, lastRun: last?.created_at ?? null, lastOk: lastOkRow?.created_at ?? null, detail };
  });

  // SELF-REPAIR (opt-in): before we let anything ring an alarm, try to re-run each
  // failed/stale cron job ONCE. Most stalls are transient and a quiet retry fixes
  // them. A repair that succeeds flips the job to healthy (with a `repaired` flag);
  // one that fails leaves the job exactly as it was, so the alert still fires.
  // One attempt per job per run — never throws.
  if (opts.repair) {
    for (const j of jobs) {
      if ((j.state !== "failed" && j.state !== "stale") || !isRepairable(j.kind)) continue;
      const outcome = await attemptRepair(j.kind);
      if (outcome.ok) {
        j.state = "healthy";
        j.repaired = true;
        j.lastOk = new Date(now).toISOString();
        j.lastRun = j.lastOk;
        j.detail = `self-repaired — ${outcome.message}`;
      } else {
        // Re-run failed too → it's genuinely down. Keep the original state, but
        // make the detail say we tried, so the alert is honest.
        j.detail = `${j.detail ?? "unhealthy"} (auto-retry failed: ${outcome.message})`;
      }
    }
  }

  // AI reads — error rate over the last 24h.
  const aiRecent = rows.filter((r) => r.kind === AI_KIND && now - new Date(r.created_at).getTime() < 86_400_000);
  const aiFails = aiRecent.filter((r) => r.status === "error").length;
  const aiAi: JobHealth = (() => {
    const last = rows.find((r) => r.kind === AI_KIND) ?? null;
    if (aiRecent.length >= AI_MIN_SAMPLE && aiFails / aiRecent.length > AI_ERROR_RATE) {
      return { kind: AI_KIND, label: "AI document reading", state: "failed", lastRun: last?.created_at ?? null, lastOk: rows.find((r) => r.kind === AI_KIND && r.status === "ok")?.created_at ?? null, detail: `${aiFails} of ${aiRecent.length} reads failed in 24h` };
    }
    return { kind: AI_KIND, label: "AI document reading", state: "healthy", lastRun: last?.created_at ?? null, lastOk: rows.find((r) => r.kind === AI_KIND && r.status === "ok")?.created_at ?? null, detail: null };
  })();
  jobs.push(aiAi);

  // Model deprecation — surface the latest model-watch verdict (vision is the risk).
  const lastModel = rows.find((r) => r.kind === MODEL_KIND) ?? null;
  if (lastModel?.status === "error") {
    let detail = "a Groq model is no longer available";
    try {
      const missing = (JSON.parse(lastModel.details ?? "{}").missing as string[]) ?? [];
      if (missing.length) detail = `no longer served: ${missing.join(", ")}`;
    } catch { /* keep default */ }
    jobs.push({ kind: MODEL_KIND, label: "AI model availability", state: "failed", lastRun: lastModel.created_at, lastOk: rows.find((r) => r.kind === MODEL_KIND && r.status === "ok")?.created_at ?? null, detail });
  }

  // Groq KEY health + search coverage in parallel (both best-effort, never throw).
  //
  // KEY: its own brain in model-watch (cached a few minutes), kept separate from
  // getAiKey so "key expired" reads differently to "AI switched off" / "over
  // budget".
  //
  // COVERAGE: does the index actually cover everything it should? A material gap
  // (a type with records but materially under-indexed, or an entity-like table
  // nothing indexes) is a quiet failure: those records won't surface in search
  // until the nightly re-index catches up. Treated as a warn, not a hard down.
  const [keyHealth, coverage] = await Promise.all([
    checkGroqKeyHealth().catch(
      (): GroqKeyHealth => ({ status: "unknown", source: "none", checkedAt: new Date(now).toISOString() }),
    ),
    auditCoverage(),
  ]);

  // Surface the key state as a calm row. Only a genuinely rejected key
  // (expired/revoked) is a "failed" — it silently stops every AI feature. No-key
  // and AI-off are intentional configurations (informational, not alarms), and
  // "unknown" (couldn't reach Groq) must never cry wolf, so neither degrades the
  // headline. "valid" is shown green so the card can say something good.
  jobs.push({
    kind: "ai.key",
    label: "AI key",
    state: keyHealth.status === "invalid" ? "failed" : "healthy",
    lastRun: keyHealth.checkedAt,
    lastOk: keyHealth.status === "valid" ? keyHealth.checkedAt : null,
    detail:
      keyHealth.status === "valid" ? "valid"
      : keyHealth.status === "invalid" ? "expired or revoked — set a new one in Settings"
      : keyHealth.status === "no-key" ? "no key set — AI runs on manual fallbacks"
      : keyHealth.status === "ai-off" ? "AI is switched off in Settings"
      : "couldn’t reach Groq to check",
  });
  // No rows = semantic search is off (the default, index intentionally empty) or
  // the audit couldn't read anything. Either way there's nothing to report — skip
  // the row entirely rather than show a misleading green/red coverage status.
  const gaps = coverage.rows.filter((r) => r.severity !== "ok");
  if (coverage.rows.length === 0) {
    // skip — feature off or audit unavailable
  } else if (gaps.length) {
    const worst = gaps.some((g) => g.severity === "missing") ? "missing" : "gap";
    const names = gaps
      .slice(0, 4)
      .map((g) => `${g.type}${g.gapPct != null ? ` (${Math.round(g.gapPct * 100)}% un-indexed)` : ""}`)
      .join(", ");
    const more = gaps.length > 4 ? ` +${gaps.length - 4} more` : "";
    jobs.push({
      kind: "search.coverage",
      label: "Search index coverage",
      state: "stale",
      lastRun: coverage.checkedAt,
      lastOk: null,
      detail: `${worst === "missing" ? "not indexed" : "under-indexed"}: ${names}${more}`,
    });
  } else {
    jobs.push({
      kind: "search.coverage",
      label: "Search index coverage",
      state: "healthy",
      lastRun: coverage.checkedAt,
      lastOk: coverage.checkedAt,
      detail: null,
    });
  }

  // Dead-man switch: nothing at all has run in 36h → the scheduler itself may be down.
  const newest = rows[0] ? new Date(rows[0].created_at).getTime() : 0;
  const schedulerStale = newest === 0 || now - newest > 36 * 3_600_000;

  const anyDown = jobs.some((j) => j.state === "failed");
  const anyWarn = jobs.some((j) => j.state === "stale" || j.state === "never");
  const status: SystemHealth["status"] = anyDown || schedulerStale ? "down" : anyWarn ? "warn" : "ok";

  // Calm positive picture. itemsIndexed reuses the coverage audit we already ran
  // (sum of distinct indexed rows across types); null when search is off, so the
  // card can omit that clause rather than show "0 indexed". The heartbeat is the
  // newest run of any watched job.
  const itemsIndexed = coverage.rows.length
    ? coverage.rows.reduce((sum, r) => sum + (r.indexedRows ?? 0), 0)
    : null;

  // Recently self-repaired (last 24h), read back from the log so the card reflects
  // overnight repairs even on a plain (non-repairing) page render. Maps the logged
  // job kind to its friendly label; deduped, newest-first order preserved.
  const labelByKind = new Map(JOBS.map((j) => [j.kind, j.label]));
  const recentlyRepaired: string[] = [];
  for (const r of rows) {
    if (r.kind !== REPAIR_KIND || r.status !== "ok") continue;
    if (now - new Date(r.created_at).getTime() > 86_400_000) continue;
    let jobKind: string | null = null;
    try { jobKind = (JSON.parse(r.details ?? "{}").job as string) ?? null; } catch { /* ignore */ }
    const label = (jobKind && labelByKind.get(jobKind)) || jobKind;
    if (label && !recentlyRepaired.includes(label)) recentlyRepaired.push(label);
  }
  // Fold in repairs done in THIS pass (their log rows post-date the query above),
  // so a repairing call returns a self-consistent summary.
  for (const j of jobs) {
    if (j.repaired && !recentlyRepaired.includes(j.label)) recentlyRepaired.unshift(j.label);
  }

  // ⚠️ Jobs switched off are not counted. Otherwise the card reads "6 of 7
  // healthy" for ever because of something deliberately turned off, which is the
  // same nagging that made this panel ignorable in the first place.
  const counted = jobs.filter((j) => j.state !== "off");

  const summary: HealthSummary = {
    totalJobs: counted.length,
    healthyJobs: counted.filter((j) => j.state === "healthy").length,
    repairedJobs: jobs.filter((j) => j.repaired).length,
    recentlyRepaired,
    lastRun: newest ? new Date(newest).toISOString() : null,
    itemsIndexed,
  };

  return { status, jobs, schedulerStale, summary, keyHealth, checkedAt: new Date(now).toISOString() };
}

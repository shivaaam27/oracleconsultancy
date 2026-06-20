// System health — catches a cron or AI job that fails silently. Every scheduled
// job already writes a system_events row (ok/error/skip); this knows what SHOULD
// run and how often, then flags anything that errored, went stale (stopped running)
// or never ran. Read-only, no AI. In-app only — surfaced on /inbox + logged so a
// silent failure becomes loud.

import { sb } from "@/db/supabase";

export type JobState = "healthy" | "failed" | "stale" | "never";

export type JobHealth = {
  kind: string;
  label: string;
  state: JobState;
  lastRun: string | null;   // ISO — most recent run of any status
  lastOk: string | null;    // ISO — most recent successful run
  detail: string | null;    // why it's unhealthy (error message / how overdue)
};

export type SystemHealth = {
  status: "ok" | "warn" | "down";   // worst across jobs
  jobs: JobHealth[];
  schedulerStale: boolean;          // nothing at all has run recently (dead-man switch)
  checkedAt: string;
};

// What should run, and the window before "stale". Daily jobs get a generous grace
// so a slightly-late run doesn't cry wolf. Hours.
const JOBS: Array<{ kind: string; label: string; everyHours: number; graceHours: number }> = [
  { kind: "cron.morning", label: "Morning run (chase dates + self-heal)", everyHours: 24, graceHours: 6 },
  { kind: "cron.snapshots", label: "Daily snapshot", everyHours: 24, graceHours: 8 },
  { kind: "cron.cleanup", label: "Cleanup", everyHours: 24, graceHours: 8 },
  { kind: "cron.reminders", label: "Reminders", everyHours: 24, graceHours: 8 },
  { kind: "cron.email", label: "Automated emails", everyHours: 24, graceHours: 8 },
  { kind: "cron.reindex", label: "Search re-index", everyHours: 24, graceHours: 8 },
  { kind: "cron.auto-sort", label: "Inbox auto-sort", everyHours: 24, graceHours: 8 },
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

export async function checkSystemHealth(): Promise<SystemHealth> {
  const now = Date.now();
  const sinceIso = new Date(now - 7 * 86_400_000).toISOString();
  const kinds = [...JOBS.map((j) => j.kind), AI_KIND, MODEL_KIND];

  const { data } = await sb
    .from("system_events")
    .select("kind,status,created_at,details")
    .in("kind", kinds)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as Array<{ kind: string; status: string; created_at: string; details: string | null }>;

  const jobs: JobHealth[] = JOBS.map((j) => {
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

  // Dead-man switch: nothing at all has run in 36h → the scheduler itself may be down.
  const newest = rows[0] ? new Date(rows[0].created_at).getTime() : 0;
  const schedulerStale = newest === 0 || now - newest > 36 * 3_600_000;

  const anyDown = jobs.some((j) => j.state === "failed");
  const anyWarn = jobs.some((j) => j.state === "stale" || j.state === "never");
  const status: SystemHealth["status"] = anyDown || schedulerStale ? "down" : anyWarn ? "warn" : "ok";

  return { status, jobs, schedulerStale, checkedAt: new Date(now).toISOString() };
}

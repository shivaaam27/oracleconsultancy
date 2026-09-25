// Recurring-task rules — the ONE shape and the ONE set of checks, shared by the
// portal's door (src/app/portal/(app)/tasks/automations-actions.ts, scoped to
// what the person created) and the Administrator's door
// (src/app/task/recurring-actions.ts, every rule). A rule is an
// `automation_rules` row of kind `recurring_task`; its template lives in
// `config`. This file is CLIENT-SAFE — types and pure functions only, no `sb`.

import type { RuleConfig } from "@/lib/ori/automations";

const OPEN_STATUSES = ["Not Started", "In Progress", "Under Review", "Blocked", "Waiting External", "Escalated"];
const PRIORITIES = ["Critical", "High", "Medium", "Low"];

/** Far-future sentinel for the on/off switch — "paused indefinitely". The engine's
 *  pausedUntil gate (evaluateRule) treats any future instant as not-due, so no
 *  cron/engine change is needed. */
export const PAUSED_FOREVER = "2999-01-01";

export type RecurringTaskRule = {
  id: number;
  title: string;
  cadence: "weekly" | "monthly";
  weekdays: number[]; // weekly only
  dayOfMonth: number | null; // monthly only
  companyId: number | null;
  companyName: string;
  priority: string;
  status: string;
  description: string;
  assigneePersonIds: number[];
  active: boolean;
  /** Switched off (config.pausedUntil in the future) — the rule keeps its settings
   *  but creates nothing until switched back on. */
  paused: boolean;
  lastFiredAt: string | null;
  /** Who set it up — the `created_by` tag ("web-ui" for the Administrator,
   *  "portal-dir:<Name>" etc. for a portal person). */
  createdBy: string | null;
};

export type RecurringTaskInput = {
  title: string;
  companyId: number;
  cadence: "weekly" | "monthly";
  weekdays: number[];
  dayOfMonth: number;
  priority: string;
  status: string;
  description: string;
  assigneePersonIds: number[];
};

export type Result = { ok: true } | { ok: false; error: string };

/** The raw `automation_rules` columns a rule is read from. */
export type RecurringRuleRow = {
  id: number;
  company_id: number | null;
  config: RuleConfig | null;
  active: boolean;
  last_fired_at: string | null;
  created_by?: string | null;
};

export function rowToRule(r: RecurringRuleRow, companyNames: Map<number, string>): RecurringTaskRule {
  const cfg = r.config ?? {};
  const cadence: "weekly" | "monthly" = cfg.cadence === "monthly" ? "monthly" : "weekly";
  return {
    id: r.id,
    title: (cfg.title as string | undefined) ?? "",
    cadence,
    weekdays: Array.isArray(cfg.weekdays) && cfg.weekdays.length ? cfg.weekdays : (typeof cfg.weekday === "number" ? [cfg.weekday] : [1]),
    dayOfMonth: typeof cfg.dayOfMonth === "number" ? cfg.dayOfMonth : null,
    companyId: r.company_id,
    companyName: r.company_id != null ? companyNames.get(r.company_id) ?? "" : "",
    priority: (cfg.priority as string | undefined) ?? "Medium",
    status: (cfg.status as string | undefined) ?? "Not Started",
    description: (cfg.description as string | undefined) ?? "",
    assigneePersonIds: Array.isArray(cfg.assigneePersonIds) ? (cfg.assigneePersonIds as number[]) : [],
    active: r.active,
    paused: !!cfg.pausedUntil && Date.parse(cfg.pausedUntil) > Date.now(),
    lastFiredAt: r.last_fired_at,
    createdBy: r.created_by ?? null,
  };
}

/** Turn the form's input into the rule's config, refusing what cannot fire:
 *  no title, or a weekly rule with no day. */
export function buildConfig(input: RecurringTaskInput): RuleConfig | { error: string } {
  const title = input.title.trim().slice(0, 300);
  if (!title) return { error: "Give the recurring task a title." };
  const cadence = input.cadence === "monthly" ? "monthly" : "weekly";
  const config: RuleConfig = { cadence, companyId: input.companyId, title };
  if (cadence === "weekly") {
    const weekdays = [...new Set((input.weekdays ?? []).map((n) => Math.round(Number(n))).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))];
    if (weekdays.length === 0) return { error: "Pick at least one day of the week." };
    config.weekdays = weekdays;
  } else {
    const dom = Math.round(Number(input.dayOfMonth));
    config.dayOfMonth = Number.isInteger(dom) ? Math.min(31, Math.max(1, dom)) : 1;
  }
  config.priority = PRIORITIES.includes(input.priority) ? input.priority : "Medium";
  config.status = OPEN_STATUSES.includes(input.status) ? input.status : "Not Started";
  const description = (input.description ?? "").trim();
  if (description) config.description = description.slice(0, 2000);
  return config;
}

/** Distinct, positive, capped — the assignee ids as the form may have sent them. */
export function cleanAssigneeIds(ids: number[] | undefined): number[] {
  return [...new Set((ids ?? []).map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 50);
}

/** The plain-English tag for who set a rule up. */
export function creatorLabel(createdBy: string | null): string {
  if (!createdBy || createdBy === "web-ui") return "Administrator";
  const m = /^portal-(?:dir|mgr|hr):(.+)$/.exec(createdBy);
  if (m) return m[1];
  const mcp = /^mcp:(.+)$/.exec(createdBy);
  if (mcp) return `${mcp[1]} via Claude`;
  if (createdBy === "ai-command" || createdBy.startsWith("ori")) return "ORI";
  return createdBy;
}

/** Is TODAY one of the days this schedule names? Dar es Salaam (UTC+3) — a
 *  recurring task belongs to a calendar day here, not to UTC, so "Friday" must
 *  mean Friday in the office. `now` is injectable so it can be tested.
 *
 *  This is the ONE answer both create forms and both servers use, so the tick
 *  box you see and the decision the server makes can never disagree. */
export function occursToday(
  r: { cadence: "weekly" | "monthly"; weekdays: number[]; dayOfMonth: number },
  now: Date = new Date(),
): boolean {
  const dar = new Date(now.getTime() + 3 * 3_600_000); // shift into UTC+3
  if (r.cadence === "monthly") {
    const wanted = Math.min(31, Math.max(1, Math.round(r.dayOfMonth)));
    const lastDom = new Date(Date.UTC(dar.getUTCFullYear(), dar.getUTCMonth() + 1, 0)).getUTCDate();
    // A 31st rule in a 30-day month lands on the 30th — the same clamp the
    // engine's nextRecurrenceInstant uses, so the two always agree.
    return dar.getUTCDate() === Math.min(wanted, lastDom);
  }
  return r.weekdays.some((w) => Math.min(6, Math.max(0, Math.round(w))) === dar.getUTCDay());
}

/** The hour (Dar time) the daily job runs and creates a due recurring task.
 *  Must match the `ori-automations` cron in vercel.json (06:00 UTC) and the
 *  START_HOUR in nextRecurrenceInstant. */
export const RECURRING_FIRES_AT_HOUR = 9;

/** The instant the standing job would create TODAY's copy (today at 09:00 Dar),
 *  in ms. Stamped onto a rule as `last_fired_at` when a form has already made
 *  today's copy itself, so the job sees today as done and does not make a
 *  second one. Tomorrow's occurrence is later than this, so the rule carries on
 *  normally.
 *
 *  ⚠️ WITHOUT THIS, CREATING A REPEATING TASK BEFORE 09:00 ON ONE OF ITS OWN
 *  DAYS PUT THE SAME TASK ON THE BOARD TWICE — once from the form, once from
 *  the job an hour or two later. */
export function todaysOccurrenceInstant(now: Date = new Date()): number {
  const dar = new Date(now.getTime() + 3 * 3_600_000);
  return Date.UTC(dar.getUTCFullYear(), dar.getUTCMonth(), dar.getUTCDate(), RECURRING_FIRES_AT_HOUR) - 3 * 3_600_000;
}

/** Should creating this repeating task also put one on the board RIGHT NOW?
 *  The rule the owner asked for (17 Sep 2026): a task whose next turn is a
 *  future day is SAVED, not created — nothing appears until that day comes.
 *  Today's copy is made when today is one of the chosen days, or when the
 *  person ticked "create one for today as well". */
export function shouldCreateTodaysCopy(
  r: { cadence: "weekly" | "monthly"; weekdays: number[]; dayOfMonth: number },
  alsoToday: boolean,
  now: Date = new Date(),
): boolean {
  return occursToday(r, now) || alsoToday;
}

/** The next days (Dar es Salaam calendar dates, "yyyy-mm-dd") this rule will
 *  create a task, soonest first. Today counts only while today's copy has not
 *  been made — `lastFiredAt` at or after today's 09:00 means it has. Built on
 *  `occursToday`, so a date shown here is a date the job will actually act on.
 *  A paused rule has none. */
export function nextOccurrences(
  r: { cadence: "weekly" | "monthly"; weekdays: number[]; dayOfMonth: number | null; paused?: boolean; lastFiredAt?: string | null },
  count = 3,
  now: Date = new Date(),
): string[] {
  if (r.paused) return [];
  if (r.cadence === "weekly" && r.weekdays.length === 0) return [];
  const sched = { cadence: r.cadence, weekdays: r.weekdays, dayOfMonth: r.dayOfMonth ?? 1 };
  const firedToday = !!r.lastFiredAt && new Date(r.lastFiredAt).getTime() >= todaysOccurrenceInstant(now);
  const out: string[] = [];
  for (let i = 0; i < 400 && out.length < count; i++) {
    const day = new Date(now.getTime() + i * 86_400_000);
    if (i === 0 && firedToday) continue;
    if (occursToday(sched, day)) out.push(new Date(day.getTime() + 3 * 3_600_000).toISOString().slice(0, 10));
  }
  return out;
}

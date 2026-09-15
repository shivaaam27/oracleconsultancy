// Recurring-task rules — the ONE shape and the ONE set of checks, shared by the
// portal's door (src/app/portal/(app)/tasks/automations-actions.ts, scoped to
// what the person created) and the Administrator's door
// (src/app/task/recurring-actions.ts, every rule). A rule is an
// `automation_rules` row of kind `recurring_task`; its template lives in
// `config`. This file is CLIENT-SAFE — types and pure functions only, no `sb`.

import type { RuleConfig } from "@/lib/ori/automations";

export const OPEN_STATUSES = ["Not Started", "In Progress", "Under Review", "Blocked", "Waiting External", "Escalated"];
export const PRIORITIES = ["Critical", "High", "Medium", "Low"];

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

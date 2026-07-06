// ORI automation rules — the PURE decision layer.
// Given a rule + its task + the last-update time + "now", decide whether the rule
// should FIRE this tick (and whether it's now finished / should deactivate). All
// side effects (nudge, escalate, create event) live in the cron route; keeping the
// decision pure makes it unit-testable and keeps the scheduling logic honest.

export type RuleKind =
  | "reminder_before_deadline"
  | "nudge_until_update"
  | "escalate_if_no_update"
  | "create_event_after_deadline";

export type RuleConfig = {
  daysBefore?: number;
  channel?: string;
  times?: string[]; // "HH:MM" (Dar es Salaam local)
  afterDays?: number;
  escalateToPersonId?: number;
  title?: string;
  time?: string;
  location?: string;
};

export type AutomationRuleRow = {
  id: number;
  kind: RuleKind;
  config: RuleConfig;
  active: boolean;
  done: boolean;
  createdAt: Date;
  lastFiredAt: Date | null;
};

export type RuleTask = {
  deadline: Date | null;
  status: string;
  createdDate: Date | null;
};

/** The decision for one rule this tick. `fire` triggers the action; `markDone`
 *  retires a one-shot rule; `deactivate` switches a recurring rule off (task
 *  closed, or the nudge got its update). `note` explains why (for the log). */
export type RuleEval = { fire: boolean; markDone?: boolean; deactivate?: boolean; note?: string };

const DAY = 86_400_000;
const isOpen = (status: string) => status !== "Completed" && status !== "Closed";

/** Local Dar es Salaam (UTC+3) start-of-day for a given instant. */
function darDayStart(now: Date): number {
  const shifted = now.getTime() + 3 * 3_600_000; // into UTC+3
  const d = new Date(shifted);
  const midnightUtcPlus3 = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return midnightUtcPlus3 - 3 * 3_600_000; // back to a real UTC instant
}

/** Parse "HH:MM" into an absolute instant on today's Dar es Salaam date. */
function windowInstant(now: Date, hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return darDayStart(now) + h * 3_600_000 + min * 60_000;
}

export function evaluateRule(
  rule: AutomationRuleRow,
  task: RuleTask,
  lastUpdateAt: Date | null,
  now: Date,
): RuleEval {
  if (!rule.active || rule.done) return { fire: false };

  // A closed task retires every rule attached to it.
  if (!isOpen(task.status)) return { fire: false, deactivate: true, note: "task closed" };

  const nowMs = now.getTime();

  switch (rule.kind) {
    case "reminder_before_deadline": {
      if (!task.deadline) return { fire: false };
      const daysBefore = Math.max(0, rule.config.daysBefore ?? 1);
      const fireFrom = task.deadline.getTime() - daysBefore * DAY;
      // Fire once we're inside the window (and not past the deadline by a lot).
      if (nowMs >= fireFrom) return { fire: true, markDone: true, note: `${daysBefore}d before deadline` };
      return { fire: false };
    }

    case "create_event_after_deadline": {
      if (!task.deadline) return { fire: false };
      if (nowMs >= task.deadline.getTime()) return { fire: true, markDone: true, note: "deadline passed" };
      return { fire: false };
    }

    case "escalate_if_no_update": {
      const afterDays = Math.max(0, rule.config.afterDays ?? 1);
      const anchor = (task.createdDate ?? rule.createdAt).getTime();
      if (nowMs < anchor + afterDays * DAY) return { fire: false };
      // An update since the anchor means they're engaged — no escalation, retire.
      if (lastUpdateAt && lastUpdateAt.getTime() >= anchor) return { fire: false, deactivate: true, note: "update posted" };
      return { fire: true, markDone: true, note: `no update in ${afterDays}d` };
    }

    case "nudge_until_update": {
      // They posted an update AFTER the rule was set → stop nudging.
      if (lastUpdateAt && lastUpdateAt.getTime() >= rule.createdAt.getTime()) {
        return { fire: false, deactivate: true, note: "update posted" };
      }
      const times = (rule.config.times && rule.config.times.length ? rule.config.times : ["09:00", "14:00"]);
      // Find the most recent scheduled window that has already arrived today.
      let latestPassed: number | null = null;
      for (const t of times) {
        const inst = windowInstant(now, t);
        if (inst != null && inst <= nowMs && (latestPassed == null || inst > latestPassed)) latestPassed = inst;
      }
      if (latestPassed == null) return { fire: false }; // no window reached yet today
      // Fire once per window: only if we haven't already fired since it opened.
      if (rule.lastFiredAt && rule.lastFiredAt.getTime() >= latestPassed) return { fire: false };
      return { fire: true, note: "scheduled nudge" };
    }

    default:
      return { fire: false };
  }
}

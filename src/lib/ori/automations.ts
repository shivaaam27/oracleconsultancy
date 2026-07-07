// ORI automation rules — the PURE decision layer.
// Given a rule + its task + the last-update time + "now", decide whether the rule
// should FIRE this tick (and whether it's now finished / should deactivate). All
// side effects (nudge, escalate, create event) live in the cron route; keeping the
// decision pure makes it unit-testable and keeps the scheduling logic honest.

export type RuleKind =
  | "reminder_before_deadline"
  | "nudge_until_update"
  | "escalate_if_no_update"
  | "create_event_after_deadline"
  | "auto_close_stale"
  | "auto_reassign_on_leave"
  | "recurring_task";

export type RuleConfig = {
  daysBefore?: number;
  channel?: string;
  times?: string[]; // "HH:MM" (Dar es Salaam local)
  afterDays?: number;
  escalateToPersonId?: number;
  title?: string;
  time?: string;
  location?: string;
  // auto_close_stale: close after this many days with no update; only while the
  // task sits in `statusMatch` (blank = any open status).
  staleDays?: number;
  statusMatch?: string;
  // auto_reassign_on_leave: who to hand the task to while its assignee is on
  // approved leave (blank → the cron falls back to the assignee's manager).
  fallbackPersonId?: number;
  // recurring_task: recreate a standing task on a cadence.
  cadence?: "weekly" | "monthly";
  weekday?: number; // 0=Sun … 6=Sat (weekly)
  dayOfMonth?: number; // 1–31 (monthly)
  companyId?: number;
  priority?: string;
  assigneePersonIds?: number[];
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

    case "auto_close_stale": {
      // Close a task that's sat untouched for N days. If a statusMatch is set, the
      // task must be IN that status (else the rule idles — it only closes stale work
      // in the state the owner cares about, e.g. "Waiting External"). Staleness is
      // measured from the most recent of: last update, task creation, rule creation.
      const staleDays = Math.max(1, Math.round(rule.config.staleDays ?? 7));
      const wantStatus = (rule.config.statusMatch ?? "").trim();
      if (wantStatus && task.status !== wantStatus) return { fire: false };
      const anchor = Math.max(
        lastUpdateAt?.getTime() ?? 0,
        task.createdDate?.getTime() ?? 0,
        rule.createdAt.getTime(),
      );
      if (nowMs < anchor + staleDays * DAY) return { fire: false };
      return { fire: true, markDone: true, note: `no update in ${staleDays}d${wantStatus ? ` (${wantStatus})` : ""} → close` };
    }

    case "auto_reassign_on_leave": {
      // Pure layer only paces this to once per Dar es Salaam day; the cron does the
      // real work (is the current assignee on approved leave today? if so, hand the
      // task to the fallback/manager for the leave window; when they're back, revert).
      // We can't see leave here, so we fire daily and let the cron decide + no-op if
      // nothing changed. This keeps the rule STANDING (never markDone) for the task's
      // life; the generic closed-task guard above retires it.
      const dayStart = darDayStart(now);
      if (rule.lastFiredAt && rule.lastFiredAt.getTime() >= dayStart) return { fire: false };
      return { fire: true, note: "daily leave-cover check" };
    }

    case "recurring_task": {
      // Recreate a standing task on a cadence. The rule is NOT retired by task state
      // (the cron passes a synthetic open task), so it runs indefinitely until the
      // owner switches it off. Fires when the next cadence occurrence has arrived and
      // we haven't already fired for it.
      const cadence = rule.config.cadence === "monthly" ? "monthly" : "weekly";
      const due = nextRecurrenceInstant(rule, now, cadence);
      if (due == null) return { fire: false };
      if (nowMs < due) return { fire: false };
      if (rule.lastFiredAt && rule.lastFiredAt.getTime() >= due) return { fire: false };
      return { fire: true, note: `recurring (${cadence})` };
    }

    default:
      return { fire: false };
  }
}

/** The instant of the current cadence occurrence AT OR BEFORE `now` (Dar es Salaam
 *  local), or null if none has occurred yet since the rule was created. Weekly fires
 *  on `weekday` (default Monday=1) at 09:00; monthly on `dayOfMonth` (default 1) at
 *  09:00, clamped to the month's length. Used to pace recurring_task firing. */
function nextRecurrenceInstant(rule: AutomationRuleRow, now: Date, cadence: "weekly" | "monthly"): number | null {
  const START_HOUR = 9;
  const shifted = new Date(now.getTime() + 3 * 3_600_000); // into UTC+3
  const y = shifted.getUTCFullYear(), mo = shifted.getUTCMonth(), dom = shifted.getUTCDate();
  const localWeekday = shifted.getUTCDay();

  if (cadence === "weekly") {
    const target = Math.min(6, Math.max(0, Math.round(rule.config.weekday ?? 1)));
    // How many days back to the most recent target weekday (0 = today).
    const back = (localWeekday - target + 7) % 7;
    const occDom = dom - back;
    const occ = Date.UTC(y, mo, occDom, START_HOUR) - 3 * 3_600_000;
    return occ >= rule.createdAt.getTime() ? occ : null;
  }
  // monthly
  const wantDom = Math.min(31, Math.max(1, Math.round(rule.config.dayOfMonth ?? 1)));
  const clamp = (yy: number, mm: number) => Math.min(wantDom, new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate());
  const thisMonthDom = clamp(y, mo);
  const thisMonth = Date.UTC(y, mo, thisMonthDom, START_HOUR) - 3 * 3_600_000;
  let occ: number;
  if (now.getTime() >= thisMonth) {
    occ = thisMonth;
  } else {
    const pm = mo === 0 ? 11 : mo - 1;
    const py = mo === 0 ? y - 1 : y;
    occ = Date.UTC(py, pm, clamp(py, pm), START_HOUR) - 3 * 3_600_000;
  }
  return occ >= rule.createdAt.getTime() ? occ : null;
}

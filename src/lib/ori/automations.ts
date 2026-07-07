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
  | "recurring_task"
  | "scheduled_macro"
  | "smart_reminder"
  | "escalation_ladder";

/* smart_reminder — a conditional, time-of-day rule with an opt-in auto-act.
 * The recipe reads WHEN (trigger), IF (condition), WHOSE (scope), WHO hears
 * (audience) and DO (actions). The PURE layer here only decides DUE; all sends,
 * posts and status writes live in the cron (guardrail-gated, auto-act off by
 * default). See tools-smart.ts + api/cron/ori-automations. */
export type SmartTrigger = { byHour?: number; daysBeforeDeadline?: number; onOverdue?: boolean };
export type SmartCondition =
  | "no_update_today"
  | "overdue"
  | "compliance_due_soon"
  | "due_tomorrow"
  | "always"
  | "waiting_external_aged"
  | "no_deadline_or_assignee"
  | "under_review_stale";
export type SmartScope = { personId?: number; companyId?: number; taskId?: number };
export type SmartAudience = { notifyOwner?: boolean; notifyDirectors?: boolean; notifyManagers?: boolean; warnPerson?: boolean; notifyPersonIds?: number[] };
export type SmartActions = { autoAct?: boolean; postUpdate?: boolean; updateText?: string; setStatus?: string; sendChannel?: "email" | "whatsapp" };

/* escalation_ladder — a per-task overdue ladder: as a task ages past each step's
 * overdueDays threshold, the cron notifies the named audience once per step (state
 * dedupes so a step never re-fires). The PURE layer decides WHICH step is newly due
 * this tick; the cron notifies + advances state. */
export type LadderStep = {
  overdueDays: number;
  notifyOwner?: boolean;
  notifyDirectors?: boolean;
  notifyManagers?: boolean;
  warnPerson?: boolean;
  autoEscalate?: boolean;
};
export type LadderConfig = {
  byHour?: number;
  scope?: SmartScope;
  steps: LadderStep[];
  // taskId → highest overdueDays-step already fired (per-task dedupe). The cron
  // updates this after firing; the pure layer only reads it.
  state?: Record<string, number>;
};

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
  // scheduled_macro: run a saved macro (ai_memory kind="macro") on a cadence. At the
  // due time the cron SURFACES the macro's steps as a confirm-and-run prompt — it
  // never auto-executes the steps (Tier 3). Weekly on `weekday` @ `hour`, or monthly
  // on `dayOfMonth` @ `hour`; blank hour → 09:00.
  macroName?: string;
  hour?: number;
  // smart_reminder — the WHEN/IF/WHOSE/WHO/DO recipe. See the type aliases above.
  trigger?: SmartTrigger;
  condition?: SmartCondition;
  scope?: SmartScope;
  audience?: SmartAudience;
  actions?: SmartActions;
  // digest: when the scope matches SEVERAL tasks, aggregate them into ONE
  // notification per audience member (e.g. "5 tasks due tomorrow: DS-003 …")
  // instead of firing per-task. Still dedupes to once per Dar-local day.
  digest?: boolean;
  // weekdaysOnly: skip Dar-local Saturdays/Sundays (applies to any kind).
  weekdaysOnly?: boolean;
  // pausedUntil (ISO date): the rule is not due before this instant, for ANY kind.
  pausedUntil?: string;
  // agingDays: threshold for the *_aged / *_stale smart conditions (sensible
  // defaults 3 for waiting_external_aged, 2 for under_review_stale).
  agingDays?: number;
  // escalation_ladder — the per-task overdue ladder. See LadderConfig above.
  ladder?: LadderConfig;
  // Dedupe: once fired today, we stamp `${ruleId}:${YYYY-MM-DD}` here so the same
  // slot never fires twice — even under frequent (every-15-min) external ticks.
  lastFiredKey?: string;
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
export type RuleEval = {
  fire: boolean;
  markDone?: boolean;
  deactivate?: boolean;
  note?: string;
  // escalation_ladder only: the newly-due step the cron should fire. `overdueDays`
  // doubles as the per-task state key the cron stamps into config.ladder.state.
  ladderStep?: { index: number; overdueDays: number };
};

const DAY = 86_400_000;
const isOpen = (status: string) => status !== "Completed" && status !== "Closed";

/** Local Dar es Salaam (UTC+3) start-of-day for a given instant. Exported so the
 *  cron can compute the same "due tomorrow" window for digest queries. */
export function darDayStart(now: Date): number {
  const shifted = now.getTime() + 3 * 3_600_000; // into UTC+3
  const d = new Date(shifted);
  const midnightUtcPlus3 = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return midnightUtcPlus3 - 3 * 3_600_000; // back to a real UTC instant
}

/** Dar es Salaam (UTC+3) local weekday for an instant (0=Sun … 6=Sat). */
function darWeekday(now: Date): number {
  return new Date(now.getTime() + 3 * 3_600_000).getUTCDay();
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

  // pausedUntil — a snoozed rule is not due before its resume instant (all kinds).
  if (rule.config.pausedUntil) {
    const resume = Date.parse(rule.config.pausedUntil);
    if (!Number.isNaN(resume) && nowMs < resume) return { fire: false, note: "paused" };
  }
  // weekdaysOnly — never due on a Dar-local weekend (all kinds).
  if (rule.config.weekdaysOnly) {
    const wd = darWeekday(now);
    if (wd === 0 || wd === 6) return { fire: false, note: "weekend (weekdaysOnly)" };
  }

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

    case "scheduled_macro": {
      // Propose a saved macro on a cadence. Like recurring_task, this isn't bound to
      // a live task (the cron passes a synthetic open task), so only its cadence gates
      // firing. Weekly when `weekday` is set (default Monday), else monthly on
      // `dayOfMonth`; both at `hour` (default 09:00). Fires once per occurrence.
      const cadence = typeof rule.config.dayOfMonth === "number" && rule.config.weekday == null ? "monthly" : "weekly";
      const due = nextRecurrenceInstant(rule, now, cadence, rule.config.hour);
      if (due == null) return { fire: false };
      if (nowMs < due) return { fire: false };
      if (rule.lastFiredAt && rule.lastFiredAt.getTime() >= due) return { fire: false };
      return { fire: true, note: `scheduled macro (${cadence})` };
    }

    case "smart_reminder": {
      // Conditional, time-of-day rule. DUE = the trigger window has arrived today
      // AND the condition holds AND we haven't already fired for today's slot.
      const cfg = rule.config;
      const trig = cfg.trigger ?? {};
      const cond = cfg.condition ?? "always";
      const todayKey = smartFiredKey(rule.id, now);

      // Already fired for today's slot → never fire again today (idempotent under
      // frequent external ticks).
      if (cfg.lastFiredKey === todayKey) return { fire: false };

      // WHEN — the trigger window must have arrived. byHour: today's Dar-local hour
      // must be at/after it. daysBeforeDeadline / onOverdue: gate on the deadline.
      let windowReached = true;
      if (typeof trig.byHour === "number") {
        const hour = Math.min(23, Math.max(0, Math.round(trig.byHour)));
        const inst = darDayStart(now) + hour * 3_600_000;
        if (nowMs < inst) windowReached = false;
      }
      if (windowReached && typeof trig.daysBeforeDeadline === "number") {
        if (!task.deadline) windowReached = false;
        else if (nowMs < task.deadline.getTime() - Math.max(0, trig.daysBeforeDeadline) * DAY) windowReached = false;
      }
      if (windowReached && trig.onOverdue) {
        if (!task.deadline || nowMs < task.deadline.getTime()) windowReached = false;
      }
      // No explicit trigger at all → treat as "any time today" (fires once/day).
      if (!windowReached) return { fire: false };

      // IF — the condition. `compliance_due_soon` can't be judged purely (needs the
      // requirements table); the cron does that check, so the pure layer passes it
      // through as "window reached" and lets the cron decide.
      let conditionHolds = true;
      if (cond === "no_update_today") {
        // No update since Dar-local start of today.
        const dayStart = darDayStart(now);
        conditionHolds = !(lastUpdateAt && lastUpdateAt.getTime() >= dayStart);
      } else if (cond === "overdue") {
        conditionHolds = !!task.deadline && nowMs >= task.deadline.getTime();
      } else if (cond === "due_tomorrow") {
        // Deadline lands within TOMORROW (Dar es Salaam local day).
        const tomorrowStart = darDayStart(now) + DAY;
        const dl = task.deadline?.getTime();
        conditionHolds = dl != null && dl >= tomorrowStart && dl < tomorrowStart + DAY;
      } else if (cond === "waiting_external_aged") {
        // "Waiting External" AND sat there (no update) ≥ agingDays (default 3).
        const agingDays = Math.max(1, Math.round(cfg.agingDays ?? 3));
        const anchor = Math.max(
          lastUpdateAt?.getTime() ?? 0,
          task.createdDate?.getTime() ?? 0,
          rule.createdAt.getTime(),
        );
        conditionHolds = task.status === "Waiting External" && nowMs >= anchor + agingDays * DAY;
      } else if (cond === "under_review_stale") {
        // "Under Review" AND no update ≥ agingDays (default 2).
        const agingDays = Math.max(1, Math.round(cfg.agingDays ?? 2));
        const anchor = Math.max(
          lastUpdateAt?.getTime() ?? 0,
          task.createdDate?.getTime() ?? 0,
          rule.createdAt.getTime(),
        );
        conditionHolds = task.status === "Under Review" && nowMs >= anchor + agingDays * DAY;
      } else if (cond === "no_deadline_or_assignee") {
        // Open task missing a deadline (purely visible here) OR possibly an assignee.
        // The pure layer can only see the deadline; it passes "needs check" through
        // when a deadline exists and lets the cron confirm the assignee. When the
        // deadline is already missing, the condition definitively holds.
        conditionHolds = true;
      }
      if (!conditionHolds) return { fire: false };

      return { fire: true, note: `smart (${cond})` };
    }

    case "escalation_ladder": {
      // Per-task overdue ladder. DUE = the byHour window has arrived AND the task is
      // overdue AND a higher step-threshold has been crossed than we've already fired
      // for this task. We return the single newly-due step (the highest crossed step
      // above the already-fired mark); the cron notifies + advances state[taskId].
      const ladder = rule.config.ladder;
      if (!ladder || !ladder.steps?.length) return { fire: false };
      if (!task.deadline) return { fire: false };

      // WHEN — optional daily hour gate (Dar-local).
      if (typeof ladder.byHour === "number") {
        const hour = Math.min(23, Math.max(0, Math.round(ladder.byHour)));
        if (nowMs < darDayStart(now) + hour * 3_600_000) return { fire: false };
      }

      const overdueMs = nowMs - task.deadline.getTime();
      if (overdueMs <= 0) return { fire: false }; // not overdue yet
      const overdueDays = Math.floor(overdueMs / DAY);

      const taskId = ladder.scope?.taskId;
      const firedMark = (taskId != null ? ladder.state?.[String(taskId)] : undefined) ?? -1;

      // The highest step whose threshold we've now crossed and haven't yet fired.
      let best: { index: number; overdueDays: number } | null = null;
      ladder.steps.forEach((step, index) => {
        const thresh = Math.max(0, Math.round(step.overdueDays));
        if (overdueDays >= thresh && thresh > firedMark) {
          if (!best || thresh > best.overdueDays) best = { index, overdueDays: thresh };
        }
      });
      if (!best) return { fire: false };
      const due: { index: number; overdueDays: number } = best;
      return { fire: true, note: `ladder step ${due.index} (${due.overdueDays}d overdue)`, ladderStep: due };
    }

    default:
      return { fire: false };
  }
}

/** The once-per-day dedupe key for a smart_reminder: `${ruleId}:${Dar-local date}`.
 *  Stamped into config.lastFiredKey after firing so the same day-slot never fires
 *  twice, even when an external scheduler ticks the engine every few minutes. */
export function smartFiredKey(ruleId: number, now: Date): string {
  const shifted = new Date(now.getTime() + 3 * 3_600_000); // into UTC+3
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  return `${ruleId}:${y}-${m}-${d}`;
}

/** The instant of the current cadence occurrence AT OR BEFORE `now` (Dar es Salaam
 *  local), or null if none has occurred yet since the rule was created. Weekly fires
 *  on `weekday` (default Monday=1) at 09:00; monthly on `dayOfMonth` (default 1) at
 *  09:00, clamped to the month's length. Used to pace recurring_task firing. */
function nextRecurrenceInstant(rule: AutomationRuleRow, now: Date, cadence: "weekly" | "monthly", hourOverride?: number): number | null {
  const START_HOUR = typeof hourOverride === "number" && hourOverride >= 0 && hourOverride <= 23 ? Math.round(hourOverride) : 9;
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

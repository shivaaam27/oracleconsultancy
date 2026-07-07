import { describe, it, expect } from "vitest";
import { evaluateRule, smartFiredKeyFor, type AutomationRuleRow, type RuleTask } from "./automations";

const DAY = 86_400_000;
const now = new Date("2026-07-10T08:00:00.000Z"); // 11:00 in Dar es Salaam (UTC+3)

function rule(partial: Partial<AutomationRuleRow>): AutomationRuleRow {
  return {
    id: 1, kind: "reminder_before_deadline", config: {}, active: true, done: false,
    createdAt: new Date("2026-07-01T00:00:00Z"), lastFiredAt: null, ...partial,
  };
}
const openTask = (over: Partial<RuleTask> = {}): RuleTask => ({ deadline: null, status: "In Progress", createdDate: new Date("2026-07-01T00:00:00Z"), ...over });

describe("evaluateRule", () => {
  it("skips inactive or done rules", () => {
    expect(evaluateRule(rule({ active: false }), openTask(), null, now).fire).toBe(false);
    expect(evaluateRule(rule({ done: true }), openTask(), null, now).fire).toBe(false);
  });

  it("retires any rule when the task is closed", () => {
    const r = evaluateRule(rule({ kind: "nudge_until_update" }), openTask({ status: "Completed" }), null, now);
    expect(r).toMatchObject({ fire: false, deactivate: true });
  });

  describe("reminder_before_deadline", () => {
    it("fires once inside the N-days-before window", () => {
      const deadline = new Date(now.getTime() + 1 * DAY); // 1 day away
      const r = evaluateRule(rule({ kind: "reminder_before_deadline", config: { daysBefore: 1 } }), openTask({ deadline }), null, now);
      expect(r).toMatchObject({ fire: true, markDone: true });
    });
    it("does not fire while still outside the window", () => {
      const deadline = new Date(now.getTime() + 5 * DAY);
      const r = evaluateRule(rule({ kind: "reminder_before_deadline", config: { daysBefore: 1 } }), openTask({ deadline }), null, now);
      expect(r.fire).toBe(false);
    });
  });

  describe("create_event_after_deadline", () => {
    it("fires once the deadline has passed", () => {
      const deadline = new Date(now.getTime() - 1 * DAY);
      expect(evaluateRule(rule({ kind: "create_event_after_deadline" }), openTask({ deadline }), null, now)).toMatchObject({ fire: true, markDone: true });
    });
    it("waits while the deadline is in the future", () => {
      const deadline = new Date(now.getTime() + 1 * DAY);
      expect(evaluateRule(rule({ kind: "create_event_after_deadline" }), openTask({ deadline }), null, now).fire).toBe(false);
    });
  });

  describe("escalate_if_no_update", () => {
    const created = new Date(now.getTime() - 2 * DAY); // 2 days ago
    it("escalates when no update within N days", () => {
      const r = evaluateRule(rule({ kind: "escalate_if_no_update", config: { afterDays: 1 } }), openTask({ createdDate: created }), null, now);
      expect(r).toMatchObject({ fire: true, markDone: true });
    });
    it("retires (no escalation) when an update was posted", () => {
      const update = new Date(now.getTime() - 1 * DAY);
      const r = evaluateRule(rule({ kind: "escalate_if_no_update", config: { afterDays: 1 } }), openTask({ createdDate: created }), update, now);
      expect(r).toMatchObject({ fire: false, deactivate: true });
    });
    it("waits before the window is reached", () => {
      const freshTask = openTask({ createdDate: new Date(now.getTime() - 2 * 3600_000) }); // 2h ago
      expect(evaluateRule(rule({ kind: "escalate_if_no_update", config: { afterDays: 1 } }), freshTask, null, now).fire).toBe(false);
    });
  });

  describe("nudge_until_update", () => {
    it("fires at a passed window when no update and not already fired", () => {
      // 09:00 Dar window has passed by 11:00; never fired.
      const r = evaluateRule(rule({ kind: "nudge_until_update", config: { times: ["09:00", "14:00"] } }), openTask(), null, now);
      expect(r.fire).toBe(true);
    });
    it("does not fire twice in the same window", () => {
      const firedAt = new Date(darLocal9(now)); // fired at today's 09:00
      const r = evaluateRule(rule({ kind: "nudge_until_update", lastFiredAt: firedAt, config: { times: ["09:00", "14:00"] } }), openTask(), null, now);
      expect(r.fire).toBe(false);
    });
    it("stops nudging once an update is posted after the rule was set", () => {
      const created = new Date("2026-07-05T00:00:00Z");
      const update = new Date("2026-07-09T00:00:00Z");
      const r = evaluateRule(rule({ kind: "nudge_until_update", createdAt: created }), openTask(), update, now);
      expect(r).toMatchObject({ fire: false, deactivate: true });
    });
  });

  describe("auto_close_stale", () => {
    const created = new Date("2026-07-01T00:00:00Z"); // rule + task created 9 days ago
    it("closes when untouched past the stale window", () => {
      const r = evaluateRule(rule({ kind: "auto_close_stale", createdAt: created, config: { staleDays: 7 } }), openTask({ createdDate: created }), null, now);
      expect(r).toMatchObject({ fire: true, markDone: true });
    });
    it("does not close while still inside the window", () => {
      const r = evaluateRule(rule({ kind: "auto_close_stale", createdAt: created, config: { staleDays: 30 } }), openTask({ createdDate: created }), null, now);
      expect(r.fire).toBe(false);
    });
    it("measures staleness from the LAST update, not creation", () => {
      const recentUpdate = new Date(now.getTime() - 1 * DAY); // updated yesterday
      const r = evaluateRule(rule({ kind: "auto_close_stale", createdAt: created, config: { staleDays: 7 } }), openTask({ createdDate: created }), recentUpdate, now);
      expect(r.fire).toBe(false);
    });
    it("idles when a statusMatch is set and the task is in another status", () => {
      const r = evaluateRule(rule({ kind: "auto_close_stale", createdAt: created, config: { staleDays: 7, statusMatch: "Waiting External" } }), openTask({ createdDate: created, status: "In Progress" }), null, now);
      expect(r.fire).toBe(false);
    });
    it("fires when the task IS in the matched status", () => {
      const r = evaluateRule(rule({ kind: "auto_close_stale", createdAt: created, config: { staleDays: 7, statusMatch: "Waiting External" } }), openTask({ createdDate: created, status: "Waiting External" }), null, now);
      expect(r).toMatchObject({ fire: true, markDone: true });
    });
  });

  describe("auto_reassign_on_leave", () => {
    it("fires a daily leave-cover check (never markDone — it stays standing)", () => {
      const r = evaluateRule(rule({ kind: "auto_reassign_on_leave" }), openTask(), null, now);
      expect(r.fire).toBe(true);
      expect(r.markDone).toBeUndefined();
    });
    it("does not fire twice on the same day", () => {
      const firedToday = new Date(darLocal9(now)); // already ran at 09:00 today
      const r = evaluateRule(rule({ kind: "auto_reassign_on_leave", lastFiredAt: firedToday }), openTask(), null, now);
      expect(r.fire).toBe(false);
    });
    it("retires when the task closes", () => {
      const r = evaluateRule(rule({ kind: "auto_reassign_on_leave" }), openTask({ status: "Closed" }), null, now);
      expect(r).toMatchObject({ fire: false, deactivate: true });
    });
  });

  describe("recurring_task", () => {
    // now = 2026-07-10 (a Friday) 11:00 Dar es Salaam.
    const created = new Date("2026-07-01T00:00:00Z");
    it("fires weekly once the target weekday's 09:00 has passed", () => {
      // Friday = 5; today IS Friday and 09:00 has passed → occurrence is today.
      const r = evaluateRule(rule({ kind: "recurring_task", createdAt: created, config: { cadence: "weekly", weekday: 5 } }), openTask(), null, now);
      expect(r.fire).toBe(true);
    });
    it("does not fire twice for the same weekly occurrence", () => {
      const firedToday = new Date(darLocal9(now)); // ≥ today's 09:00 occurrence
      const r = evaluateRule(rule({ kind: "recurring_task", lastFiredAt: firedToday, createdAt: created, config: { cadence: "weekly", weekday: 5 } }), openTask(), null, now);
      expect(r.fire).toBe(false);
    });
    it("does not fire a weekly occurrence that predates the rule", () => {
      // Rule created today; last Monday's occurrence is before createdAt → nothing due.
      const createdToday = new Date("2026-07-10T12:00:00Z");
      const r = evaluateRule(rule({ kind: "recurring_task", createdAt: createdToday, config: { cadence: "weekly", weekday: 1 } }), openTask(), null, now);
      expect(r.fire).toBe(false);
    });
    it("fires monthly once the day-of-month's 09:00 has passed", () => {
      // dayOfMonth 1: the 1st of July (09:00) is well past by the 10th.
      const r = evaluateRule(rule({ kind: "recurring_task", createdAt: created, config: { cadence: "monthly", dayOfMonth: 1 } }), openTask(), null, now);
      expect(r.fire).toBe(true);
    });
    it("waits monthly when the day-of-month is still ahead this month", () => {
      // dayOfMonth 20 not reached on the 10th → the prior occurrence is 20 June,
      // which is before this rule's createdAt (1 July) → nothing due.
      const r = evaluateRule(rule({ kind: "recurring_task", createdAt: created, config: { cadence: "monthly", dayOfMonth: 20 } }), openTask(), null, now);
      expect(r.fire).toBe(false);
    });
  });

  describe("smart_reminder", () => {
    // now = 2026-07-10 (Friday) 11:00 Dar es Salaam.
    it("does not fire before the byHour window is reached", () => {
      // byHour 14 (14:00 Dar) is still ahead of 11:00.
      const r = evaluateRule(rule({ kind: "smart_reminder", config: { trigger: { byHour: 14 }, condition: "always" } }), openTask(), null, now);
      expect(r.fire).toBe(false);
    });
    it("fires once the byHour window has passed and the condition holds", () => {
      // byHour 9 (09:00 Dar) has passed by 11:00; no_update_today with no update.
      const r = evaluateRule(rule({ kind: "smart_reminder", config: { trigger: { byHour: 9 }, condition: "no_update_today" } }), openTask(), null, now);
      expect(r).toMatchObject({ fire: true });
    });
    it("does not fire when it has already fired today (lastFiredKey dedupe)", () => {
      const r = evaluateRule(rule({ kind: "smart_reminder", config: { trigger: { byHour: 9 }, condition: "no_update_today", lastFiredKey: "1:2026-07-10" } }), openTask(), null, now);
      expect(r.fire).toBe(false);
    });
    it("no_update_today does not fire when an update was posted today", () => {
      const updatedToday = new Date(darLocal9(now) + 3600_000); // 10:00 Dar today
      const r = evaluateRule(rule({ kind: "smart_reminder", config: { trigger: { byHour: 9 }, condition: "no_update_today" } }), openTask(), updatedToday, now);
      expect(r.fire).toBe(false);
    });
    it("overdue condition fires only past the deadline", () => {
      const past = new Date(now.getTime() - 1 * DAY);
      const future = new Date(now.getTime() + 1 * DAY);
      expect(evaluateRule(rule({ kind: "smart_reminder", config: { condition: "overdue" } }), openTask({ deadline: past }), null, now).fire).toBe(true);
      expect(evaluateRule(rule({ kind: "smart_reminder", config: { condition: "overdue" } }), openTask({ deadline: future }), null, now).fire).toBe(false);
    });
    it("due_tomorrow fires when the deadline lands within tomorrow (Dar local)", () => {
      // Tomorrow (Sat 11 Jul, Dar local) at 12:00 Dar = 09:00 UTC.
      const tomorrowNoon = new Date("2026-07-11T09:00:00.000Z");
      const r = evaluateRule(rule({ kind: "smart_reminder", config: { trigger: { byHour: 9 }, condition: "due_tomorrow" } }), openTask({ deadline: tomorrowNoon }), null, now);
      expect(r).toMatchObject({ fire: true });
    });
    it("due_tomorrow does not fire for today's, later or missing deadlines", () => {
      const todayNoon = new Date("2026-07-10T09:00:00.000Z"); // today Dar-local
      const dayAfter = new Date("2026-07-12T09:00:00.000Z");  // day AFTER tomorrow
      const mk = (deadline: Date | null) =>
        evaluateRule(rule({ kind: "smart_reminder", config: { trigger: { byHour: 9 }, condition: "due_tomorrow" } }), openTask({ deadline }), null, now).fire;
      expect(mk(todayNoon)).toBe(false);
      expect(mk(dayAfter)).toBe(false);
      expect(mk(null)).toBe(false);
    });
    it("due_tomorrow catches the very start and end of tomorrow's Dar day", () => {
      const startOfTomorrow = new Date("2026-07-10T21:00:00.000Z"); // 00:00 Sat Dar
      const endOfTomorrow = new Date("2026-07-11T20:59:00.000Z");   // 23:59 Sat Dar
      const startOfDayAfter = new Date("2026-07-11T21:00:00.000Z"); // 00:00 Sun Dar
      const mk = (deadline: Date) =>
        evaluateRule(rule({ kind: "smart_reminder", config: { condition: "due_tomorrow" } }), openTask({ deadline }), null, now).fire;
      expect(mk(startOfTomorrow)).toBe(true);
      expect(mk(endOfTomorrow)).toBe(true);
      expect(mk(startOfDayAfter)).toBe(false);
    });
    it("retires when its scoped task is closed", () => {
      const r = evaluateRule(rule({ kind: "smart_reminder", config: { trigger: { byHour: 9 }, condition: "always" } }), openTask({ status: "Completed" }), null, now);
      expect(r).toMatchObject({ fire: false, deactivate: true });
    });

    it("waiting_external_aged fires only when status matches AND aged past agingDays", () => {
      const created = new Date(now.getTime() - 5 * DAY); // untouched 5 days
      const cfg = { trigger: { byHour: 9 }, condition: "waiting_external_aged" as const, agingDays: 3 };
      // right status + aged → fires
      expect(evaluateRule(rule({ kind: "smart_reminder", config: cfg }), openTask({ status: "Waiting External", createdDate: created }), null, now).fire).toBe(true);
      // right status but not aged yet (2 days) → no
      const fresh = new Date(now.getTime() - 2 * DAY);
      expect(evaluateRule(rule({ kind: "smart_reminder", config: cfg }), openTask({ status: "Waiting External", createdDate: fresh }), null, now).fire).toBe(false);
      // aged but wrong status → no
      expect(evaluateRule(rule({ kind: "smart_reminder", config: cfg }), openTask({ status: "In Progress", createdDate: created }), null, now).fire).toBe(false);
    });

    it("under_review_stale fires only under review with no update past agingDays (default 2)", () => {
      const created = new Date(now.getTime() - 4 * DAY);
      const cfg = { trigger: { byHour: 9 }, condition: "under_review_stale" as const };
      expect(evaluateRule(rule({ kind: "smart_reminder", config: cfg }), openTask({ status: "Under Review", createdDate: created }), null, now).fire).toBe(true);
      // recent update resets the clock → no
      const recent = new Date(now.getTime() - 1 * DAY);
      expect(evaluateRule(rule({ kind: "smart_reminder", config: cfg }), openTask({ status: "Under Review", createdDate: created }), recent, now).fire).toBe(false);
      // wrong status → no
      expect(evaluateRule(rule({ kind: "smart_reminder", config: cfg }), openTask({ status: "In Progress", createdDate: created }), null, now).fire).toBe(false);
    });

    it("no_deadline_or_assignee passes the window through for the cron to confirm", () => {
      const cfg = { trigger: { byHour: 9 }, condition: "no_deadline_or_assignee" as const };
      // missing deadline → definitively holds
      expect(evaluateRule(rule({ kind: "smart_reminder", config: cfg }), openTask({ deadline: null }), null, now).fire).toBe(true);
      // has a deadline → still passes through (cron confirms the assignee)
      expect(evaluateRule(rule({ kind: "smart_reminder", config: cfg }), openTask({ deadline: new Date(now.getTime() + 5 * DAY) }), null, now).fire).toBe(true);
    });
  });

  describe("weekdaysOnly (any kind)", () => {
    // now = 2026-07-10 is a Friday. Sat = 2026-07-11, Sun = 2026-07-12.
    const sat = new Date("2026-07-11T08:00:00.000Z");
    const sun = new Date("2026-07-12T08:00:00.000Z");
    it("does not fire on a Dar-local Saturday/Sunday", () => {
      const r = rule({ kind: "auto_reassign_on_leave", config: { weekdaysOnly: true } });
      expect(evaluateRule(r, openTask(), null, sat).fire).toBe(false);
      expect(evaluateRule(r, openTask(), null, sun).fire).toBe(false);
    });
    it("fires normally on a weekday", () => {
      const r = rule({ kind: "auto_reassign_on_leave", config: { weekdaysOnly: true } });
      expect(evaluateRule(r, openTask(), null, now).fire).toBe(true);
    });
  });

  describe("pausedUntil (any kind)", () => {
    it("does not fire before the resume instant", () => {
      const future = new Date(now.getTime() + 3 * DAY).toISOString();
      const r = evaluateRule(rule({ kind: "auto_reassign_on_leave", config: { pausedUntil: future } }), openTask(), null, now);
      expect(r.fire).toBe(false);
    });
    it("fires once the resume instant has passed", () => {
      const past = new Date(now.getTime() - 1 * DAY).toISOString();
      const r = evaluateRule(rule({ kind: "auto_reassign_on_leave", config: { pausedUntil: past } }), openTask(), null, now);
      expect(r.fire).toBe(true);
    });
  });

  describe("escalation_ladder", () => {
    const steps = [
      { overdueDays: 2, notifyOwner: true },
      { overdueDays: 5, notifyDirectors: true },
    ];
    it("fires the day-2 step at 2 days overdue, not the day-5 step", () => {
      const deadline = new Date(now.getTime() - 2 * DAY); // exactly 2 days overdue
      const r = evaluateRule(
        rule({ kind: "escalation_ladder", config: { ladder: { scope: { taskId: 7 }, steps } } }),
        openTask({ deadline }), null, now,
      );
      expect(r.fire).toBe(true);
      expect(r.ladderStep).toMatchObject({ index: 0, overdueDays: 2 });
    });
    it("fires the day-5 step once 5 days overdue", () => {
      const deadline = new Date(now.getTime() - 6 * DAY);
      const r = evaluateRule(
        rule({ kind: "escalation_ladder", config: { ladder: { scope: { taskId: 7 }, steps } } }),
        openTask({ deadline }), null, now,
      );
      expect(r.ladderStep).toMatchObject({ index: 1, overdueDays: 5 });
    });
    it("does not re-fire a step already recorded in state", () => {
      const deadline = new Date(now.getTime() - 3 * DAY); // past the day-2 step
      const r = evaluateRule(
        rule({ kind: "escalation_ladder", config: { ladder: { scope: { taskId: 7 }, steps, state: { "7": 2 } } } }),
        openTask({ deadline }), null, now,
      );
      expect(r.fire).toBe(false);
    });
    it("does not fire before the task is overdue", () => {
      const deadline = new Date(now.getTime() + 1 * DAY);
      const r = evaluateRule(
        rule({ kind: "escalation_ladder", config: { ladder: { scope: { taskId: 7 }, steps } } }),
        openTask({ deadline }), null, now,
      );
      expect(r.fire).toBe(false);
    });
    it("respects byHour before firing", () => {
      const deadline = new Date(now.getTime() - 3 * DAY);
      const r = evaluateRule(
        rule({ kind: "escalation_ladder", config: { ladder: { byHour: 14, scope: { taskId: 7 }, steps } } }),
        openTask({ deadline }), null, now, // now = 11:00 Dar, before 14:00
      );
      expect(r.fire).toBe(false);
    });
  });

  describe("smart_reminder — minute precision, once, hoursBeforeDeadline", () => {
    // now = 11:00 Dar es Salaam.
    it("waits before byHour:byMinute is reached (11:45 not yet at 11:00)", () => {
      const r = evaluateRule(
        rule({ kind: "smart_reminder", config: { trigger: { byHour: 11, byMinute: 45 }, condition: "always" } }),
        openTask(), null, now,
      );
      expect(r.fire).toBe(false);
    });
    it("fires once byHour:byMinute has passed (10:45 at 11:00)", () => {
      const r = evaluateRule(
        rule({ kind: "smart_reminder", config: { trigger: { byHour: 10, byMinute: 45 }, condition: "always" } }),
        openTask(), null, now,
      );
      expect(r.fire).toBe(true);
    });
    it("a once rule fires with markDone (the cron also retires it)", () => {
      const r = evaluateRule(
        rule({ kind: "smart_reminder", config: { trigger: { byHour: 10, byMinute: 45 }, condition: "always", once: true } }),
        openTask(), null, now,
      );
      expect(r).toMatchObject({ fire: true, markDone: true });
    });
    it("hoursBeforeDeadline waits outside the window", () => {
      const deadline = new Date(now.getTime() + 2 * 3600_000); // due in 2h
      const r = evaluateRule(
        rule({ kind: "smart_reminder", config: { trigger: { hoursBeforeDeadline: 1 }, condition: "always" } }),
        openTask({ deadline }), null, now,
      );
      expect(r.fire).toBe(false);
    });
    it("hoursBeforeDeadline fires inside the window", () => {
      const deadline = new Date(now.getTime() + 30 * 60_000); // due in 30 min
      const r = evaluateRule(
        rule({ kind: "smart_reminder", config: { trigger: { hoursBeforeDeadline: 1 }, condition: "always" } }),
        openTask({ deadline }), null, now,
      );
      expect(r.fire).toBe(true);
    });
    it("hoursBeforeDeadline dedupes per deadline-instant and re-arms when the deadline moves", () => {
      const deadline = new Date(now.getTime() + 30 * 60_000);
      const firedKey = smartFiredKeyFor(1, now, { hoursBeforeDeadline: 1 }, deadline);
      // Same deadline, already stamped → no re-fire.
      const same = evaluateRule(
        rule({ kind: "smart_reminder", config: { trigger: { hoursBeforeDeadline: 1 }, condition: "always", lastFiredKey: firedKey } }),
        openTask({ deadline }), null, now,
      );
      expect(same.fire).toBe(false);
      // Deadline moved to still-inside-the-window → different key → fires again.
      const moved = new Date(now.getTime() + 45 * 60_000);
      const rearmed = evaluateRule(
        rule({ kind: "smart_reminder", config: { trigger: { hoursBeforeDeadline: 1 }, condition: "always", lastFiredKey: firedKey } }),
        openTask({ deadline: moved }), null, now,
      );
      expect(rearmed.fire).toBe(true);
    });
    it("daily key still dedupes a byHour:byMinute rule for the day", () => {
      const firedKey = smartFiredKeyFor(1, now, { byHour: 10, byMinute: 45 }, null);
      const r = evaluateRule(
        rule({ kind: "smart_reminder", config: { trigger: { byHour: 10, byMinute: 45 }, condition: "always", lastFiredKey: firedKey } }),
        openTask(), null, now,
      );
      expect(r.fire).toBe(false);
    });
  });
});

describe("smart_reminder INTERVAL mode (repeating nudge that stops on response)", () => {
  // A repeat rule scoped to an overdue task, pinging every 6h until they update.
  const overdue = () => openTask({ deadline: new Date(now.getTime() - 2 * DAY) });
  const intervalRule = (cfg: Record<string, unknown> = {}, over: Partial<AutomationRuleRow> = {}) =>
    rule({ kind: "smart_reminder", config: { trigger: { onOverdue: true }, condition: "always", repeatEveryMinutes: 360, untilUpdate: true, ...cfg }, ...over });

  it("fires immediately once the window is open and it has never fired", () => {
    const r = evaluateRule(intervalRule(), overdue(), null, now);
    expect(r.fire).toBe(true);
  });

  it("does not fire again before the interval has elapsed", () => {
    const firedAt = new Date(now.getTime() - 2 * 3600_000); // 2h ago, interval is 6h
    const r = evaluateRule(intervalRule({}, { lastFiredAt: firedAt }), overdue(), null, now);
    expect(r.fire).toBe(false);
  });

  it("fires again once the interval has elapsed", () => {
    const firedAt = new Date(now.getTime() - 7 * 3600_000); // 7h ago > 6h interval
    const r = evaluateRule(intervalRule({}, { lastFiredAt: firedAt }), overdue(), null, now);
    expect(r.fire).toBe(true);
  });

  it("STOPS (deactivates) the moment an update is posted after the rule armed", () => {
    const armed = new Date(now.getTime() - 10 * 3600_000);
    const update = new Date(now.getTime() - 1 * 3600_000); // update after arm
    const r = evaluateRule(intervalRule({ armedAt: armed.toISOString() }), overdue(), update, now);
    expect(r).toMatchObject({ fire: false, deactivate: true });
  });

  it("does NOT stop for an update that predates the arm time", () => {
    const armed = new Date(now.getTime() - 1 * 3600_000);
    const staleUpdate = new Date(now.getTime() - 5 * 3600_000); // before arm
    const r = evaluateRule(intervalRule({ armedAt: armed.toISOString() }), overdue(), staleUpdate, now);
    expect(r.fire).toBe(true);
  });

  it("retires when maxCount is reached", () => {
    const r = evaluateRule(intervalRule({ untilUpdate: false, maxCount: 3, firedCount: 3 }), overdue(), null, now);
    expect(r).toMatchObject({ fire: false, deactivate: true });
  });

  it("retires when untilDeadline and the deadline has passed", () => {
    const r = evaluateRule(intervalRule({ untilUpdate: false, untilDeadline: true }), overdue(), null, now);
    expect(r).toMatchObject({ fire: false, deactivate: true });
  });

  it("does not stop on untilDeadline while the deadline is still ahead", () => {
    const ahead = openTask({ deadline: new Date(now.getTime() + 2 * DAY) });
    // window opened via byHour (any time) since onOverdue would be false here
    const r = evaluateRule(intervalRule({ trigger: { byHour: 0 }, untilUpdate: false, untilDeadline: true }), ahead, null, now);
    expect(r).toMatchObject({ fire: true });
  });

  it("waits until the start trigger opens the window (not overdue yet)", () => {
    const ahead = openTask({ deadline: new Date(now.getTime() + 2 * DAY) });
    const r = evaluateRule(intervalRule(), ahead, null, now); // onOverdue, not overdue
    expect(r.fire).toBe(false);
  });

  it("does not fire outside the active-hours window", () => {
    // now is 11:00 Dar; a 20:00–23:00 window excludes it.
    const r = evaluateRule(intervalRule({ window: { fromHour: 20, toHour: 23 } }), overdue(), null, now);
    expect(r.fire).toBe(false);
  });

  it("fires inside the active-hours window", () => {
    const r = evaluateRule(intervalRule({ window: { fromHour: 8, toHour: 20 } }), overdue(), null, now);
    expect(r.fire).toBe(true);
  });

  it("honours the 15-minute floor (10-min config paced as 15)", () => {
    // Fired 12 min ago: < 15-min floor → must NOT fire despite the 10-min config.
    const firedAt = new Date(now.getTime() - 12 * 60_000);
    const r = evaluateRule(intervalRule({ repeatEveryMinutes: 10 }, { lastFiredAt: firedAt }), overdue(), null, now);
    expect(r.fire).toBe(false);
  });

  it("skips the weekend when weekdaysOnly is set", () => {
    // 2026-07-11 is a Saturday.
    const sat = new Date("2026-07-11T08:00:00.000Z");
    const r = evaluateRule(intervalRule({ weekdaysOnly: true }), openTask({ deadline: new Date(sat.getTime() - 2 * DAY) }), null, sat);
    expect(r.fire).toBe(false);
  });
});

// today's 09:00 Dar es Salaam as a UTC instant (06:00 UTC)
function darLocal9(n: Date): number {
  const shifted = n.getTime() + 3 * 3600_000;
  const d = new Date(shifted);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - 3 * 3600_000 + 9 * 3600_000;
}

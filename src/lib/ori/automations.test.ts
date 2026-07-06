import { describe, it, expect } from "vitest";
import { evaluateRule, type AutomationRuleRow, type RuleTask } from "./automations";

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
});

// today's 09:00 Dar es Salaam as a UTC instant (06:00 UTC)
function darLocal9(n: Date): number {
  const shifted = n.getTime() + 3 * 3600_000;
  const d = new Date(shifted);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - 3 * 3600_000 + 9 * 3600_000;
}

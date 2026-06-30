import { describe, it, expect } from "vitest";
import { computePersonKpi, computeKpiLeaderboard } from "./kpi";
import type { TaskRow } from "./queries";

// Minimal TaskRow factory — only the fields the KPI engine reads.
function task(p: Partial<TaskRow>): TaskRow {
  return {
    id: 1, code: "X-001", legacyCode: null, companyId: 1, companyName: "C",
    companyAccent: null, department: null, actionItem: "t", owner: null, ownerId: null,
    createdByPersonId: null, requiresAttachment: false, assignees: [], assigneeIds: [],
    leadIds: [], accountability: "shared", blockedOnPersonId: null, blockedReason: null, partDoneIds: [],
    meetingDate: null, createdDate: null, deadline: null, status: "Not Started",
    priority: "Medium", category: null, risk: null, escalation: null, comments: null,
    latestUpdate: null, lastUpdatedAt: null, closedDate: null, daysOpen: null,
    daysToDeadline: null, flag: "on-track", latestActivity: null, updateCount: 0,
    pinned: false, lastActivityISO: "", waiting: false, archived: false,
    ...p,
  } as TaskRow;
}

const MAY = { y: 2026, m: 5 };
const d = (s: string) => new Date(s);

describe("computePersonKpi", () => {
  it("credits creator separately from delivery on the same task", () => {
    const tasks = [
      task({ createdByPersonId: 71, leadIds: [5], assigneeIds: [5], status: "Completed", closedDate: d("2026-05-10") }),
    ];
    const creator = computePersonKpi(71, tasks, MAY.y, MAY.m);
    const doer = computePersonKpi(5, tasks, MAY.y, MAY.m);
    expect(creator.createdDone).toBe(1);
    expect(creator.involvedDone).toBe(0);
    expect(doer.involvedDone).toBe(1);
    expect(doer.createdDone).toBe(0);
  });

  it("credits BOTH lead and working contributors on a completed task", () => {
    const tasks = [
      task({ leadIds: [5], assigneeIds: [5, 8], status: "Completed", closedDate: d("2026-05-10") }),
    ];
    const lead = computePersonKpi(5, tasks, MAY.y, MAY.m);
    const worker = computePersonKpi(8, tasks, MAY.y, MAY.m);
    expect(lead.involvedDone).toBe(1);
    expect(lead.ledDone).toBe(1);
    expect(worker.involvedDone).toBe(1); // working contributor still scores
    expect(worker.ledDone).toBe(0); // but is not the lead
  });

  it("credits the owner even with no assignee rows", () => {
    const tasks = [task({ ownerId: 5, status: "Completed", closedDate: d("2026-05-10") })];
    expect(computePersonKpi(5, tasks, MAY.y, MAY.m).involvedDone).toBe(1);
  });

  it("counts both Completed and Closed as done", () => {
    const tasks = [
      task({ assigneeIds: [5], status: "Completed", closedDate: d("2026-05-02") }),
      task({ assigneeIds: [5], status: "Closed", closedDate: d("2026-05-03") }),
    ];
    expect(computePersonKpi(5, tasks, MAY.y, MAY.m).involvedDone).toBe(2);
  });

  it("filters by closed month", () => {
    const tasks = [
      task({ assigneeIds: [5], status: "Completed", closedDate: d("2026-05-31") }),
      task({ assigneeIds: [5], status: "Completed", closedDate: d("2026-06-01") }),
    ];
    expect(computePersonKpi(5, tasks, 2026, 5).involvedDone).toBe(1);
    expect(computePersonKpi(5, tasks, 2026, 6).involvedDone).toBe(1);
  });

  it("computes on-time rate over deadline-bearing done tasks only", () => {
    const tasks = [
      task({ assigneeIds: [5], status: "Completed", closedDate: d("2026-05-10"), deadline: d("2026-05-15") }), // on time
      task({ assigneeIds: [5], status: "Completed", closedDate: d("2026-05-20"), deadline: d("2026-05-15") }), // late
      task({ assigneeIds: [5], status: "Completed", closedDate: d("2026-05-10"), deadline: null }), // no deadline → excluded from rate
    ];
    const kpi = computePersonKpi(5, tasks, MAY.y, MAY.m);
    expect(kpi.involvedDone).toBe(3);
    expect(kpi.onTimeCount).toBe(1);
    expect(kpi.lateCount).toBe(1);
    expect(kpi.onTimeRate).toBeCloseTo(0.5);
  });

  it("treats closing on the deadline day as on time", () => {
    const tasks = [
      task({ assigneeIds: [5], status: "Completed", closedDate: d("2026-05-15T18:00:00"), deadline: d("2026-05-15T00:00:00") }),
    ];
    expect(computePersonKpi(5, tasks, MAY.y, MAY.m).onTimeCount).toBe(1);
  });

  it("on-time rate is null when no done task has a deadline", () => {
    const tasks = [task({ assigneeIds: [5], status: "Completed", closedDate: d("2026-05-10") })];
    expect(computePersonKpi(5, tasks, MAY.y, MAY.m).onTimeRate).toBeNull();
  });

  it("counts open involvement + overdue, and penalises score", () => {
    const tasks = [
      task({ assigneeIds: [5], status: "Completed", closedDate: d("2026-05-10") }), // +1 done (no deadline → rate 1)
      task({ assigneeIds: [5], status: "In Progress", flag: "overdue" }), // open + overdue
      task({ assigneeIds: [5], status: "In Progress", flag: "on-track" }), // open only
    ];
    const kpi = computePersonKpi(5, tasks, MAY.y, MAY.m);
    expect(kpi.openInvolved).toBe(2);
    expect(kpi.overdueOpen).toBe(1);
    expect(kpi.score).toBe(0); // 1 done * 1.0 - 1 overdue
  });

  it("score reflects reliability weighting", () => {
    const tasks = [
      task({ assigneeIds: [5], status: "Completed", closedDate: d("2026-05-10"), deadline: d("2026-05-05") }), // late
      task({ assigneeIds: [5], status: "Completed", closedDate: d("2026-05-10"), deadline: d("2026-05-15") }), // on time
    ];
    // 2 done * 0.5 on-time - 0 overdue = 1
    expect(computePersonKpi(5, tasks, MAY.y, MAY.m).score).toBe(1);
  });

  it("shared mode: overdue blames every assignee", () => {
    const tasks = [task({ assigneeIds: [5, 8], leadIds: [5], accountability: "shared", status: "In Progress", flag: "overdue" })];
    expect(computePersonKpi(5, tasks, MAY.y, MAY.m).overdueOpen).toBe(1);
    expect(computePersonKpi(8, tasks, MAY.y, MAY.m).overdueOpen).toBe(1);
  });

  it("lead mode: overdue blames only the lead, not the helper", () => {
    const tasks = [task({ assigneeIds: [5, 8], leadIds: [5], accountability: "lead", status: "In Progress", flag: "overdue" })];
    expect(computePersonKpi(5, tasks, MAY.y, MAY.m).overdueOpen).toBe(1); // lead
    expect(computePersonKpi(8, tasks, MAY.y, MAY.m).overdueOpen).toBe(0); // helper spared
  });

  it("lead mode with no named lead falls back to shared blame", () => {
    const tasks = [task({ assigneeIds: [5, 8], leadIds: [], accountability: "lead", status: "In Progress", flag: "overdue" })];
    expect(computePersonKpi(8, tasks, MAY.y, MAY.m).overdueOpen).toBe(1);
  });

  it("documented blocker suspends overdue for everyone", () => {
    const tasks = [task({ assigneeIds: [5, 8], leadIds: [5], accountability: "shared", blockedOnPersonId: 99, status: "Blocked", flag: "overdue" })];
    expect(computePersonKpi(5, tasks, MAY.y, MAY.m).overdueOpen).toBe(0);
    expect(computePersonKpi(8, tasks, MAY.y, MAY.m).overdueOpen).toBe(0);
  });

  it("'my part done' spares that person but not the others", () => {
    const tasks = [task({ assigneeIds: [5, 8], leadIds: [5], accountability: "shared", partDoneIds: [8], status: "In Progress", flag: "overdue" })];
    expect(computePersonKpi(8, tasks, MAY.y, MAY.m).overdueOpen).toBe(0); // delivered their part
    expect(computePersonKpi(5, tasks, MAY.y, MAY.m).overdueOpen).toBe(1);
  });

  it("leaderboard sorts by score descending", () => {
    const tasks = [
      task({ assigneeIds: [5], status: "Completed", closedDate: d("2026-05-10") }),
      task({ assigneeIds: [5], status: "Completed", closedDate: d("2026-05-11") }),
      task({ assigneeIds: [9], status: "Completed", closedDate: d("2026-05-10") }),
    ];
    const board = computeKpiLeaderboard([5, 9], tasks, MAY.y, MAY.m);
    expect(board.map((k) => k.personId)).toEqual([5, 9]);
    expect(board[0].involvedDone).toBe(2);
  });
});

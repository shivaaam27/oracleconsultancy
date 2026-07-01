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

describe("computePersonKpi (union-count model)", () => {
  it("credits the creator when their task is completed", () => {
    const tasks = [task({ createdByPersonId: 71, status: "Completed", closedDate: d("2026-05-10") })];
    expect(computePersonKpi(71, tasks, MAY.y, MAY.m).completed).toBe(1);
  });

  it("credits an assignee (any role) on completion", () => {
    const tasks = [
      task({ assigneeIds: [5], status: "Completed", closedDate: d("2026-05-10") }),
      task({ leadIds: [8], status: "Closed", closedDate: d("2026-05-11") }),
      task({ ownerId: 9, status: "Completed", closedDate: d("2026-05-12") }),
    ];
    expect(computePersonKpi(5, tasks, MAY.y, MAY.m).completed).toBe(1);
    expect(computePersonKpi(8, tasks, MAY.y, MAY.m).completed).toBe(1);
    expect(computePersonKpi(9, tasks, MAY.y, MAY.m).completed).toBe(1);
  });

  it("counts creator + assignee as ONE credit each (no duplication)", () => {
    // M creates and is also accountable; W is a doer.
    const tasks = [task({ createdByPersonId: 1, assigneeIds: [1, 2], leadIds: [1], status: "Completed", closedDate: d("2026-05-10") })];
    expect(computePersonKpi(1, tasks, MAY.y, MAY.m).completed).toBe(1); // creator+assignee, once
    expect(computePersonKpi(2, tasks, MAY.y, MAY.m).completed).toBe(1); // doer
  });

  it("creator and separate doer each get one credit", () => {
    const tasks = [task({ createdByPersonId: 1, assigneeIds: [2], status: "Completed", closedDate: d("2026-05-10") })];
    expect(computePersonKpi(1, tasks, MAY.y, MAY.m).completed).toBe(1); // creator
    expect(computePersonKpi(2, tasks, MAY.y, MAY.m).completed).toBe(1); // doer
  });

  it("counts both Completed and Closed as done", () => {
    const tasks = [
      task({ assigneeIds: [5], status: "Completed", closedDate: d("2026-05-02") }),
      task({ assigneeIds: [5], status: "Closed", closedDate: d("2026-05-03") }),
    ];
    expect(computePersonKpi(5, tasks, MAY.y, MAY.m).completed).toBe(2);
  });

  it("filters by closed month", () => {
    const tasks = [
      task({ assigneeIds: [5], status: "Completed", closedDate: d("2026-05-31") }),
      task({ assigneeIds: [5], status: "Completed", closedDate: d("2026-06-01") }),
    ];
    expect(computePersonKpi(5, tasks, 2026, 5).completed).toBe(1);
    expect(computePersonKpi(5, tasks, 2026, 6).completed).toBe(1);
  });

  it("does not credit an open (unfinished) task", () => {
    const tasks = [task({ assigneeIds: [5], status: "In Progress" })];
    const k = computePersonKpi(5, tasks, MAY.y, MAY.m);
    expect(k.completed).toBe(0);
    expect(k.openInvolved).toBe(1);
  });

  it("score equals the completed count", () => {
    const tasks = [
      task({ assigneeIds: [5], status: "Completed", closedDate: d("2026-05-10") }),
      task({ createdByPersonId: 5, status: "Closed", closedDate: d("2026-05-11") }),
    ];
    const k = computePersonKpi(5, tasks, MAY.y, MAY.m);
    expect(k.completed).toBe(2);
    expect(k.score).toBe(2);
  });

  it("leaderboard sorts by score (completed) descending", () => {
    const tasks = [
      task({ assigneeIds: [5], status: "Completed", closedDate: d("2026-05-10") }),
      task({ assigneeIds: [5], status: "Completed", closedDate: d("2026-05-11") }),
      task({ assigneeIds: [9], status: "Completed", closedDate: d("2026-05-10") }),
    ];
    const board = computeKpiLeaderboard([5, 9], tasks, MAY.y, MAY.m);
    expect(board.map((k) => k.personId)).toEqual([5, 9]);
    expect(board[0].completed).toBe(2);
  });
});

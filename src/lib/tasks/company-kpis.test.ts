import { describe, it, expect } from "vitest";
import { tasksOfCompany, computeCompanyKpisForCompanies } from "./company-kpis";
import type { TaskRow } from "./queries";

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

// Two companies; person 7 works for BOTH (the Jitesh case). Their Furaha task
// must not show up under V1 just because they also work for V1.
const V1 = 10, FURAHA = 2;
const rows = [
  task({ id: 1, code: "CC-026", companyId: FURAHA, assigneeIds: [7], flag: "overdue", status: "In Progress" }),
  task({ id: 2, code: "VI-003", companyId: V1, assigneeIds: [7], status: "In Progress" }),
  task({ id: 3, code: "VI-001", companyId: V1, assigneeIds: [8], status: "Completed" }),
];
const companies = [{ id: V1, name: "V1", accent: null }, { id: FURAHA, name: "Furaha", accent: null }, { id: 99, name: "Empty", accent: null }];

describe("company task counts", () => {
  it("lists only the tasks filed under the company", () => {
    expect(tasksOfCompany(rows, V1).map((r) => r.code)).toEqual(["VI-003", "VI-001"]);
    expect(tasksOfCompany(rows, FURAHA).map((r) => r.code)).toEqual(["CC-026"]);
  });

  it("does not leak a shared person's task into their other company", () => {
    const k = Object.fromEntries(computeCompanyKpisForCompanies(rows, companies).map((c) => [c.id, c]));
    expect(k[V1]).toMatchObject({ total: 2, open: 1, overdue: 0, completed: 1 });
    expect(k[FURAHA]).toMatchObject({ total: 1, open: 1, overdue: 1 });
  });

  it("gives a task-less company a zero card, and the cards add up to the portfolio", () => {
    const cards = computeCompanyKpisForCompanies(rows, companies);
    expect(cards.find((c) => c.id === 99)).toMatchObject({ total: 0, open: 0, riskScore: 0 });
    expect(cards.reduce((n, c) => n + c.total, 0)).toBe(rows.length);
  });
});

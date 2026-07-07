import { describe, it, expect } from "vitest";
import { computeWorkload, isOverloaded, type WorkloadInput } from "./workload";
import type { TaskRow } from "./queries";

// Minimal TaskRow factory — only the fields computeWorkload reads.
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

const people: WorkloadInput[] = [
  { id: 1, name: "Pulin" },
  { id: 2, name: "Dipto" },
  { id: 3, name: "Hiral" },
  { id: 4, name: "Idle Ivan" },
];

describe("computeWorkload", () => {
  it("counts open tasks per person via owner + assignees, once each", () => {
    const rows = [
      task({ id: 1, ownerId: 1, assigneeIds: [2] }),
      task({ id: 2, ownerId: 1, assigneeIds: [1, 2] }), // owner==assignee: Pulin counts once
      task({ id: 3, ownerId: 3 }),
    ];
    const s = computeWorkload(rows, people);
    const by = new Map(s.people.map((p) => [p.name, p.open]));
    expect(by.get("Pulin")).toBe(2);
    expect(by.get("Dipto")).toBe(2);
    expect(by.get("Hiral")).toBe(1);
    expect(by.get("Idle Ivan")).toBe(0);
    expect(s.totalOpen).toBe(5);
  });

  it("excludes Completed/Closed tasks from open counts", () => {
    const rows = [
      task({ id: 1, ownerId: 1, status: "Completed" }),
      task({ id: 2, ownerId: 1, status: "Closed" }),
      task({ id: 3, ownerId: 1, status: "In Progress" }),
    ];
    const s = computeWorkload(rows, people);
    expect(s.people.find((p) => p.name === "Pulin")!.open).toBe(1);
  });

  it("counts overdue only for open, past-deadline (flagged) tasks", () => {
    const rows = [
      task({ id: 1, ownerId: 1, flag: "overdue" }),
      task({ id: 2, ownerId: 1, flag: "escalate-now" }),
      task({ id: 3, ownerId: 1, flag: "on-track" }),
    ];
    const s = computeWorkload(rows, people);
    const p = s.people.find((x) => x.name === "Pulin")!;
    expect(p.open).toBe(3);
    expect(p.overdue).toBe(2);
  });

  it("sorts heaviest-first with idle people parked last", () => {
    const rows = [
      ...Array.from({ length: 5 }, (_, i) => task({ id: 100 + i, ownerId: 1 })),
      task({ id: 200, ownerId: 2 }),
    ];
    const s = computeWorkload(rows, people);
    expect(s.people.map((p) => p.name)).toEqual(["Pulin", "Dipto", "Hiral", "Idle Ivan"]);
    expect(s.people.at(-1)!.open).toBe(0);
  });

  it("flags a person well above the team average", () => {
    // Pulin 14, Dipto 3, Hiral 1 → mean 6. Pulin >= 1.5*6 (9) AND >= 6+3 (9): flagged.
    const rows = [
      ...Array.from({ length: 14 }, (_, i) => task({ id: 300 + i, ownerId: 1 })),
      ...Array.from({ length: 3 }, (_, i) => task({ id: 400 + i, ownerId: 2 })),
      task({ id: 500, ownerId: 3 }),
    ];
    const s = computeWorkload(rows, people);
    expect(s.average).toBe(6);
    expect(s.overloaded.map((p) => p.name)).toEqual(["Pulin"]);
    expect(s.people.find((p) => p.name === "Dipto")!.overloaded).toBe(false);
  });

  it("does not flag on a small team where the mean is tiny", () => {
    // open 2 vs 1 → mean 1.5; 2 < 1.5*1.5 (2.25) and 2 < 1.5+3 → not flagged.
    const rows = [
      task({ id: 1, ownerId: 1 }),
      task({ id: 2, ownerId: 1 }),
      task({ id: 3, ownerId: 2 }),
    ];
    const s = computeWorkload(rows, people);
    expect(s.overloaded).toHaveLength(0);
  });
});

describe("isOverloaded", () => {
  it("requires both gates: >= 1.5x mean AND >= mean + 3", () => {
    expect(isOverloaded(9, 6)).toBe(true);
    expect(isOverloaded(8, 6)).toBe(false); // fails mean+3 (9) despite ~1.33x
    expect(isOverloaded(4, 2)).toBe(false); // 2x mean but < mean+3 (5)
    expect(isOverloaded(0, 6)).toBe(false);
    expect(isOverloaded(5, 0)).toBe(false);
  });
});

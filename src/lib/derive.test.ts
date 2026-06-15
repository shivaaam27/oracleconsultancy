import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { flag, isOpen, daysToDeadline } from "@/lib/derive";

// Task status derivation — drives every overdue/at-risk signal in the system.
// today() reads the clock, so we freeze time to keep these deterministic.

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-15T08:00:00Z"));
});
afterEach(() => vi.useRealTimers());

const d = (iso: string) => new Date(iso);

describe("isOpen", () => {
  it("true for active statuses", () => {
    expect(isOpen("In Progress")).toBe(true);
  });
  it("false for Completed / Closed", () => {
    expect(isOpen("Completed")).toBe(false);
    expect(isOpen("Closed")).toBe(false);
  });
});

describe("daysToDeadline", () => {
  it("returns 'done' for closed tasks regardless of deadline", () => {
    expect(daysToDeadline({ status: "Completed", deadline: d("2020-01-01") })).toBe("done");
  });
  it("null when there is no deadline", () => {
    expect(daysToDeadline({ status: "In Progress" })).toBe(null);
  });
  it("positive count for a future deadline", () => {
    expect(daysToDeadline({ status: "In Progress", deadline: d("2026-06-25T08:00:00Z") })).toBe(10);
  });
});

describe("flag", () => {
  const base = { status: "In Progress", priority: "Medium", createdDate: d("2026-06-01T00:00:00Z") };

  it("closed", () => expect(flag({ ...base, status: "Closed" })).toBe("closed"));
  it("escalated", () => expect(flag({ ...base, status: "Escalated" })).toBe("escalated"));
  it("no-deadline", () => expect(flag({ ...base })).toBe("no-deadline"));
  it("overdue", () => expect(flag({ ...base, deadline: d("2026-06-10T00:00:00Z") })).toBe("overdue"));
  it("escalate-now for a Critical overdue task", () =>
    expect(flag({ ...base, priority: "Critical", deadline: d("2026-06-10T00:00:00Z") })).toBe("escalate-now"));
  it("due-soon within the window", () =>
    expect(flag({ ...base, deadline: d("2026-06-16T12:00:00Z") })).toBe("due-soon"));
  it("on-track for a far deadline", () =>
    expect(flag({ ...base, deadline: d("2026-09-01T00:00:00Z") })).toBe("on-track"));
  it("stalled when Blocked for too long", () =>
    expect(flag({ status: "Blocked", createdDate: d("2026-05-01T00:00:00Z"), deadline: d("2026-09-01T00:00:00Z") })).toBe("stalled"));
});

import { describe, it, expect } from "vitest";
import { workingDaysBetween, leaveCycleStart } from "@/lib/leave";

// Leave maths — Mon–Sat working days minus Sundays and public holidays, and the
// fixed calendar-anchored leave-year boundary.

const D = (iso: string) => new Date(iso + "T00:00:00Z");

describe("workingDaysBetween", () => {
  it("counts Mon–Sat and skips Sunday", () => {
    // 2026-06-15 is a Monday; 15–20 = 6 working days, Sun 21 is free.
    expect(workingDaysBetween(D("2026-06-15"), D("2026-06-21"), new Set())).toBe(6);
  });
  it("excludes public holidays in the range", () => {
    expect(workingDaysBetween(D("2026-06-15"), D("2026-06-20"), new Set(["2026-06-17"]))).toBe(5);
  });
  it("a single weekday counts as 1", () => {
    expect(workingDaysBetween(D("2026-06-15"), D("2026-06-15"), new Set())).toBe(1);
  });
  it("end before start → 0", () => {
    expect(workingDaysBetween(D("2026-06-20"), D("2026-06-15"), new Set())).toBe(0);
  });
});

describe("leaveCycleStart", () => {
  it("12-month cycle anchors to 1 January of the current year", () => {
    expect(leaveCycleStart(12, new Date("2026-06-15T00:00:00Z")).toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });
  it("36-month cycle reaches back three calendar years", () => {
    expect(leaveCycleStart(36, new Date("2026-06-15T00:00:00Z")).toISOString()).toBe("2024-01-01T00:00:00.000Z");
  });
});

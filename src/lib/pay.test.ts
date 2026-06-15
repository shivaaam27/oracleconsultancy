import { describe, it, expect } from "vitest";
import { dailyWage, completedYears, estimateFinalPay } from "@/lib/pay";

// Money path — ELR Act final-pay maths. A silent break here would mis-state what
// a leaver is owed, so these lock the rules in place.

describe("dailyWage", () => {
  it("monthly uses the /26 working-day convention", () => {
    expect(dailyWage(260000, "monthly")).toBeCloseTo(10000);
  });
  it("daily returns the amount as-is", () => {
    expect(dailyWage(15000, "daily")).toBe(15000);
  });
  it("hourly assumes an 8-hour day", () => {
    expect(dailyWage(2000, "hourly")).toBe(16000);
  });
  it("zero / negative amount → 0", () => {
    expect(dailyWage(0, "monthly")).toBe(0);
    expect(dailyWage(-5, "daily")).toBe(0);
  });
  it("null basis defaults to monthly", () => {
    expect(dailyWage(260000, null)).toBeCloseTo(10000);
  });
});

describe("completedYears", () => {
  it("counts whole completed years", () => {
    expect(completedYears(new Date(Date.UTC(2020, 0, 1)), new Date(Date.UTC(2026, 0, 1)))).toBe(6);
  });
  it("before the anniversary counts one fewer", () => {
    expect(completedYears(new Date(Date.UTC(2020, 5, 1)), new Date(Date.UTC(2026, 0, 1)))).toBe(5);
  });
  it("null start date → 0", () => {
    expect(completedYears(null)).toBe(0);
  });
});

describe("estimateFinalPay", () => {
  const monthly = (startUTC: [number, number, number], asOf: [number, number, number]) => ({
    wageAmount: 260000,
    wageBasis: "monthly" as const,
    startDate: new Date(Date.UTC(...startUTC)),
    asOf: new Date(Date.UTC(...asOf)),
  });

  it("severance = 7 days/yr at the daily wage, capped at 10 years", () => {
    const e = estimateFinalPay(monthly([2010, 0, 1], [2026, 0, 1]));
    expect(e.years).toBe(16); // uncapped tenure for display
    expect(e.severanceYears).toBe(10); // statutory cap
    expect(e.severance).toBe(700000); // 10000 × 7 × 10
  });

  it("notice in lieu = 28 days' wage when requested", () => {
    const e = estimateFinalPay({ ...monthly([2024, 0, 1], [2026, 0, 1]), noticeInLieu: true });
    expect(e.noticeInLieu).toBe(280000); // 10000 × 28
  });

  it("leave payout = remaining days × daily wage", () => {
    const e = estimateFinalPay({ ...monthly([2024, 0, 1], [2026, 0, 1]), annualLeaveRemaining: 5 });
    expect(e.leavePayout).toBe(50000);
  });

  it("no wage on record → hasWage false and zero total", () => {
    const e = estimateFinalPay({ wageAmount: null, wageBasis: null, startDate: new Date(Date.UTC(2024, 0, 1)), asOf: new Date(Date.UTC(2026, 0, 1)) });
    expect(e.hasWage).toBe(false);
    expect(e.total).toBe(0);
  });
});

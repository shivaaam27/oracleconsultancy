import { describe, it, expect } from "vitest";
import {
  bookValue, depreciationFor, depreciationTo, disposalResult, monthlyCharge, monthsRemaining,
  type FixedAsset,
} from "./ledger-assets-shared";

/* ------------------------------------------------------------------ *
 * Fixed assets and depreciation — Stage 8.
 *
 * The rules under test are the ones that leave money on the books for ever if
 * they are wrong: the last month trimmed so the total lands exactly, nothing
 * charged after the life runs out or after it is disposed of, and a disposal
 * measured against what it STOOD at rather than what it cost.
 * ------------------------------------------------------------------ */

const asset = (over: Partial<FixedAsset> = {}): FixedAsset => ({
  id: 1, companyId: 1, name: "Tempering machine", category: null,
  acquiredOn: "2026-01-15", cost: 1_200_000, residualValue: 0, usefulLifeMonths: 12,
  method: "straight_line", assetAccountId: null, accumAccountId: null, expenseAccountId: null,
  disposedOn: null, disposalProceeds: null, notes: null, status: "in_use", ...over,
});

describe("the monthly charge", () => {
  it("spreads cost less residual over the life", () => {
    expect(monthlyCharge(asset())).toBe(100_000);
    expect(monthlyCharge(asset({ residualValue: 200_000 }))).toBeCloseTo(83_333.33, 2);
  });

  it("charges nothing at all when there is nothing to write off", () => {
    expect(monthlyCharge(asset({ residualValue: 1_200_000 }))).toBe(0);
    expect(monthlyCharge(asset({ usefulLifeMonths: 0 }))).toBe(0);
  });
});

describe("one month", () => {
  it("⚠️ charges the month it was bought IN FULL — a decision, not a law", () => {
    expect(depreciationFor(asset(), 2026, 1)).toBe(100_000);
  });

  it("charges nothing before it was bought", () => {
    expect(depreciationFor(asset(), 2025, 12)).toBe(0);
  });

  it("⚠️ stops dead once the life runs out", () => {
    expect(depreciationFor(asset(), 2026, 12)).toBe(100_000);   // the 12th month
    expect(depreciationFor(asset(), 2027, 1)).toBe(0);          // the 13th
  });

  it("⚠️ charges nothing in the month it was disposed of, or after", () => {
    const a = asset({ disposedOn: "2026-06-10" });
    expect(depreciationFor(a, 2026, 5)).toBe(100_000);
    expect(depreciationFor(a, 2026, 6)).toBe(0);
    expect(depreciationFor(a, 2026, 7)).toBe(0);
  });

  it("⚠️ trims the LAST month so the total lands exactly", () => {
    // 1,000,000 over 3 months is 333,333.33 each — which leaves a shilling on
    // the books for ever unless the last one is trimmed.
    const a = asset({ cost: 1_000_000, usefulLifeMonths: 3, acquiredOn: "2026-01-01" });
    const months = [1, 2, 3].map((m) => depreciationFor(a, 2026, m));
    expect(months[0]).toBeCloseTo(333_333.33, 2);
    expect(Math.round(months.reduce((t, x) => t + x, 0))).toBe(1_000_000);
  });
});

describe("what it stands at", () => {
  it("adds the months up to a date", () => {
    expect(depreciationTo(asset(), "2026-03-31")).toBe(300_000);
    expect(bookValue(asset(), "2026-03-31")).toBe(900_000);
  });

  it("never writes past the residual", () => {
    const a = asset({ residualValue: 200_000 });
    expect(bookValue(a, "2030-01-01")).toBeCloseTo(200_000, 0);
  });

  it("knows how much life is left", () => {
    expect(monthsRemaining(asset(), "2026-01-31")).toBe(11);
    expect(monthsRemaining(asset(), "2027-06-01")).toBe(0);
  });
});

describe("a disposal", () => {
  it("⚠️ is measured against what it STOOD at, not what it cost", () => {
    // Selling for 300,000 something standing at 900,000 is a LOSS of 600,000.
    // Booking the 300,000 as income and leaving the asset there is the mistake.
    const a = asset({ disposedOn: "2026-04-01", disposalProceeds: 300_000 });
    const r = disposalResult(a)!;
    expect(r.bookValue).toBe(900_000);   // three months charged
    expect(r.gain).toBe(-600_000);
  });

  it("says nothing about an asset still in use", () => {
    expect(disposalResult(asset())).toBeNull();
  });
});

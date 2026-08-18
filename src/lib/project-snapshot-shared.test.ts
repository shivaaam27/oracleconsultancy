// The dashboard's arithmetic, against the workbook's own gauge and payment plan.

import { describe, it, expect } from "vitest";
import {
  categoryGauge, gaugeBand, stageViews, planTotals, DEFAULT_STAGES,
  type PaymentStage,
} from "./project-snapshot-shared";

describe("the utilisation bands", () => {
  it("puts each level in the right band", () => {
    expect(gaugeBand(0)).toBe("none");
    expect(gaugeBand(0.12)).toBe("low");
    expect(gaugeBand(0.4)).toBe("quarter");
    expect(gaugeBand(0.6)).toBe("half");
    expect(gaugeBand(0.95)).toBe("most");
    expect(gaugeBand(1)).toBe("most");
    expect(gaugeBand(1.01)).toBe("over");
  });

  it("compares numbers, not text like the workbook does", () => {
    // SNAPSHOT uses `cellIs between "1%" and "25%"` — a STRING comparison, in
    // which "100%" falls between "1%" and "25%". FUEL at 234.9% must be over.
    expect(gaugeBand(2.349)).toBe("over");
    expect(gaugeBand(1.155)).toBe("over");   // ROOFING
  });

  it("says nothing when there is no budget to measure against", () => {
    expect(gaugeBand(null)).toBe("none");
  });
});

describe("budget against actual, by category", () => {
  const budget = [
    { category: "CEMENT", amount: 12_572_000 },
    { category: "FUEL", amount: 500_000 },
    { category: "SAND", amount: 5_352_500 },
  ];

  it("works out utilisation per category", () => {
    const rows = categoryGauge(budget, new Map([["CEMENT", 6_270_000], ["FUEL", 1_174_500]]));
    const cement = rows.find((r) => r.category === "CEMENT")!;
    expect(cement.utilisation).toBeCloseTo(6_270_000 / 12_572_000, 9);
    expect(cement.band).toBe("quarter");
  });

  it("floats the WORST first, not the biggest", () => {
    // The workbook sorts by budget size, which buries a small, wildly overspent
    // category near the bottom. FUEL at 235% must be the first thing you see.
    const rows = categoryGauge(budget, new Map([["CEMENT", 6_270_000], ["FUEL", 1_174_500]]));
    expect(rows[0].category).toBe("FUEL");
    expect(rows[0].band).toBe("over");
  });

  it("surfaces spending on a category that was never budgeted", () => {
    // The workbook's gauge is a fixed list, so this spending is invisible there.
    const rows = categoryGauge(budget, new Map([["SECURITY", 800_000]]));
    const rogue = rows.find((r) => r.category === "SECURITY")!;
    expect(rogue.budget).toBe(0);
    expect(rogue.band).toBe("over");
  });

  it("gives each category its share of the budget", () => {
    const rows = categoryGauge(budget, new Map());
    expect(rows.reduce((s, r) => s + r.share, 0)).toBeCloseTo(1, 9);
  });

  it("does not divide by zero on a nil budget line", () => {
    const rows = categoryGauge([{ category: "X", amount: 0 }], new Map([["X", 100]]));
    expect(rows[0].utilisation).toBeNull();
  });
});

describe("the payment plan", () => {
  function stage(over: Partial<PaymentStage> & { id: number }): PaymentStage {
    return {
      label: "S", thresholdPct: null, sharePct: null, amount: null,
      invoiceDate: null, invoiceAmount: null, receivedDate: null,
      amountReceived: null, ipcSubmitted: false, ipcProcessed: false, efdIssued: false,
      sortOrder: over.id, notes: null, ...over,
    };
  }

  const CONTRACT = 195_761_164.75;

  it("works the stage amount out from its share when none is typed", () => {
    const [v] = stageViews([stage({ id: 1, sharePct: "0.30" })], {
      totalContract: CONTRACT, completionPct: 0.98,
    });
    // SNAPSHOT C40 holds 58,728,349.425 exactly — not the rounded .43.
    expect(v.amount).toBeCloseTo(58_728_349.425, 3);
  });

  it("prefers a typed amount over the calculated one", () => {
    const [v] = stageViews([stage({ id: 1, sharePct: "0.30", amount: "60000000" })], {
      totalContract: CONTRACT, completionPct: 0.98,
    });
    expect(v.amount).toBe(60_000_000);
  });

  it("becomes billable once completion passes its threshold", () => {
    // SNAPSHOT: =IF(threshold < completion, "COMPLETED", "NOT COMPLETED").
    // At 98% complete the first three stages are billable and the last is not.
    const views = stageViews(
      DEFAULT_STAGES.map((s, i) => stage({
        id: i + 1, label: s.label,
        thresholdPct: String(s.thresholdPct), sharePct: String(s.sharePct),
      })),
      { totalContract: CONTRACT, completionPct: 0.98 },
    );
    expect(views.map((v) => v.billable)).toEqual([true, true, true, false]);
  });

  it("has no opinion when completion has not been entered", () => {
    const [v] = stageViews([stage({ id: 1, thresholdPct: "0.5" })], {
      totalContract: CONTRACT, completionPct: null,
    });
    expect(v.billable).toBeNull();
  });

  it("tracks the balance still to collect on a stage", () => {
    const [v] = stageViews(
      [stage({ id: 1, amount: "58728349.43", amountReceived: "49769787.64" })],
      { totalContract: CONTRACT, completionPct: 0.98 },
    );
    expect(v.balance).toBeCloseTo(8_958_561.79, 2);   // SNAPSHOT M40
  });

  it("names money that is billable but has never been invoiced", () => {
    // The question the workbook does not ask: what could we have invoiced by now
    // and have not? On Patamela that is two whole interim payments.
    const views = stageViews(
      DEFAULT_STAGES.map((s, i) => stage({
        id: i + 1, label: s.label,
        thresholdPct: String(s.thresholdPct), sharePct: String(s.sharePct),
        invoiceAmount: i === 0 ? "58728349.43" : null,
      })),
      { totalContract: CONTRACT, completionPct: 0.98 },
    );
    const totals = planTotals(views);
    expect(totals.billableNotInvoiced).toBeCloseTo(CONTRACT * 0.5, 2);
  });

  it("adds the plan up", () => {
    const views = stageViews(
      DEFAULT_STAGES.map((s, i) => stage({
        id: i + 1, thresholdPct: String(s.thresholdPct), sharePct: String(s.sharePct),
        amountReceived: i === 0 ? "49769787.64" : null,
      })),
      { totalContract: CONTRACT, completionPct: 0.98 },
    );
    const t = planTotals(views);
    expect(t.planned).toBeCloseTo(CONTRACT, 2);        // the shares total 100%
    expect(t.received).toBeCloseTo(49_769_787.64, 2);
    expect(t.outstanding).toBeCloseTo(CONTRACT - 49_769_787.64, 2);
  });

  it("keeps the four default stages adding to the whole contract", () => {
    expect(DEFAULT_STAGES.reduce((s, x) => s + x.sharePct, 0)).toBeCloseTo(1, 9);
  });
});

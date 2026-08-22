import { describe, it, expect } from "vitest";
import {
  batchCheck, batchPlan, closeBlockers, daysOpen, isOpen, nextBatchNo, openBlockers,
  type CzBatch,
} from "./cocozuri-batch-shared";
import type { CzRecipe, CzRecipeLine } from "./cocozuri-recipe-shared";

/* ------------------------------------------------------------------ *
 * CocoZuri, manufacturing Stage 4 — production.
 *
 * The thing this stage exists to answer is the owner's "inter check": what was
 * planned against what came out, and where the difference went. So that is what
 * is tested hardest — along with the friction rules from plan §5a, because a
 * batch nobody opens is worse than no batch at all.
 * ------------------------------------------------------------------ */

const line = (over: Partial<CzRecipeLine> = {}): CzRecipeLine => ({
  id: 1, lineNo: 1, itemId: 1, itemName: "COCOA", kind: "ingredient",
  qty: 2, uom: "KG", notes: null, ...over,
});

const recipe = (over: Partial<CzRecipe> = {}): CzRecipe => ({
  id: 1, name: "Amber Rabdi", outputItemId: 99, outputItemName: "AMBER RABDI",
  outputLocationId: 2, outputLocationName: "Kitchen",
  yieldQty: 120, yieldUom: "PCS", expectedLossPercent: 10,
  otherCost: 0, otherCostNote: null, status: "active", isDefault: true, notes: null,
  lines: [line(), line({ id: 2, itemId: 2, itemName: "BOX", kind: "packaging", qty: 120 })],
  ...over,
});

const batch = (over: Partial<CzBatch> = {}): CzBatch => ({
  id: 1, batchNo: "BATCH-2608-01", itemId: 99, itemName: "AMBER RABDI",
  recipeId: 1, recipeName: "Amber Rabdi", locationId: 2, locationName: "Kitchen",
  madeOn: "2026-08-22", expiresOn: null, status: "running",
  recipeMultiple: 1, plannedQty: 108, producedQty: null,
  lossKind: "none", lossNote: null, openedBy: "Chef", closedAt: null, closedBy: null, notes: null,
  ...over,
});

describe("the batch number", () => {
  it("⚠️ is allocated by the system, and carries its month", () => {
    // Nobody at CocoZuri writes one today, so there is no series to honour —
    // which means the only sensible design is one nobody has to think about.
    expect(nextBatchNo([], "2026-08-22")).toBe("BATCH-2608-01");
    expect(nextBatchNo(["BATCH-2608-01"], "2026-08-22")).toBe("BATCH-2608-02");
    expect(nextBatchNo(["BATCH-2608-09"], "2026-08-22")).toBe("BATCH-2608-10");
  });

  it("restarts each month, so the number stays short enough to say out loud", () => {
    const taken = ["BATCH-2608-01", "BATCH-2608-02", "BATCH-2608-03"];
    expect(nextBatchNo(taken, "2026-09-01")).toBe("BATCH-2609-01");
  });

  it("ignores anything that is not of its month", () => {
    expect(nextBatchNo(["BATCH-2607-44", "NOT-A-BATCH", "BATCH-2608-02"], "2026-08-22"))
      .toBe("BATCH-2608-03");
  });
});

describe("what the plan says", () => {
  it("scales the whole recipe by the number of batches being run", () => {
    const p = batchPlan(recipe(), 2);
    expect(p.materials.find((m) => m.itemName === "COCOA")!.qty).toBe(4);
    expect(p.materials.find((m) => m.itemName === "BOX")!.qty).toBe(240);
    expect(p.yieldQty).toBe(240);
  });

  it("⚠️ expects the yield AFTER the expected loss", () => {
    // Measuring against the raw yield would report the ordinary, already
    // budgeted-for loss as a failure on every single batch — and a warning that
    // fires every time is a warning nobody reads.
    const p = batchPlan(recipe(), 1);
    expect(p.yieldQty).toBe(120);
    expect(p.expectedQty).toBe(108);
  });

  it("treats a nil or missing multiple as one batch", () => {
    expect(batchPlan(recipe(), 0).yieldQty).toBe(120);
    expect(batchPlan(recipe()).yieldQty).toBe(120);
  });
});

describe("the inter check", () => {
  const plan = batchPlan(recipe(), 1);
  const used = [
    { itemId: 1, itemName: "COCOA", uom: "KG", qty: 2 },
    { itemId: 2, itemName: "BOX", uom: "PCS", qty: 120 },
  ];

  it("says nothing about the outcome until the batch is closed", () => {
    const c = batchCheck(batch(), plan, used);
    expect(c.actual).toBeNull();
    expect(c.variance).toBeNull();
    expect(c.needsExplaining).toBe(false);
  });

  it("a batch that hits its expectation has no variance and needs no excuse", () => {
    const c = batchCheck(batch({ producedQty: 108 }), plan, used);
    expect(c.expected).toBe(108);
    expect(c.variance).toBe(0);
    expect(c.yieldPercent).toBe(90);      // 108 of a raw 120
    expect(c.needsExplaining).toBe(false);
  });

  it("⚠️ a SHORTFALL must say where it went, or the batch cannot close", () => {
    const short = batchCheck(batch({ producedQty: 90 }), plan, used);
    expect(short.variance).toBe(-18);
    expect(short.needsExplaining).toBe(true);
    // Naming the kind is not enough on its own — it has to say why.
    const named = batchCheck(batch({ producedQty: 90, lossKind: "production" }), plan, used);
    expect(named.needsExplaining).toBe(true);
    const explained = batchCheck(
      batch({ producedQty: 90, lossKind: "production", lossNote: "tempering went over" }), plan, used);
    expect(explained.needsExplaining).toBe(false);
  });

  it("more than expected needs no explaining — that is a good morning", () => {
    const over = batchCheck(batch({ producedQty: 120 }), plan, used);
    expect(over.variance).toBe(12);
    expect(over.needsExplaining).toBe(false);
  });

  it("⚠️ flags a yield under the 95% the trade expects", () => {
    expect(batchCheck(batch({ producedQty: 90 }), plan, used).belowBenchmark).toBe(true);
    expect(batchCheck(batch({ producedQty: 119 }), plan, used).belowBenchmark).toBe(false);
  });

  it("⚠️ measures materials from what was TAKEN, not from the recipe", () => {
    // Reading the recipe back as if it were fact would make every batch agree
    // with itself perfectly and the check would be worthless.
    const heavy = batchCheck(batch({ producedQty: 108 }), plan, [
      { itemId: 1, itemName: "COCOA", uom: "KG", qty: 3 },
      { itemId: 2, itemName: "BOX", uom: "PCS", qty: 120 },
    ]);
    const cocoa = heavy.materials.find((m) => m.itemName === "COCOA")!;
    expect(cocoa.planned).toBe(2);
    expect(cocoa.used).toBe(3);
    expect(cocoa.variance).toBe(1);
  });

  it("⚠️ catches a material the recipe asked for that NOBODY TOOK", () => {
    // The easiest variance of all to miss: it simply is not in the movements.
    const c = batchCheck(batch({ producedQty: 108 }), plan, [
      { itemId: 1, itemName: "COCOA", uom: "KG", qty: 2 },
    ]);
    const box = c.materials.find((m) => m.itemName === "BOX")!;
    expect(box.used).toBe(0);
    expect(box.planned).toBe(120);
    expect(box.variance).toBe(-120);
  });

  it("works with no recipe at all, against whatever was planned by hand", () => {
    // ⚠️ A batch without a recipe is a real and allowed thing — see the note on
    // `recipeId`. It still gets a check, against `plannedQty`.
    const c = batchCheck(batch({ recipeId: null, plannedQty: 50, producedQty: 44 }), null, [
      { itemId: 1, itemName: "COCOA", uom: "KG", qty: 1 },
    ]);
    expect(c.expected).toBe(50);
    expect(c.variance).toBe(-6);
    expect(c.yieldPercent).toBeNull();          // nothing to measure a yield against
    expect(c.materials[0]!.planned).toBeNull(); // nothing said what it should have been
    expect(c.needsExplaining).toBe(true);
  });
});

describe("what stops a batch", () => {
  it("⚠️ opening one asks almost nothing — that is the point", () => {
    expect(openBlockers({ itemId: 99, locationId: 2, madeOn: "2026-08-22" })).toEqual([]);
  });

  it("but it does need to know what, where and when", () => {
    expect(openBlockers({ itemId: null, locationId: 2, madeOn: "2026-08-22" })[0]).toMatch(/what is being made/);
    expect(openBlockers({ itemId: 99, locationId: null, madeOn: "2026-08-22" })[0]).toMatch(/where/);
    expect(openBlockers({ itemId: 99, locationId: 2, madeOn: "nope" })[0]).toMatch(/date/);
  });

  it("⚠️ closing is where the questions are asked", () => {
    const plan = batchPlan(recipe(), 1);
    const used = [{ itemId: 1, itemName: "COCOA", uom: "KG", qty: 2 }];
    const noQty = closeBlockers({
      producedQty: null, used, check: batchCheck(batch(), plan, used),
    });
    expect(noQty[0]).toMatch(/how many came out/);

    const short = batchCheck(batch({ producedQty: 90 }), plan, used);
    expect(closeBlockers({ producedQty: 90, used, check: short })[0]).toMatch(/where it went/);

    const fine = batchCheck(batch({ producedQty: 108 }), plan, used);
    expect(closeBlockers({ producedQty: 108, used, check: fine })).toEqual([]);
  });

  it("refuses a negative quantity, out or in", () => {
    const plan = batchPlan(recipe(), 1);
    const used = [{ itemId: 1, itemName: "COCOA", uom: "KG", qty: -1 }];
    const c = batchCheck(batch({ producedQty: 108 }), plan, used);
    const out = closeBlockers({ producedQty: -1, used, check: c });
    expect(out.some((m) => /negative quantity/.test(m))).toBe(true);
    expect(out.some((m) => /negative amount/.test(m))).toBe(true);
  });
});

describe("what is still running", () => {
  it("knows an open batch from a finished one", () => {
    expect(isOpen(batch({ status: "running" }))).toBe(true);
    expect(isOpen(batch({ status: "planned" }))).toBe(true);
    expect(isOpen(batch({ status: "closed" }))).toBe(false);
    expect(isOpen(batch({ status: "cancelled" }))).toBe(false);
  });

  it("⚠️ counts how long it has been open — a week usually means forgotten", () => {
    expect(daysOpen(batch({ madeOn: "2026-08-22" }), "2026-08-22")).toBe(0);
    expect(daysOpen(batch({ madeOn: "2026-08-15" }), "2026-08-22")).toBe(7);
    expect(daysOpen(batch({ status: "closed" }), "2026-08-22")).toBeNull();
  });
});

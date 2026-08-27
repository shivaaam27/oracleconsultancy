import { describe, it, expect } from "vitest";
import {
  belowReorder, lineIsLocked, nextPlanRef, planBlockers, planIsDone,
  planMaterials, planProgress, type CzPlanLine,
} from "./cocozuri-plan-shared";

const line = (over: Partial<CzPlanLine> = {}): CzPlanLine => ({
  id: 1, lineNo: 1, itemId: 10, itemName: "AMBER RABDI", uom: "PCS",
  recipeId: null, recipeName: null, qty: 100,
  batchId: null, batchNo: null, batchStatus: null, madeQty: null, note: null,
  ...over,
});

describe("how the day is going", () => {
  it("⚠️ a RUNNING batch has made nothing yet", () => {
    // It may have put part of itself on a shelf, but what a batch MADE is
    // settled at close. Counting a part-finish would report a day as finished
    // while the kitchen was still working.
    const p = planProgress([
      line({ id: 1, batchId: 5, batchStatus: "running", madeQty: 40 }),
      line({ id: 2, batchId: 6, batchStatus: "closed", madeQty: 95 }),
      line({ id: 3 }),
    ]);
    expect(p.made).toBe(95);
    expect(p.running).toBe(1);
    expect(p.done).toBe(1);
    expect(p.notStarted).toBe(1);
  });

  it("counts what was wanted across every line", () => {
    const p = planProgress([line({ id: 1, qty: 100 }), line({ id: 2, qty: 60 })]);
    expect(p.wanted).toBe(160);
    expect(p.outstanding).toBe(160);
  });

  it("never reports a negative outstanding", () => {
    const p = planProgress([line({ batchId: 1, batchStatus: "closed", qty: 100, madeQty: 120 })]);
    expect(p.outstanding).toBe(0);
  });

  it("is done only when every line is closed", () => {
    expect(planIsDone([line({ batchId: 1, batchStatus: "closed" })])).toBe(true);
    expect(planIsDone([
      line({ id: 1, batchId: 1, batchStatus: "closed" }),
      line({ id: 2, batchId: 2, batchStatus: "running" }),
    ])).toBe(false);
    // ⚠️ An empty plan is not a finished one.
    expect(planIsDone([])).toBe(false);
  });
});

describe("what the plan will need", () => {
  const recipes = new Map([
    [1, {
      yieldQty: 108,
      materials: [
        { itemId: 50, itemName: "Cocoa butter", uom: "GM", qty: 2000 },
        { itemId: 51, itemName: "Cream", uom: "GM", qty: 500 },
      ],
    }],
    [2, {
      yieldQty: 50,
      materials: [{ itemId: 51, itemName: "Cream", uom: "GM", qty: 300 }],
    }],
  ]);

  it("⚠️ sums one material across DIFFERENT products — the reason to raise a plan at all", () => {
    // One line at a time nobody can see that two products want the same cream
    // and there is not enough for the second.
    const { materials } = planMaterials(
      [
        { itemId: 10, qty: 108, recipeId: 1 },
        { itemId: 11, qty: 50, recipeId: 2 },
      ],
      recipes,
      new Map([[50, 5000], [51, 400]]),
    );
    const cream = materials.find((m) => m.itemId === 51)!;
    expect(cream.needed).toBe(800);     // 500 + 300
    expect(cream.onHand).toBe(400);
    expect(cream.short).toBe(400);
  });

  it("⚠️ scales by the recipe's GOOD units, matching the batch form", () => {
    // Wanting 200 from a recipe that yields 108 is 1.852 batches, not 1.667 —
    // and the two screens must never disagree.
    const { materials } = planMaterials(
      [{ itemId: 10, qty: 216, recipeId: 1 }], recipes, new Map(),
    );
    expect(materials.find((m) => m.itemId === 50)!.needed).toBe(4000); // exactly two batches
  });

  it("⚠️ a line with NO recipe contributes nothing and is REPORTED", () => {
    // A batch may be opened without a recipe, so a plan may hold one. Reporting
    // its need as zero would make the list quietly wrong in the comfortable
    // direction.
    const { materials, linesWithoutRecipe } = planMaterials(
      [{ itemId: 10, qty: 100, recipeId: null }], recipes, new Map(),
    );
    expect(materials).toEqual([]);
    expect(linesWithoutRecipe).toBe(1);
  });

  it("puts the worst shortfall first", () => {
    const { materials } = planMaterials(
      [{ itemId: 10, qty: 108, recipeId: 1 }], recipes, new Map([[50, 0], [51, 499]]),
    );
    expect(materials[0]!.itemId).toBe(50);
  });

  it("reports no shortfall when the shelf covers it", () => {
    const { materials } = planMaterials(
      [{ itemId: 10, qty: 108, recipeId: 1 }], recipes, new Map([[50, 9000], [51, 9000]]),
    );
    expect(materials.every((m) => m.short === 0)).toBe(true);
  });
});

describe("what may be saved", () => {
  const ok = { locationId: 1, onDate: "2026-08-27", lines: [{ itemId: 10, qty: 5 }] };

  it("⚠️ ALLOWS a future date — unlike every other document here", () => {
    // A plan records nothing, so planning tomorrow's work tonight is the normal
    // case. A sale or a delivery dated tomorrow would leave a shelf wrong.
    expect(planBlockers({ ...ok, onDate: "2027-01-01" })).toEqual([]);
  });

  it("refuses a plan with nothing on it", () => {
    expect(planBlockers({ ...ok, lines: [] })[0]).toContain("Nothing has been listed");
  });

  it("refuses a nil quantity", () => {
    expect(planBlockers({ ...ok, lines: [{ itemId: 10, qty: 0 }] })[0]).toContain("A nil is not a plan");
  });

  it("refuses the same chocolate twice", () => {
    const out = planBlockers({ ...ok, lines: [{ itemId: 10, qty: 5 }, { itemId: 10, qty: 6 }] });
    expect(out.some((m) => m.includes("listed twice"))).toBe(true);
  });

  it("needs a kitchen", () => {
    expect(planBlockers({ ...ok, locationId: null })[0]).toContain("which kitchen");
  });

  it("⚠️ a line that has become a batch is locked", () => {
    // Editing it would rewrite what somebody was asked to make after they had
    // started making it.
    expect(lineIsLocked({ batchId: null })).toBe(false);
    expect(lineIsLocked({ batchId: 7 })).toBe(true);
  });
});

describe("the reference", () => {
  it("carries on within the month and restarts in a new one", () => {
    expect(nextPlanRef([], "2026-08-27")).toBe("PP-2608-01");
    expect(nextPlanRef(["PP-2608-01", "PP-2608-02"], "2026-08-27")).toBe("PP-2608-03");
    expect(nextPlanRef(["PP-2608-09"], "2026-09-01")).toBe("PP-2609-01");
  });

  it("ignores anything that is not one of ours", () => {
    expect(nextPlanRef(["BATCH-2608-04", "CZ-237"], "2026-08-27")).toBe("PP-2608-01");
  });
});

describe("below the level worth buying at", () => {
  const item = (id: number, reorderLevel: number | null) => ({ id, reorderLevel });

  it("⚠️ an item with NO level set is never reported low", () => {
    // Null means nobody has said what low means — not that low is nought.
    expect(belowReorder([item(1, null)], new Map([[1, 0]]))).toEqual([]);
  });

  it("reports what is under its level, worst first", () => {
    const out = belowReorder(
      [item(1, 100), item(2, 50), item(3, 10)],
      new Map([[1, 10], [2, 45], [3, 90]]),
    );
    expect(out.map((r) => r.item.id)).toEqual([1, 2]);
    expect(out[0]!.short).toBe(90);
  });

  it("does not report something exactly at its level", () => {
    expect(belowReorder([item(1, 50)], new Map([[1, 50]]))).toEqual([]);
  });
});

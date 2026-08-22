import { describe, it, expect } from "vitest";
import {
  batchesPossible, commonMaterials, costRecipe, itemCostFromMoves,
  recipeBlockers, recipesUsing, yieldPercent,
  type CzRecipe, type CzRecipeKind, type CzRecipeLine,
} from "./cocozuri-recipe-shared";

/* ------------------------------------------------------------------ *
 * CocoZuri, manufacturing Stage 3 — recipes.
 *
 * This is what a bar costs to make, so it is tested. The three things worth
 * getting wrong are the material cost (a weighted average, off the LANDED
 * figure), the cost per unit (divided by the GOOD units, not the yield), and
 * what happens to a material nobody has ever bought.
 * ------------------------------------------------------------------ */

const line = (over: Partial<CzRecipeLine> = {}): CzRecipeLine => ({
  id: 1, lineNo: 1, itemId: 1, itemName: "COCOA", kind: "ingredient" as CzRecipeKind,
  qty: 2, uom: "KG", notes: null, ...over,
});

const recipe = (over: Partial<CzRecipe> = {}): CzRecipe => ({
  id: 1, name: "Amber Rabdi — standard batch",
  outputItemId: 99, outputItemName: "AMBER RABDI",
  outputLocationId: 2, outputLocationName: "Kitchen",
  yieldQty: 120, yieldUom: "PCS",
  expectedLossPercent: 0, otherCost: 0, otherCostNote: null,
  status: "active", isDefault: true, notes: null,
  lines: [line()],
  ...over,
});

const move = (
  itemId: number, qty: number, unitCost: number | null, onDate = "2026-08-01", reason = "receipt", id = 1,
) => ({ itemId, qty, reason, unitCost, onDate, id });

describe("what a material costs", () => {
  it("⚠️ is a WEIGHTED average, not the latest price", () => {
    // One small emergency bag at three times the rate must not rewrite the cost
    // of every recipe that uses it.
    const c = itemCostFromMoves(1, [
      move(1, 100, 1_000, "2026-08-01", "receipt", 1),
      move(1, 5, 3_000, "2026-08-20", "receipt", 2),
    ]);
    expect(c.unitCost).toBeCloseTo((100 * 1000 + 5 * 3000) / 105, 4);
    expect(c.latest).toBe(3_000);   // shown, so the drift is visible
    expect(c.qtyBought).toBe(105);
    expect(c.receipts).toBe(2);
  });

  it("⚠️ says NOTHING rather than zero when nobody has ever bought it", () => {
    const c = itemCostFromMoves(1, []);
    expect(c.unitCost).toBeNull();
    expect(c.latest).toBeNull();
  });

  it("⚠️ ignores movements with no price — never averages them in as free", () => {
    // Every day-sheet movement is one of these: somebody wrote "12 in" on a shop
    // sheet and nobody said what it cost.
    const c = itemCostFromMoves(1, [
      move(1, 100, 1_000, "2026-08-01", "receipt", 1),
      move(1, 900, null, "2026-08-02", "day_in", 2),
      move(1, 900, null, "2026-08-03", "receipt", 3),
    ]);
    expect(c.unitCost).toBe(1_000);
    expect(c.qtyBought).toBe(100);
  });

  it("counts only stock coming IN on a purchase, not what went out", () => {
    const c = itemCostFromMoves(1, [
      move(1, 100, 1_000, "2026-08-01", "receipt", 1),
      move(1, -50, 1_000, "2026-08-05", "day_out", 2),
      move(1, -20, 900, "2026-08-06", "receipt", 3), // a reversal
    ]);
    expect(c.qtyBought).toBe(100);
    expect(c.unitCost).toBe(1_000);
  });

  it("keeps materials apart", () => {
    const moves = [move(1, 10, 500, "2026-08-01", "receipt", 1), move(2, 10, 9_000, "2026-08-01", "receipt", 2)];
    expect(itemCostFromMoves(1, moves).unitCost).toBe(500);
    expect(itemCostFromMoves(2, moves).unitCost).toBe(9_000);
  });
});

describe("what a recipe costs", () => {
  const costs: Record<number, number | null> = { 1: 10_000, 2: 500, 3: 250 };
  const costOf = (id: number) => costs[id] ?? null;

  const full = recipe({
    lines: [
      line({ id: 1, itemId: 1, itemName: "COCOA", kind: "ingredient", qty: 2 }),      // 20,000
      line({ id: 2, itemId: 2, itemName: "BOX", kind: "packaging", qty: 120 }),        // 60,000
      line({ id: 3, itemId: 3, itemName: "RIBBON", kind: "finishing", qty: 120 }),     // 30,000
    ],
    otherCost: 5_000, otherCostNote: "gas",
  });

  it("⚠️ totals the owner's THREE headings separately, not as one lump", () => {
    const c = costRecipe(full, costOf);
    expect(c.rawMaterial).toBe(20_000);
    expect(c.packaging).toBe(60_000);
    expect(c.finishing).toBe(30_000);
    expect(c.otherCost).toBe(5_000);
    expect(c.batchCost).toBe(115_000);
  });

  it("divides by the yield when nothing is expected to be lost", () => {
    const c = costRecipe(full, costOf);
    expect(c.goodUnits).toBe(120);
    expect(c.unitCost).toBeCloseTo(115_000 / 120, 4);
  });

  it("⚠️ divides by the GOOD units, so the survivors carry the loss", () => {
    // 10% expected loss: 108 bars have to carry the cost of all 120. Dividing by
    // 120 would understate every bar by exactly the loss, invisibly.
    const c = costRecipe({ ...full, expectedLossPercent: 10 }, costOf);
    expect(c.goodUnits).toBe(108);
    expect(c.unitCost).toBeCloseTo(115_000 / 108, 4);
    expect(c.unitCost!).toBeGreaterThan(115_000 / 120);
  });

  it("⚠️ NAMES the materials it could not price, and never counts them as free", () => {
    const c = costRecipe(full, (id) => (id === 2 ? null : costOf(id)));
    expect(c.complete).toBe(false);
    expect(c.unknown).toEqual(["BOX"]);
    // The packaging heading reads nil because nothing in it could be costed —
    // the screen must say "at least", not "is".
    expect(c.packaging).toBe(0);
    expect(c.lines.find((l) => l.line.itemName === "BOX")!.cost).toBeNull();
  });

  it("is complete when every line prices", () => {
    expect(costRecipe(full, costOf).complete).toBe(true);
    expect(costRecipe(full, costOf).unknown).toEqual([]);
  });

  it("⚠️ gives no cost per unit rather than Infinity when nothing survives", () => {
    const c = costRecipe({ ...full, expectedLossPercent: 100 }, costOf);
    expect(c.goodUnits).toBe(0);
    expect(c.unitCost).toBeNull();
    expect(c.batchCost).toBe(115_000);
  });

  it("costs an empty recipe at whatever the other cost is, and no more", () => {
    const c = costRecipe(recipe({ lines: [], otherCost: 400, otherCostNote: "gas" }), costOf);
    expect(c.batchCost).toBe(400);
    expect(c.complete).toBe(true);
  });
});

describe("can we even make it", () => {
  const lines = [
    line({ id: 1, itemId: 1, itemName: "COCOA", qty: 2 }),
    line({ id: 2, itemId: 2, itemName: "BOX", qty: 120 }),
  ];

  it("⚠️ answers with the WEAKEST line, not an average", () => {
    // A hundred boxes is no use with two kilos of cocoa.
    const { batches } = batchesPossible(lines, (id) => (id === 1 ? 9 : 1_000));
    expect(batches).toBe(4);   // cocoa runs to 4 batches, boxes to 8
  });

  it("names what is short", () => {
    const { short, batches } = batchesPossible(lines, (id) => (id === 1 ? 1 : 1_000));
    expect(batches).toBe(0);
    expect(short.map((l) => l.itemName)).toEqual(["COCOA"]);
  });

  it("never reports a negative number of batches", () => {
    expect(batchesPossible(lines, () => -50).batches).toBe(0);
  });

  it("ignores a line that asks for nothing", () => {
    const { batches } = batchesPossible(
      [line({ itemId: 1, qty: 0 }), line({ id: 2, itemId: 2, qty: 10 })],
      () => 100,
    );
    expect(batches).toBe(10);
  });
});

describe("common ingredients", () => {
  const a = recipe({
    id: 1, name: "A",
    lines: [line({ id: 1, itemId: 1, itemName: "COCOA", qty: 2 }), line({ id: 2, itemId: 2, itemName: "BOX", qty: 10 })],
  });
  const b = recipe({ id: 2, name: "B", lines: [line({ id: 3, itemId: 1, itemName: "COCOA", qty: 3 })] });

  it("⚠️ finds every recipe a material is in — which is the recall question", () => {
    expect(recipesUsing([a, b], 1).map((r) => r.name)).toEqual(["A", "B"]);
    expect(recipesUsing([a, b], 2).map((r) => r.name)).toEqual(["A"]);
    expect(recipesUsing([a, b], 999)).toEqual([]);
  });

  it("ranks materials by how many recipes use them", () => {
    const rows = commonMaterials([a, b]);
    expect(rows[0]!.itemName).toBe("COCOA");
    expect(rows[0]!.usedBy).toBe(2);
    expect(rows[0]!.totalQty).toBe(5);
    expect(rows[1]!.usedBy).toBe(1);
  });
});

describe("what stops a recipe being used", () => {
  it("passes an ordinary recipe", () => {
    expect(recipeBlockers(recipe())).toEqual([]);
  });

  it("refuses one that makes nothing and one that lists nothing", () => {
    expect(recipeBlockers(recipe({ yieldQty: 0 }))[0]).toMatch(/how many/);
    expect(recipeBlockers(recipe({ lines: [] }))[0]).toMatch(/Nothing/);
  });

  it("⚠️ refuses a material listed twice rather than quietly adding it up", () => {
    const out = recipeBlockers(recipe({
      lines: [line({ id: 1, itemId: 1, itemName: "COCOA" }), line({ id: 2, itemId: 1, itemName: "COCOA" })],
    }));
    expect(out[0]).toMatch(/listed twice/);
  });

  it("⚠️ refuses a recipe that contains itself — Stage 4 would loop for ever", () => {
    const out = recipeBlockers(recipe({ lines: [line({ itemId: 99, itemName: "AMBER RABDI" })] }));
    expect(out.some((m) => /its own materials/.test(m))).toBe(true);
  });

  it("refuses an impossible loss and an unexplained cost", () => {
    expect(recipeBlockers(recipe({ expectedLossPercent: 100 }))[0]).toMatch(/between 0 and 100/);
    expect(recipeBlockers(recipe({ expectedLossPercent: -1 }))[0]).toMatch(/between 0 and 100/);
    expect(recipeBlockers(recipe({ otherCost: 500, otherCostNote: null }))[0]).toMatch(/what the other cost is for/);
    expect(recipeBlockers(recipe({ otherCost: 500, otherCostNote: "gas" }))).toEqual([]);
  });
});

describe("yield", () => {
  it("is the other side of the expected loss, and the industry watches it", () => {
    // Artisanal chocolate is expected above 95%.
    expect(yieldPercent(4)).toBe(96);
    expect(yieldPercent(0)).toBe(100);
    expect(yieldPercent(-5)).toBe(100);
    expect(yieldPercent(120)).toBe(0);
  });
});

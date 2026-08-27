import { describe, it, expect } from "vitest";
import {
  batchCheck, batchPlan, closeBlockers, daysOpen, isOpen, multipleForTarget, nextBatchNo, openBlockers, overusedMaterials, committedToOpenBatches, freeAfterCommitments,
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

/* ------------------------------------------------------------------ *
 * "I need two hundred bars" — turning a wanted quantity into batches.
 * ------------------------------------------------------------------ */

describe("multipleForTarget", () => {
  it("measures the target against GOOD units, not the raw yield", () => {
    // 120 a batch with 10% expected loss is 108 usable, so 200 needs 1.852
    // batches. Dividing by 120 would give 1.667 and land 16 bars short.
    const p = multipleForTarget(recipe(), 200)!;
    expect(p.perBatch).toBe(108);
    expect(p.multiple).toBe(1.852);
    expect(p.expectedQty).toBeCloseTo(200, 0);
    // and the naive answer, which this exists to avoid
    expect(200 / 120).toBeCloseTo(1.667, 3);
  });

  it("rounds whole batches UP, never down", () => {
    // ⚠️ Making fewer than were asked for is a shortfall nobody sees until the
    // order is short. Making more is stock.
    const p = multipleForTarget(recipe(), 200)!;
    expect(p.wholeMultiple).toBe(2);
    expect(p.wholeExpectedQty).toBe(216);
  });

  it("does not round a target that already lands exactly up to the next batch", () => {
    const p = multipleForTarget(recipe(), 216)!;
    expect(p.multiple).toBe(2);
    expect(p.wholeMultiple).toBe(2);
  });

  it("never returns less than one whole batch", () => {
    const p = multipleForTarget(recipe(), 5)!;
    expect(p.multiple).toBeLessThan(1);
    expect(p.wholeMultiple).toBe(1);
  });

  it("agrees with batchPlan, which is what actually scales the materials", () => {
    const r = recipe();
    const p = multipleForTarget(r, 200)!;
    expect(batchPlan(r, p.multiple).expectedQty).toBeCloseTo(200, 0);
    expect(batchPlan(r, p.wholeMultiple).expectedQty).toBe(p.wholeExpectedQty);
  });

  it("handles a recipe that expects no loss at all", () => {
    const p = multipleForTarget(recipe({ expectedLossPercent: 0 }), 240)!;
    expect(p.perBatch).toBe(120);
    expect(p.multiple).toBe(2);
  });

  it("says nothing rather than inventing an answer", () => {
    expect(multipleForTarget(recipe(), 0)).toBeNull();
    expect(multipleForTarget(recipe(), -5)).toBeNull();
    expect(multipleForTarget(recipe(), Number.NaN)).toBeNull();
    // a recipe that yields nothing, or loses the lot
    expect(multipleForTarget(recipe({ yieldQty: 0 }), 100)).toBeNull();
    expect(multipleForTarget(recipe({ expectedLossPercent: 100 }), 100)).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * More went in than the recipe asks for.
 *
 * ⚠️ The output shortfall always had a rule; the input overrun had none, so a
 * batch could quietly eat an extra kilo of cocoa and close without a word.
 * ------------------------------------------------------------------ */

describe("a material that runs over the recipe", () => {
  const r = recipe();                     // 120 yield, 10% loss, 2 KG of COCOA
  const plan = batchPlan(r, 1);
  const closed = (usedQty: number, note = "") => {
    const used = [{ itemId: 1, itemName: "COCOA", uom: "KG", qty: usedQty }];
    const check = batchCheck(
      { producedQty: 108, plannedQty: 108, recipeMultiple: 1, lossKind: "none", lossNote: note },
      plan, used,
    );
    return { check, blockers: closeBlockers({ producedQty: 108, check, used }) };
  };

  it("lets a scoop either way through without a word", () => {
    // ⚠️ A rule that fires on every batch is one people learn to click past.
    const { check, blockers } = closed(2.05);
    expect(check.overused).toHaveLength(0);
    expect(blockers).toEqual([]);
  });

  it("asks why when a line goes materially over", () => {
    const { check, blockers } = closed(2.5);
    expect(check.overused.map((m) => m.itemName)).toEqual(["COCOA"]);
    expect(blockers.join(" ")).toMatch(/More COCOA went in/);
  });

  it("names the three answers worth telling apart", () => {
    // spilled · mismeasured · the recipe is wrong — the last is the only signal
    // a recipe ever gets that it needs changing.
    expect(closed(2.5).blockers.join(" ")).toMatch(/spilled.*mismeasured.*recipe is wrong/);
  });

  it("is satisfied once somebody says why", () => {
    const { check, blockers } = closed(2.5, "Bag split on the bench.");
    expect(check.needsExplaining).toBe(false);
    expect(blockers).toEqual([]);
  });

  it("keeps the shortfall complaint separate from the overrun one", () => {
    // ⚠️ Two different findings. One message covering both sends somebody to
    // the wrong end of the batch.
    const used = [{ itemId: 1, itemName: "COCOA", uom: "KG", qty: 2 }];
    const check = batchCheck(
      { producedQty: 50, plannedQty: 108, recipeMultiple: 1, lossKind: "none", lossNote: "" },
      plan, used,
    );
    expect(closeBlockers({ producedQty: 50, check, used }).join(" ")).toMatch(/Less came out/);
  });

  it("says nothing about a material the recipe never asked for", () => {
    // It has no `planned`, so there is nothing to be over.
    const used = [{ itemId: 99, itemName: "SALT", uom: "GM", qty: 5 }];
    const check = batchCheck(
      { producedQty: 108, plannedQty: 108, recipeMultiple: 1, lossKind: "none", lossNote: "" },
      plan, used,
    );
    expect(check.overused).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ *
 * What open batches have already promised.
 * ------------------------------------------------------------------ */

describe("committedToOpenBatches", () => {
  const r = recipe();                    // one batch takes 2 KG of COCOA (item 1)
  const find = (id: number) => (id === r.id ? r : null);

  it("adds up what every open batch will take", () => {
    const got = committedToOpenBatches([
      { batchNo: "B-1", recipeId: r.id, recipeMultiple: 1 },
      { batchNo: "B-2", recipeId: r.id, recipeMultiple: 2 },
    ], find);
    expect(got.get(1)).toMatchObject({ committed: 6, batches: ["B-1", "B-2"] });
  });

  it("names the batches, so the number can be chased", () => {
    const got = committedToOpenBatches([{ batchNo: "B-9", recipeId: r.id, recipeMultiple: 1 }], find);
    expect(got.get(1)!.batches).toEqual(["B-9"]);
  });

  it("skips a batch with no recipe rather than guessing at one", () => {
    expect(committedToOpenBatches([{ batchNo: "B-3", recipeId: null, recipeMultiple: 1 }], find).size).toBe(0);
  });

  it("skips a recipe that has since been deleted", () => {
    expect(committedToOpenBatches([{ batchNo: "B-4", recipeId: 999, recipeMultiple: 1 }], find).size).toBe(0);
  });

  it("leaves what is free NEGATIVE when more is promised than exists", () => {
    // ⚠️ Clamping at zero hides the one case worth seeing.
    expect(freeAfterCommitments(3, 6)).toBe(-3);
    expect(freeAfterCommitments(10, 6)).toBe(4);
  });
});

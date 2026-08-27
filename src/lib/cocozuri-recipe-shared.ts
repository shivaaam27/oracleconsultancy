/**
 * CocoZuri, manufacturing Stage 3 — recipes. The CLIENT-SAFE half.
 *
 * ⚠️ THIS FILE IS CLIENT-SAFE; `cocozuri-recipe.ts` IS SERVER-ONLY (it imports
 * `sb`). A client component importing the server half drags `@/db/supabase` into
 * the browser bundle and every page dies with "SUPABASE_SERVICE_ROLE_KEY is not
 * set". Recipes are their own pair for the same reason stock and buying are.
 *
 * ⚠️ NOTHING HERE IS STORED. Not a line cost, not a batch cost, not a cost per
 * bar. The lines, the yield and what the materials actually cost are the facts;
 * every figure below is worked out on read. The same rule as the general ledger,
 * the ageing, the stock book and the purchase.
 *
 * ⚠️ AND NOTHING HERE INVENTS A COST. An ingredient nobody has ever bought has
 * NO cost, and the answer is "not known" — never zero. A recipe costed with a
 * silent zero in it reads as cheap, and the whole point of Stage 7 is to find
 * out which chocolate actually makes money.
 *
 * Read `memory/cocozuri_manufacturing_plan.md` §4 Stage 3 first.
 */

/* ------------------------------------------------------------------ *
 * The records
 * ------------------------------------------------------------------ */

/**
 * What a line contributes to the cost of one batch.
 *
 * ⚠️ THE OWNER ANSWERED WHAT "FINISH" MEANT (22 Aug 2026): **"finished goods,
 * after production"**. So note #31 — *"Costing = raw material + finish +
 * packaging materials"* — is not three kinds of INPUT. It is the cost of the
 * FINISHED GOOD, made up of raw material and packaging. The finish is the thing
 * that comes out, which the recipe already names as its `outputItem`.
 *
 * The `finishing` line kind survives because materials really are added at the
 * finishing stage (a lustre, a ribbon, a sleeve) and somebody may want them
 * counted apart — but it no longer stands for an unexplained word, and nothing
 * in the costing depends on the distinction. It is one of the three headings the
 * cost distribution breaks down into.
 */
export type CzRecipeKind = "ingredient" | "packaging" | "finishing";

export const CZ_RECIPE_KINDS: { key: CzRecipeKind; label: string; hint: string }[] = [
  { key: "ingredient", label: "Raw material", hint: "What it is made of — cocoa, cream, nuts." },
  { key: "packaging", label: "Packaging", hint: "The box, the wrapper, the tray." },
  { key: "finishing", label: "Finishing", hint: "Added at the finishing stage — a lustre, a ribbon, a sleeve." },
];

export type CzRecipeStatus = "draft" | "active" | "archived";

export type CzRecipeLine = {
  id: number;
  lineNo: number;
  itemId: number;
  /** The item's name as it stands today. ⚠️ NOT frozen, unlike an invoice line:
   *  a recipe is a live instruction, not a document that was sent to somebody.
   *  What was actually consumed is recorded by Stage 4's movements. */
  itemName: string;
  kind: CzRecipeKind;
  /** ⚠️ PER BATCH, not per unit. */
  qty: number;
  uom: string;
  notes: string | null;
};

export type CzRecipe = {
  id: number;
  name: string;
  outputItemId: number;
  outputItemName: string;
  outputLocationId: number | null;
  outputLocationName: string | null;
  /** How many units one batch makes. */
  yieldQty: number;
  yieldUom: string;
  expectedLossPercent: number;
  otherCost: number;
  otherCostNote: string | null;
  status: CzRecipeStatus;
  isDefault: boolean;
  notes: string | null;
  lines: CzRecipeLine[];
};

/**
 * The recipe as it stood when a batch was opened.
 *
 * ⚠️ A BATCH MUST BE JUDGED AGAINST THE RECIPE IT WAS MADE FROM. A recipe is a
 * live instruction and is meant to be edited — so correcting one next month was
 * silently changing the reported difference on every batch ever made from it,
 * including batches somebody had already read and signed off.
 *
 * ⚠️ IT IS EXACTLY WHAT `batchPlan` READS, and nothing more. Keeping it to that
 * is what lets the snapshot go through the same function as a live recipe, so a
 * batch opened yesterday and one opened today can never be scaled by two
 * different rules.
 */
export type CzRecipeSnapshot = {
  recipeId: number;
  name: string;
  yieldQty: number;
  yieldUom: string;
  expectedLossPercent: number;
  lines: { itemId: number; itemName: string; kind: CzRecipeKind; qty: number; uom: string }[];
  /** When it was taken — so a screen can say which recipe it is showing. */
  takenAt: string;
};

/** Freeze a recipe as it stands. */
export function snapshotRecipe(recipe: CzRecipe, takenAt: string): CzRecipeSnapshot {
  return {
    recipeId: recipe.id,
    name: recipe.name,
    yieldQty: recipe.yieldQty,
    yieldUom: recipe.yieldUom,
    expectedLossPercent: recipe.expectedLossPercent,
    lines: recipe.lines.map((l) => ({
      itemId: l.itemId, itemName: l.itemName, kind: l.kind, qty: l.qty, uom: l.uom,
    })),
    takenAt,
  };
}

/**
 * Whether a snapshot still matches the recipe it came from.
 *
 * ⚠️ SAID, NEVER ACTED ON. A running batch whose recipe has moved on is a real
 * situation with two right answers — the recipe was corrected and should be
 * pulled in, or it was changed for NEXT time and this batch should be left
 * alone. Only the chef knows which, so the screen tells him and offers a button.
 */
export function snapshotIsStale(snap: CzRecipeSnapshot | null, recipe: CzRecipe | null): boolean {
  if (!snap || !recipe || snap.recipeId !== recipe.id) return false;
  if (snap.yieldQty !== recipe.yieldQty) return true;
  if (snap.expectedLossPercent !== recipe.expectedLossPercent) return true;
  if (snap.lines.length !== recipe.lines.length) return true;
  const byItem = new Map(snap.lines.map((l) => [l.itemId, l.qty]));
  return recipe.lines.some((l) => byItem.get(l.itemId) !== l.qty);
}

/* ------------------------------------------------------------------ *
 * What a material costs
 * ------------------------------------------------------------------ */

/**
 * What one unit of something cost, and how confident that is.
 *
 * ⚠️ `null` COST IS A REAL ANSWER AND MUST STAY ONE. Nobody has bought it yet,
 * or every purchase of it was recorded without a price. Reporting zero would
 * make the recipe look cheaper than it is, in a direction nobody can see.
 */
export type CzItemCost = {
  itemId: number;
  /** The weighted average of everything that arrived with a price on it — bought
   *  or made. Null when there is nothing to go on. */
  unitCost: number | null;
  /** The most recent one's unit cost, so a screen can show whether the two have
   *  drifted apart — a price that has doubled is worth noticing. */
  latest: number | null;
  /** How many units of history the average is built on. */
  qtyBought: number;
  /** How many arrivals. One is a price; several are a trend. */
  receipts: number;
};

/**
 * Work out what a material costs from the stock ledger's receipt movements.
 *
 * ⚠️ A WEIGHTED AVERAGE, NOT THE LATEST PRICE. One odd purchase — a small
 * emergency bag bought at three times the going rate — would otherwise rewrite
 * the cost of every recipe that uses it. This is the moving-average valuation
 * the reference system uses, and it is the ordinary convention.
 *
 * ⚠️ IT READS `unit_cost` OFF THE MOVEMENT, WHICH IS THE **LANDED** COST — goods
 * net of VAT plus that line's share of the freight, put there by Stage 2. That
 * is the whole reason freight is spread at all: a bag of almonds that does not
 * carry its own transit makes every recipe costed from it cheaper than the truth.
 *
 * ⚠️ MOVEMENTS WITH NO `unit_cost` ARE IGNORED, NOT COUNTED AS FREE. Every
 * day-sheet movement is one of those — somebody wrote "12 in" on a shop sheet
 * and nobody said what it cost — and averaging them in at zero would halve the
 * cost of anything that has ever been counted.
 *
 * ⚠️ A THING WE MADE COSTS SOMETHING TOO (added at Stage 6). A bar was never
 * bought, so reading `receipt` alone gave every finished chocolate NO cost —
 * which made a crate of them thrown away look free. `produce` movements carry
 * the batch's own cost per unit when the kitchen worked one out, and they belong
 * in the same average. Both are stock ARRIVING with a price on it; nothing else
 * is.
 */
export const PRICED_INWARD_REASONS = ["receipt", "produce"] as const;

export function itemCostFromMoves(
  itemId: number,
  moves: { itemId: number; qty: number; reason: string; unitCost: number | null; onDate: string; id: number }[],
): CzItemCost {
  const priced = moves
    .filter((m) => m.itemId === itemId && m.qty > 0 && (PRICED_INWARD_REASONS as readonly string[]).includes(m.reason))
    .filter((m) => m.unitCost != null && Number.isFinite(m.unitCost));

  if (priced.length === 0) {
    return { itemId, unitCost: null, latest: null, qtyBought: 0, receipts: 0 };
  }
  const qty = priced.reduce((t, m) => t + m.qty, 0);
  const value = priced.reduce((t, m) => t + m.qty * (m.unitCost as number), 0);
  const newest = priced.reduce((best, m) =>
    !best || m.onDate > best.onDate || (m.onDate === best.onDate && m.id > best.id) ? m : best,
  priced[0]!);
  return {
    itemId,
    unitCost: qty > 0 ? round4(value / qty) : null,
    latest: newest.unitCost,
    qtyBought: qty,
    receipts: priced.length,
  };
}

/* ------------------------------------------------------------------ *
 * What a recipe costs
 * ------------------------------------------------------------------ */

export type CzCostedLine = {
  line: CzRecipeLine;
  /** What one unit of this material cost. Null when nothing has been bought. */
  unitCost: number | null;
  /** qty × unitCost. Null when the unit cost is not known. */
  cost: number | null;
};

export type CzRecipeCosting = {
  lines: CzCostedLine[];
  /** The owner's three headings, each a total. */
  rawMaterial: number;
  packaging: number;
  finishing: number;
  /** Gas, labour, anything that is not a stock item. */
  otherCost: number;
  /** What one batch costs to make. */
  batchCost: number;
  /** How many good units one batch is expected to give, after the loss. */
  goodUnits: number;
  /**
   * What ONE unit costs.
   *
   * ⚠️ DIVIDED BY THE GOOD UNITS, NOT BY THE YIELD. If a tenth is expected to be
   * lost, the nine that survive have to carry the cost of all ten — that is what
   * an expected loss MEANS, and dividing by the raw yield quietly understates
   * every bar by the loss.
   */
  unitCost: number | null;
  /**
   * ⚠️ THE MATERIALS NOBODY HAS EVER BOUGHT, BY NAME. While this is non-empty
   * every figure above is a FLOOR, not a cost, and the screen must say so — a
   * recipe with two unpriced ingredients showing a confident total is worse than
   * one showing nothing.
   */
  unknown: string[];
  /** True when every line could be costed. */
  complete: boolean;
};

/**
 * Cost a recipe from what its materials actually cost.
 *
 * `costOf` is passed in so this stays pure: the caller resolves it from the
 * stock ledger with `itemCostFromMoves`, exactly as the sales figures take a
 * `priceOn` rather than reaching for the price list themselves.
 */
export function costRecipe(
  recipe: Pick<CzRecipe, "lines" | "yieldQty" | "expectedLossPercent" | "otherCost">,
  costOf: (itemId: number) => number | null,
): CzRecipeCosting {
  const lines: CzCostedLine[] = recipe.lines.map((line) => {
    const unitCost = costOf(line.itemId);
    return {
      line,
      unitCost,
      cost: unitCost == null ? null : round2(num(line.qty) * unitCost),
    };
  });

  const sum = (kind: CzRecipeKind) =>
    round2(lines.filter((l) => l.line.kind === kind).reduce((t, l) => t + (l.cost ?? 0), 0));

  const rawMaterial = sum("ingredient");
  const packaging = sum("packaging");
  const finishing = sum("finishing");
  const otherCost = round2(num(recipe.otherCost));
  const batchCost = round2(rawMaterial + packaging + finishing + otherCost);

  const yieldQty = num(recipe.yieldQty);
  const loss = Math.min(100, Math.max(0, num(recipe.expectedLossPercent)));
  const goodUnits = round4(yieldQty * (1 - loss / 100));

  const unknown = lines.filter((l) => l.unitCost == null).map((l) => l.line.itemName);

  return {
    lines,
    rawMaterial, packaging, finishing, otherCost,
    batchCost,
    goodUnits,
    // ⚠️ No good units means no cost per unit — a batch that is expected to lose
    // everything is somebody's typo, and dividing by zero would print Infinity.
    unitCost: goodUnits > 0 ? round4(batchCost / goodUnits) : null,
    unknown,
    complete: unknown.length === 0,
  };
}

/* ------------------------------------------------------------------ *
 * Can we even make it?
 * ------------------------------------------------------------------ */

export type CzRecipeStock = {
  line: CzRecipeLine;
  /** What is on the shelf where this recipe draws from. */
  onHand: number;
  /** How many whole batches this one line could support. Infinity when the line
   *  asks for nothing. */
  batchesPossible: number;
};

/**
 * How many batches the materials on the shelf would run to.
 *
 * ⚠️ IT SHOWS, IT DOES NOT PLAN. Working out what to make and reserving the
 * materials for it is Stage 4 (note #40, "stock raw material against
 * available"). This is the same figure read off the shelf, so somebody looking
 * at a recipe can see at a glance whether it is even worth starting.
 *
 * ⚠️ THE ANSWER IS THE WEAKEST LINE. Having a hundred boxes is no use with two
 * kilos of cocoa, so the limit is the smallest number of batches any one
 * material supports — never an average, and never the total.
 */
export function batchesPossible(
  lines: CzRecipeLine[],
  onHandOf: (itemId: number) => number,
): { rows: CzRecipeStock[]; batches: number; short: CzRecipeLine[] } {
  const rows: CzRecipeStock[] = lines.map((line) => {
    const onHand = onHandOf(line.itemId);
    const need = num(line.qty);
    return {
      line,
      onHand,
      batchesPossible: need <= 0 ? Infinity : Math.floor(onHand / need),
    };
  });
  const batches = rows.length === 0 ? 0 : Math.max(0, Math.min(...rows.map((r) => r.batchesPossible)));
  return { rows, batches, short: rows.filter((r) => r.batchesPossible < 1).map((r) => r.line) };
}

/* ------------------------------------------------------------------ *
 * Common ingredients
 * ------------------------------------------------------------------ */

/**
 * Which recipes use a given material — note #33, "common ingredients".
 *
 * ⚠️ THIS IS WHY A RECIPE LINE POINTS AT AN ID AND NOT AT A NAME. The workbook
 * matches its sheets BY NAME and loses 200 units a month to it (fault #4); a
 * recipe that said "ALMOND POWDER" as text could never answer "one bag was bad —
 * which bars used it", which is the question food traceability exists for.
 */
export function recipesUsing(recipes: CzRecipe[], itemId: number): CzRecipe[] {
  return recipes.filter((r) => r.lines.some((l) => l.itemId === itemId));
}

/** Every material any recipe calls for, most-used first. */
export function commonMaterials(recipes: CzRecipe[]): { itemId: number; itemName: string; usedBy: number; totalQty: number }[] {
  const m = new Map<number, { itemId: number; itemName: string; usedBy: number; totalQty: number }>();
  for (const r of recipes) {
    for (const l of r.lines) {
      const cur = m.get(l.itemId) ?? { itemId: l.itemId, itemName: l.itemName, usedBy: 0, totalQty: 0 };
      cur.usedBy += 1;
      cur.totalQty = round4(cur.totalQty + num(l.qty));
      m.set(l.itemId, cur);
    }
  }
  return [...m.values()].sort((a, b) => b.usedBy - a.usedBy || a.itemName.localeCompare(b.itemName));
}

/* ------------------------------------------------------------------ *
 * What stops a recipe being used
 * ------------------------------------------------------------------ */

/**
 * Everything wrong with a recipe, in sentences.
 *
 * ⚠️ IT REFUSES, IT DOES NOT REPAIR — the same discipline as `purchaseBlockers`.
 * A recipe that makes nothing, or that lists a material twice, is somebody's
 * mistake, and quietly merging or defaulting it would hide the mistake rather
 * than fix it.
 */
export function recipeBlockers(r: {
  lines: CzRecipeLine[];
  yieldQty: number;
  expectedLossPercent: number;
  otherCost: number;
  otherCostNote: string | null;
  outputItemId: number;
}): string[] {
  const out: string[] = [];
  if (r.lines.length === 0) out.push("Nothing has been listed as going into it.");
  if (num(r.yieldQty) <= 0) out.push("Say how many one batch makes.");
  if (r.lines.some((l) => num(l.qty) <= 0)) out.push("A line asks for no quantity.");

  const seen = new Set<number>();
  const twice = r.lines.find((l) => (seen.has(l.itemId) ? true : (seen.add(l.itemId), false)));
  if (twice) out.push(`${twice.itemName} is listed twice — put the whole quantity on one line.`);

  // ⚠️ A recipe that contains itself would loop for ever at Stage 4.
  if (r.lines.some((l) => l.itemId === r.outputItemId)) {
    out.push("It lists what it makes as one of its own materials.");
  }
  const loss = num(r.expectedLossPercent);
  if (loss < 0 || loss >= 100) out.push("The expected loss has to be between 0 and 100 per cent.");
  if (num(r.otherCost) < 0) out.push("The other cost cannot be negative.");
  // ⚠️ A number with no explanation is a number nobody can check.
  if (num(r.otherCost) > 0 && !r.otherCostNote?.trim()) {
    out.push("Say what the other cost is for — gas, time, something else.");
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10000) / 10000;

export function kindLabel(k: CzRecipeKind): string {
  return CZ_RECIPE_KINDS.find((x) => x.key === k)?.label ?? k;
}

/**
 * The yield, as a percentage — the number the industry watches.
 *
 * ⚠️ Artisanal chocolate is expected ABOVE 95%. A 96% yield means 4% of
 * expensive input went somewhere, and it is a daily number rather than a
 * year-end one.
 */
export function yieldPercent(expectedLossPercent: number): number {
  return round2(100 - Math.min(100, Math.max(0, num(expectedLossPercent))));
}

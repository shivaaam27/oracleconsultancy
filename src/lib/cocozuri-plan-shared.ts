/**
 * CocoZuri Stage C — what to MAKE today. The CLIENT-SAFE half.
 *
 * ⚠️ THIS FILE IS CLIENT-SAFE; `cocozuri-plan.ts` IS SERVER-ONLY.
 *
 * ⚠️ THE OWNER SETTLED WHAT THIS IS (27 Aug 2026): *"order form is for what to
 * make today"*. Not a purchase order. It is the morning document — what the
 * kitchen is going to make — and the special order that arrives at eleven is
 * either another line on it or a second plan.
 *
 * ⚠️ A PLAN IS A PLAN. It moves no stock, consumes nothing and creates nothing
 * until somebody starts a batch from a line. Same property that makes opening a
 * batch free, and for the same reason: a document that costs something to raise
 * is a document people keep on paper instead.
 */

export type CzPlanStatus = "draft" | "issued" | "cancelled";

export const CZ_PLAN_STATUS_LABEL: Record<CzPlanStatus, string> = {
  draft: "Draft",
  issued: "Issued",
  cancelled: "Cancelled",
};

export type CzPlanLine = {
  id: number;
  lineNo: number;
  itemId: number;
  itemName: string;
  uom: string;
  recipeId: number | null;
  recipeName: string | null;
  /** How many pieces are wanted. */
  qty: number;
  /** Which batch this line became. Null = not started. */
  batchId: number | null;
  batchNo: string | null;
  batchStatus: string | null;
  /** What that batch actually made, once it is closed. */
  madeQty: number | null;
  note: string | null;
};

export type CzPlan = {
  id: number;
  reference: string;
  onDate: string;
  locationId: number;
  locationName: string | null;
  status: CzPlanStatus;
  notes: string | null;
  createdBy: string;
  lines: CzPlanLine[];
};

/* ------------------------------------------------------------------ *
 * How the day is going
 * ------------------------------------------------------------------ */

export type CzPlanProgress = {
  lines: number;
  /** Lines with no batch yet. */
  notStarted: number;
  /** Lines whose batch is still running. */
  running: number;
  /** Lines whose batch is closed. */
  done: number;
  /** Total pieces wanted across every line. */
  wanted: number;
  /** ⚠️ Only from CLOSED batches — a running one has not made anything yet. */
  made: number;
  /** Wanted less made, floored at nothing. */
  outstanding: number;
};

/**
 * ⚠️ EVERY FIGURE IS DERIVED FROM THE BATCHES, never stored on the plan. A plan
 * that carried its own "made" column would be a second story about the same
 * chocolate, and the two would disagree the first time a batch was reopened.
 *
 * ⚠️ AND A RUNNING BATCH HAS MADE NOTHING. It may have put part of itself on a
 * shelf, but what a batch MADE is settled at close — counting a part-finish here
 * would report a day as finished while the kitchen was still working.
 */
export function planProgress(lines: CzPlanLine[]): CzPlanProgress {
  const wanted = round3(lines.reduce((t, l) => t + n(l.qty), 0));
  const made = round3(lines
    .filter((l) => l.batchStatus === "closed")
    .reduce((t, l) => t + n(l.madeQty), 0));
  return {
    lines: lines.length,
    notStarted: lines.filter((l) => l.batchId == null).length,
    running: lines.filter((l) => l.batchStatus === "running").length,
    done: lines.filter((l) => l.batchStatus === "closed").length,
    wanted,
    made,
    outstanding: round3(Math.max(0, wanted - made)),
  };
}

/** Whether every line has been made. Derived, never a status column. */
export function planIsDone(lines: CzPlanLine[]): boolean {
  return lines.length > 0 && lines.every((l) => l.batchStatus === "closed");
}

/* ------------------------------------------------------------------ *
 * What the whole plan will need
 * ------------------------------------------------------------------ */

export type CzPlanMaterial = {
  itemId: number;
  itemName: string;
  uom: string;
  /** How much the whole plan calls for. */
  needed: number;
  /** What is on the shelf now. */
  onHand: number;
  /** needed − onHand, floored at nothing. */
  short: number;
  /** ⚠️ Null when a line has no recipe — the need is UNKNOWN, not nil. */
  unknown: boolean;
};

/**
 * Everything the plan will consume, summed across its lines.
 *
 * ⚠️ THIS IS WHAT MAKES THE PLAN WORTH RAISING. One line at a time, nobody can
 * see that three products all want the same cream and there is not enough for
 * the third. Summed, the shortfall is visible before anybody starts.
 *
 * ⚠️ A LINE WITH NO RECIPE CONTRIBUTES NOTHING AND SAYS SO. A batch may be
 * opened without a recipe (plan §5a), so a plan may hold one — and reporting
 * its need as zero would make the materials list quietly wrong in the
 * comfortable direction. `unknown` is set on the plan instead.
 */
export function planMaterials(
  lines: { itemId: number; qty: number; recipeId: number | null }[],
  recipes: Map<number, {
    /** How many good pieces one batch of this recipe yields. */
    yieldQty: number;
    materials: { itemId: number; itemName: string; uom: string; qty: number }[];
  }>,
  onHand: Map<number, number>,
): { materials: CzPlanMaterial[]; linesWithoutRecipe: number } {
  const need = new Map<number, { itemName: string; uom: string; qty: number }>();
  let linesWithoutRecipe = 0;

  for (const line of lines) {
    const recipe = line.recipeId == null ? null : recipes.get(line.recipeId);
    if (!recipe || recipe.yieldQty <= 0) { linesWithoutRecipe++; continue; }
    /* ⚠️ SCALED BY THE **GOOD** UNITS, which is what the recipe's yield already
       means — the survivors of a batch, after the expected loss. Wanting 200
       from a recipe that yields 108 is 1.852 batches, not 1.667. The batch form
       makes exactly this calculation and it must not disagree with this one. */
    const multiple = n(line.qty) / recipe.yieldQty;
    for (const m of recipe.materials) {
      const at = need.get(m.itemId);
      const add = n(m.qty) * multiple;
      if (at) at.qty = round3(at.qty + add);
      else need.set(m.itemId, { itemName: m.itemName, uom: m.uom, qty: round3(add) });
    }
  }

  const materials = [...need.entries()]
    .map(([itemId, m]) => {
      const have = round3(onHand.get(itemId) ?? 0);
      return {
        itemId,
        itemName: m.itemName,
        uom: m.uom,
        needed: m.qty,
        onHand: have,
        short: round3(Math.max(0, m.qty - have)),
        unknown: false,
      };
    })
    // ⚠️ Worst first — the house rule for a list somebody is meant to act on.
    .sort((a, b) => b.short - a.short || a.itemName.localeCompare(b.itemName));

  return { materials, linesWithoutRecipe };
}

/* ------------------------------------------------------------------ *
 * What may be saved
 * ------------------------------------------------------------------ */

/**
 * ⚠️ A FUTURE DATE IS ALLOWED HERE, AND THAT IS NOT AN OVERSIGHT. Everywhere
 * else in this module a future date is refused, because recording a SALE or a
 * DELIVERY tomorrow would leave a shelf wrong until tomorrow arrived. A plan
 * records nothing — planning tomorrow's work today is the normal case, and the
 * whole point of a morning document is that somebody can write it the night
 * before.
 */
export function planBlockers(input: {
  locationId: number | null;
  onDate: string;
  lines: { itemId: number; qty: number }[];
}): string[] {
  const out: string[] = [];
  if (!input.locationId) out.push("Say which kitchen this is for.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.onDate)) out.push("That is not a date.");

  const real = input.lines.filter((l) => l.itemId);
  if (real.length === 0) out.push("Nothing has been listed to make.");
  if (real.some((l) => !Number.isFinite(n(l.qty)) || n(l.qty) <= 0)) {
    out.push("Every line needs how many to make. A nil is not a plan.");
  }
  const seen = new Set<number>();
  for (const l of real) {
    if (seen.has(l.itemId)) {
      out.push("The same chocolate is listed twice. Put it on one line with the whole quantity.");
      break;
    }
    seen.add(l.itemId);
  }
  return out;
}

/**
 * Whether a line may still be changed.
 *
 * ⚠️ A LINE THAT HAS BECOME A BATCH IS NO LONGER A PLAN. Editing it would
 * rewrite what somebody was asked to make after they had started making it, and
 * the batch would go on being measured against a target that had moved.
 */
export function lineIsLocked(line: Pick<CzPlanLine, "batchId">): boolean {
  return line.batchId != null;
}

/* ------------------------------------------------------------------ *
 * The reference
 * ------------------------------------------------------------------ */

/**
 * `PP-2608-01` — year, month, and the sequence within that month.
 *
 * ⚠️ THE SAME SHAPE AS EVERY OTHER SERIES IN THIS MODULE (a batch, a transfer, a
 * counter sale), because somebody reading a stack of paper should not have to
 * learn a second convention.
 */
export function nextPlanRef(taken: string[], onDate: string): string {
  const [y, m] = onDate.split("-");
  const prefix = `PP-${(y ?? "").slice(2)}${m ?? ""}-`;
  let highest = 0;
  for (const ref of taken) {
    if (!ref?.startsWith(prefix)) continue;
    const n = Number(ref.slice(prefix.length));
    if (Number.isFinite(n) && n > highest) highest = n;
  }
  return `${prefix}${String(highest + 1).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ *
 * Below the level worth buying at
 * ------------------------------------------------------------------ */

/**
 * ⚠️ A REORDER LEVEL NEEDS NO HISTORY, WHICH IS WHY IT EARNS ITS PLACE. The
 * order form's rate needs a week of days written down before it will quote one
 * at all, so a material bought rarely never gets a suggestion. "Never go below
 * 5 kg" works from the day somebody types it.
 *
 * ⚠️ NULL MEANS NOBODY HAS SAID and is not a level of nought — an item with no
 * level set is never reported as low, because nobody has said what low means.
 */
export function belowReorder<T extends { id: number; reorderLevel: number | null }>(
  items: T[], onHand: Map<number, number>,
): { item: T; onHand: number; level: number; short: number }[] {
  return items
    .filter((i) => i.reorderLevel != null && n(i.reorderLevel) > 0)
    .map((i) => {
      const have = round3(onHand.get(i.id) ?? 0);
      const level = n(i.reorderLevel);
      return { item: i, onHand: have, level, short: round3(Math.max(0, level - have)) };
    })
    .filter((r) => r.short > 0.0005)
    .sort((a, b) => b.short - a.short);
}

const n = (v: unknown) => (v == null ? 0 : Number(v));
const round3 = (v: number) => Math.round(v * 1000) / 1000;

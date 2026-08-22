/**
 * CocoZuri, manufacturing Stage 4 — production. The CLIENT-SAFE half.
 *
 * ⚠️ THIS FILE IS CLIENT-SAFE; `cocozuri-batch.ts` IS SERVER-ONLY (it imports
 * `sb`). A client component importing the server half drags `@/db/supabase`
 * into the browser bundle and every page dies with "SUPABASE_SERVICE_ROLE_KEY
 * is not set".
 *
 * ⚠️ READ PLAN §5a FIRST. The owner: *"we don't use batch numbers, but we are
 * introducing them"*. NOBODY AT COCOZURI WRITES A BATCH NUMBER TODAY, and that
 * governs every decision here — the number is allocated by the system, a batch
 * opens in ONE action, and what came out is recorded AFTER the fact. A batch
 * that must be planned in advance to exist will not be used on a busy morning,
 * and this stage fails by not being used rather than by being wrong.
 *
 * ⚠️ NOTHING DERIVED IS STORED. Not the variance, not the yield, not what a
 * batch cost. `planned_qty` and `produced_qty` are the two facts; everything
 * below is the subtraction.
 */

import type { CzRecipe, CzRecipeKind } from "@/lib/cocozuri-recipe-shared";

/* ------------------------------------------------------------------ *
 * The record
 * ------------------------------------------------------------------ */

/**
 * planned → running → closed, or cancelled.
 *
 * ⚠️ `planned` IS OPTIONAL AND MUST STAY OPTIONAL. The ordinary path is to open
 * a batch that is already `running` — somebody is making chocolate NOW — and
 * planning ahead is the exception, not the gate.
 */
export type CzBatchStatus = "planned" | "running" | "closed" | "cancelled";

export const CZ_BATCH_STATUS_LABEL: Record<CzBatchStatus, string> = {
  planned: "Planned",
  running: "Being made",
  closed: "Done",
  cancelled: "Abandoned",
};

/** Where a shortfall went — note #12, and it must be said. */
export type CzLossKind = "none" | "production" | "raw_material" | "both";

export const CZ_LOSS_KINDS: { key: CzLossKind; label: string; hint: string }[] = [
  { key: "production", label: "In the making", hint: "Spoiled, burnt, dropped, mis-tempered." },
  { key: "raw_material", label: "The materials", hint: "A bad bag — it was never going to yield." },
  { key: "both", label: "Both", hint: "Some of each." },
];

export type CzBatch = {
  id: number;
  batchNo: string;
  itemId: number | null;
  itemName: string | null;
  recipeId: number | null;
  recipeName: string | null;
  locationId: number | null;
  locationName: string | null;
  madeOn: string | null;
  expiresOn: string | null;
  status: CzBatchStatus;
  recipeMultiple: number;
  plannedQty: number | null;
  /** ⚠️ What actually came out. Null until somebody says. */
  producedQty: number | null;
  lossKind: CzLossKind;
  lossNote: string | null;
  openedBy: string | null;
  closedAt: string | null;
  closedBy: string | null;
  notes: string | null;
};

/* ------------------------------------------------------------------ *
 * The number
 * ------------------------------------------------------------------ */

/**
 * The next batch number: `BATCH-2608-01` — year, month, and the sequence within
 * that month.
 *
 * ⚠️ ALLOCATED BY THE SYSTEM, NEVER TYPED. Nobody at CocoZuri writes one today,
 * so there is no paper series to honour and no habit to match — which means the
 * only sensible design is one where a person never has to think about it. Ask
 * somebody to invent a batch number at seven in the morning and they will write
 * "1" for the third time that week.
 *
 * ⚠️ THE MONTH IS PART OF THE NUMBER, so the sequence restarts and stays short.
 * A number that reaches four digits is one people start abbreviating.
 */
export function nextBatchNo(existing: string[], onDate: string): string {
  const ym = `${onDate.slice(2, 4)}${onDate.slice(5, 7)}`;
  const prefix = `BATCH-${ym}-`;
  let max = 0;
  for (const n of existing) {
    if (!n.startsWith(prefix)) continue;
    const tail = Number(n.slice(prefix.length));
    if (Number.isFinite(tail) && tail > max) max = tail;
  }
  return `${prefix}${String(max + 1).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ *
 * What the plan says
 * ------------------------------------------------------------------ */

export type CzPlannedMaterial = {
  itemId: number;
  itemName: string;
  kind: CzRecipeKind;
  uom: string;
  /** What the recipe asks for, times the number of batches being run. */
  qty: number;
};

export type CzBatchPlan = {
  materials: CzPlannedMaterial[];
  /** What the recipe says should come out, before the expected loss. */
  yieldQty: number;
  /** After the expected loss — what a good run should actually give. */
  expectedQty: number;
  yieldUom: string;
};

/**
 * What one run of a recipe asks for, and what it should give.
 *
 * ⚠️ `expectedQty` IS AFTER THE EXPECTED LOSS, and that is what the actual is
 * measured against. Measuring against the raw yield would report the ordinary,
 * already-budgeted-for loss as a failure every single time, and a warning that
 * fires on every batch is a warning nobody reads.
 */
export function batchPlan(recipe: CzRecipe, multiple = 1): CzBatchPlan {
  const m = num(multiple) > 0 ? num(multiple) : 1;
  const loss = Math.min(100, Math.max(0, num(recipe.expectedLossPercent)));
  const yieldQty = round3(num(recipe.yieldQty) * m);
  return {
    materials: recipe.lines.map((l) => ({
      itemId: l.itemId,
      itemName: l.itemName,
      kind: l.kind,
      uom: l.uom,
      qty: round3(num(l.qty) * m),
    })),
    yieldQty,
    expectedQty: round3(yieldQty * (1 - loss / 100)),
    yieldUom: recipe.yieldUom,
  };
}

/* ------------------------------------------------------------------ *
 * The inter check — plan against actual
 * ------------------------------------------------------------------ */

export type CzMaterialCheck = {
  itemId: number;
  itemName: string;
  uom: string;
  /** What the recipe asked for. Null when the batch had no recipe. */
  planned: number | null;
  /** What was actually taken. */
  used: number;
  /** used − planned. Positive means more went in than the recipe says. */
  variance: number | null;
};

export type CzBatchCheck = {
  /** What the recipe said should come out, after its expected loss. */
  expected: number | null;
  /** What was found. Null until the batch is closed. */
  actual: number | null;
  /** actual − expected. Negative is a shortfall. */
  variance: number | null;
  /** actual ÷ the recipe's raw yield, as a percentage. */
  yieldPercent: number | null;
  /** ⚠️ True when the yield is below the 95% the trade expects of artisanal
   *  chocolate. A daily number, not a year-end one. */
  belowBenchmark: boolean;
  materials: CzMaterialCheck[];
  /** ⚠️ A shortfall with nothing said about where it went. */
  needsExplaining: boolean;
};

/**
 * The owner's "inter check": what was planned against what came out (note #37),
 * and what the recipe asked for against what was actually taken.
 *
 * ⚠️ THE MATERIALS COME FROM THE MOVEMENTS, NOT FROM THE RECIPE. The recipe is
 * what was *meant* to go in; the `consume` movements are what did. Reading the
 * recipe back as if it were fact would make every batch agree with itself
 * perfectly and the check would be worthless.
 */
export function batchCheck(
  batch: Pick<CzBatch, "producedQty" | "plannedQty" | "recipeMultiple" | "lossKind" | "lossNote">,
  plan: CzBatchPlan | null,
  used: { itemId: number; itemName: string; uom: string; qty: number }[],
): CzBatchCheck {
  const expected = plan ? plan.expectedQty : batch.plannedQty;
  const actual = batch.producedQty;
  const variance = expected != null && actual != null ? round3(actual - expected) : null;

  const plannedOf = new Map((plan?.materials ?? []).map((m) => [m.itemId, m]));
  const seen = new Set<number>();
  const materials: CzMaterialCheck[] = used.map((u) => {
    seen.add(u.itemId);
    const p = plannedOf.get(u.itemId);
    return {
      itemId: u.itemId,
      itemName: u.itemName,
      uom: u.uom,
      planned: p ? p.qty : null,
      used: round3(u.qty),
      variance: p ? round3(u.qty - p.qty) : null,
    };
  });
  // ⚠️ Something the recipe asked for and NOBODY TOOK is a variance too, and the
  // easiest of all to miss — it simply is not in the movements.
  for (const p of plan?.materials ?? []) {
    if (seen.has(p.itemId)) continue;
    materials.push({
      itemId: p.itemId, itemName: p.itemName, uom: p.uom,
      planned: p.qty, used: 0, variance: round3(-p.qty),
    });
  }

  const rawYield = plan ? plan.yieldQty : null;
  const yieldPercent =
    rawYield != null && rawYield > 0 && actual != null ? round2((actual / rawYield) * 100) : null;

  return {
    expected,
    actual,
    variance,
    yieldPercent,
    belowBenchmark: yieldPercent != null && yieldPercent < 95,
    materials,
    // ⚠️ A shortfall must say WHERE it went — production or raw materials
    // (note #12). The same discipline as `recordCount` refusing an unexplained
    // stock-take variance.
    needsExplaining:
      variance != null && variance < -0.0005 && (batch.lossKind === "none" || !batch.lossNote?.trim()),
  };
}

/* ------------------------------------------------------------------ *
 * What stops a batch
 * ------------------------------------------------------------------ */

/** Opening one. ⚠️ DELIBERATELY ALMOST NOTHING — see the note at the top. */
export function openBlockers(input: { itemId: number | null; locationId: number | null; madeOn: string }): string[] {
  const out: string[] = [];
  if (!input.itemId) out.push("Say what is being made.");
  if (!input.locationId) out.push("Say where it is being made.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.madeOn)) out.push("A batch needs a date.");
  return out;
}

/**
 * Closing one — where the real rules are.
 *
 * ⚠️ THE FRICTION BELONGS HERE, NOT AT THE START. Somebody opening a batch is
 * standing in a kitchen; somebody closing one has finished and is writing down
 * what happened. Asking the questions at the end is the difference between a
 * system that gets used and one that does not.
 */
export function closeBlockers(input: {
  producedQty: number | null;
  check: CzBatchCheck;
  used: { qty: number }[];
}): string[] {
  const out: string[] = [];
  if (input.producedQty == null || !Number.isFinite(input.producedQty)) {
    out.push("Say how many came out.");
  } else if (input.producedQty < 0) {
    out.push("A batch cannot produce a negative quantity.");
  }
  if (input.used.some((u) => num(u.qty) < 0)) out.push("A material cannot be used a negative amount.");
  if (input.check.needsExplaining) {
    out.push(
      `Less came out than the recipe expects. Say where it went — in the making, or the materials — and why.`,
    );
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function lossLabel(k: CzLossKind): string {
  return CZ_LOSS_KINDS.find((x) => x.key === k)?.label ?? "Not said";
}

/** Is this batch still open? Used for the "what is running" list — note #26. */
export function isOpen(b: Pick<CzBatch, "status">): boolean {
  return b.status === "planned" || b.status === "running";
}

/**
 * How long a batch has been open, in whole days.
 *
 * ⚠️ Note #26 asks which batches are "required / running (time)". A batch left
 * open for a week is almost always one somebody forgot to close rather than a
 * week-long process, and that is worth showing.
 */
export function daysOpen(b: Pick<CzBatch, "madeOn" | "status">, today: string): number | null {
  if (!b.madeOn || !isOpen(b)) return null;
  const a = Date.parse(`${b.madeOn}T00:00:00Z`);
  const z = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(z)) return null;
  return Math.max(0, Math.round((z - a) / 86_400_000));
}

/**
 * Fixed assets and depreciation — Stage 8, notes page 1. The CLIENT-SAFE half.
 *
 * ⚠️ THIS FILE IS CLIENT-SAFE; `ledger-assets.ts` IS SERVER-ONLY.
 *
 * ⚠️ NOTHING DERIVED IS STORED. There is no `accumulated` and no `book value`
 * column — both come from the cost, the residual, the life and how many months
 * the thing has actually been in use. The ledger's third rule, and the reason a
 * register in a spreadsheet always disagrees with the books by the time anybody
 * looks.
 */

export type FixedAsset = {
  id: number;
  companyId: number;
  name: string;
  category: string | null;
  acquiredOn: string;
  cost: number;
  residualValue: number;
  usefulLifeMonths: number;
  method: string;
  assetAccountId: number | null;
  accumAccountId: number | null;
  expenseAccountId: number | null;
  disposedOn: string | null;
  disposalProceeds: number | null;
  notes: string | null;
  status: "in_use" | "disposed";
};

/* ------------------------------------------------------------------ *
 * The arithmetic
 * ------------------------------------------------------------------ */

/**
 * What one month costs.
 *
 * ⚠️ STRAIGHT LINE, OVER MONTHS. The cost less what it will be worth at the end,
 * spread evenly over its life. Months rather than years because that is how it
 * is charged — dividing a yearly figure by twelve somewhere else is where the
 * rounding errors live.
 */
export function monthlyCharge(a: Pick<FixedAsset, "cost" | "residualValue" | "usefulLifeMonths">): number {
  const life = Math.round(num(a.usefulLifeMonths));
  if (life <= 0) return 0;
  const depreciable = num(a.cost) - num(a.residualValue);
  if (depreciable <= 0) return 0;
  return round2(depreciable / life);
}

/** How many whole months have elapsed from one month to another, inclusive of
 *  neither end — the count of charges due. */
function monthsBetween(fromYear: number, fromMonth: number, toYear: number, toMonth: number): number {
  return (toYear - fromYear) * 12 + (toMonth - fromMonth);
}

/**
 * What to charge for ONE month.
 *
 * ⚠️ THE MONTH IT WAS BOUGHT IS THE FIRST MONTH CHARGED, whole. Part-month
 * apportionment is a choice, not a law, and charging from the month of purchase
 * is what most small companies here do — but it is a DECISION, so it is written
 * down rather than left implicit. Say the word and it becomes a setting.
 *
 * ⚠️ NOTHING IS CHARGED AFTER THE LIFE RUNS OUT, and nothing after it is
 * disposed of. The last month is trimmed so the total written off comes to
 * exactly cost less residual — a straight division would leave a few shillings
 * on the books for ever.
 */
export function depreciationFor(a: FixedAsset, year: number, month: number): number {
  const [ay, am] = ymOf(a.acquiredOn);
  if (ay == null || am == null) return 0;
  const elapsed = monthsBetween(ay, am, year, month);
  if (elapsed < 0) return 0;                                   // not bought yet
  if (elapsed >= Math.round(num(a.usefulLifeMonths))) return 0; // fully written off

  if (a.disposedOn) {
    const [dy, dm] = ymOf(a.disposedOn);
    // ⚠️ The month it went is NOT charged — it was not ours for the month.
    if (dy != null && dm != null && monthsBetween(dy, dm, year, month) >= 0) return 0;
  }

  const each = monthlyCharge(a);
  const total = round2(num(a.cost) - num(a.residualValue));
  const chargedBefore = round2(each * elapsed);
  // The last month takes whatever is left, so the total lands exactly.
  return round2(Math.min(each, total - chargedBefore));
}

/** Everything written off up to and including a date. */
export function depreciationTo(a: FixedAsset, asOf: string): number {
  const [y, m] = ymOf(asOf);
  if (y == null || m == null) return 0;
  const [ay, am] = ymOf(a.acquiredOn);
  if (ay == null || am == null) return 0;
  let total = 0;
  let year = ay;
  let month = am;
  // ⚠️ Walked month by month rather than multiplied, because the last month is
  // trimmed and a disposal stops it early. A multiplication would overstate both.
  for (let guard = 0; guard < 1200; guard++) {
    if (year > y || (year === y && month > m)) break;
    total = round2(total + depreciationFor(a, year, month));
    month += 1;
    if (month > 12) { month = 1; year += 1; }
  }
  return total;
}

/** Cost less what has been written off. ⚠️ Never below the residual. */
export function bookValue(a: FixedAsset, asOf: string): number {
  return round2(num(a.cost) - depreciationTo(a, asOf));
}

/** How many months of life are left. */
export function monthsRemaining(a: FixedAsset, asOf: string): number {
  const [y, m] = ymOf(asOf);
  const [ay, am] = ymOf(a.acquiredOn);
  if (y == null || m == null || ay == null || am == null) return 0;
  const used = monthsBetween(ay, am, y, m) + 1;
  return Math.max(0, Math.round(num(a.usefulLifeMonths)) - used);
}

/**
 * ⚠️ WHAT A DISPOSAL MADE OR LOST, and it is not the proceeds. Selling something
 * for 300,000 that still stands at 500,000 in the books is a LOSS of 200,000 —
 * the mistake is to book the 300,000 as income and leave the asset sitting there.
 */
export function disposalResult(a: FixedAsset): { bookValue: number; proceeds: number; gain: number } | null {
  if (!a.disposedOn) return null;
  const bv = bookValue(a, a.disposedOn);
  const proceeds = num(a.disposalProceeds);
  return { bookValue: bv, proceeds, gain: round2(proceeds - bv) };
}

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

function ymOf(date: string | null): [number | null, number | null] {
  if (!date || !/^\d{4}-\d{2}/.test(date)) return [null, null];
  return [Number(date.slice(0, 4)), Number(date.slice(5, 7))];
}

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round2 = (n: number) => Math.round(n * 100) / 100;

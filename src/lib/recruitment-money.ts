// ─────────────────────────────────────────────────────────────────────────────
// THE FEE. One rule, in one file, so pricing cannot drift.
//
//   Fee   = ONE MONTH of the placed candidate's gross monthly salary.
//   VAT   = 18% on top, collected for TRA. NEVER revenue.
//   When  = payable IN FULL on offer acceptance. No engagement fee, no staged
//           50/50, no credit period.
//   Who   = the client. THE CANDIDATE PAYS NOTHING, EVER.
//
// Every one of those is the owner's settled position after the August 2026
// restructure (`memory/recruitment_module_plan.md` §2). Service plans, the
// assistance menu, service fees, rebates and refunds were deleted then and must
// never come back.
//
// ⚠️ CLIENT-SAFE. Pure arithmetic, no imports, no `sb`. Both halves of the app
// read it, and the tests next to it are what stop a careless edit changing what
// Oracle charges.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * TZS per USD — the workbook's Setup sheet, August 2026.
 *
 * ⚠️ A CONSTANT, and it should not stay one. The salary is agreed in dollars and
 * the invoice is raised in shillings, so the rate is part of the price. Phase 3
 * moves it to Settings and FREEZES it onto each invoice at the moment it is
 * raised — the same discipline the ledger already applies to every entry. Until
 * then every figure on screen is "at the workbook rate", and is labelled so.
 */
export const USD_TZS = 2_700;

/** Value Added Tax, Tanzania. Added to every invoice, remitted to TRA. */
export const VAT_RATE = 0.18;

/** The free-replacement guarantee, in months. Terms of Business cl. 6.1. */
export const GUARANTEE_MONTHS = 1;

/**
 * VAT registration threshold, TZS of annual turnover.
 * ⚠️ The forecast is 480m+, so registration is COMPULSORY, not optional.
 */
export const VAT_THRESHOLD_TZS = 200_000_000;

/**
 * What a candidate pays Oracle. Zero, in every circumstance, for ever.
 *
 * Written as a constant on purpose — it is greppable and testable, which a
 * comment is not. There is deliberately no fee, bond, deduction or balance
 * column anywhere in the recruitment schema, and none is ever to be added.
 */
export const CANDIDATE_PAYS_TZS = 0;

/** Day 7, 14 and 30. Terms of Business cl. 6.4 — the written record. */
export const CHECK_IN_DAYS = [7, 14, 30] as const;

export type Fee = {
  /** Agreed monthly gross, USD — the basis for everything below. */
  grossUSD: number;
  /** That gross in shillings, at the workbook rate. */
  grossTZS: number;
  /** The fee itself. Equal to one month's gross — that IS the rule. */
  netTZS: number;
  vatTZS: number;
  /** What the client's invoice comes to. */
  totalTZS: number;
};

/**
 * The whole of Oracle's pricing, in one function.
 *
 * Returns null when the salary is not agreed yet — a job order is usually raised
 * before the money is settled, and a fee of TZS 0 on screen reads as a fact
 * rather than as a blank.
 */
export function feeFor(monthlyGrossUSD: number | string | null | undefined): Fee | null {
  const gross = typeof monthlyGrossUSD === "string" ? Number(monthlyGrossUSD) : monthlyGrossUSD;
  if (gross == null || !Number.isFinite(gross) || gross <= 0) return null;

  const grossTZS = Math.round(gross * USD_TZS);
  const netTZS = grossTZS;                       // one month of gross — the fee
  const vatTZS = Math.round(netTZS * VAT_RATE);
  return { grossUSD: gross, grossTZS, netTZS, vatTZS, totalTZS: netTZS + vatTZS };
}

/**
 * Is VAT registration compulsory on this much turnover?
 *
 * Kept here rather than in a screen because two different places will ask it
 * (the compliance list and the invoice run), and they must agree.
 */
export function vatRegistrationRequired(rollingTurnoverTZS: number): boolean {
  return rollingTurnoverTZS >= VAT_THRESHOLD_TZS;
}

/* ── formatting ──────────────────────────────────────────────────────────── */

/**
 * ⚠️ FIXED LOCALE, on purpose. `toLocaleString()` with the machine's own locale
 * renders one way on the server and another in the browser, which React reports
 * as a hydration mismatch. en-GB gives the separators the workbook uses.
 */
const GROUPED = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });

export function tzs(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return GROUPED.format(Math.round(n));
}

export function tzsFull(n: number | null | undefined): string {
  return n == null || !Number.isFinite(n) ? "—" : `TZS ${tzs(n)}`;
}

export function usd(n: number | null | undefined): string {
  return n == null || !Number.isFinite(n) ? "—" : `USD ${GROUPED.format(Math.round(n))}`;
}

/**
 * 4,185,000 → "4.19m". For a tile where the full number does not earn its width.
 *
 * ⚠️ Rounds through integers rather than `toFixed(2)`. In binary, 4.185 is
 * really 4.18499999…, so `toFixed(2)` reports **4.18** — a figure that quietly
 * rounds DOWN at the halfway point. Small, but it is money on a screen.
 */
export function compactTZS(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  /* Divide FIRST by a hundredth of the unit, then round, then shift the point.
     Dividing to 4.185 and rounding after is what loses the half — the error is
     already in the float by then. */
  const two = (unit: number) => (Math.round(n / (unit / 100)) / 100).toFixed(2).replace(/\.00$/, "");
  if (abs >= 1_000_000_000) return two(1_000_000_000) + "bn";
  if (abs >= 1_000_000) return two(1_000_000) + "m";
  if (abs >= 1_000) return Math.round(n / 1_000) + "k";
  return String(Math.round(n));
}

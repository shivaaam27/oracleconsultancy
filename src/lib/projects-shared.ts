// ─────────────────────────────────────────────────────────────────────────────
// CAPITAL PROJECTS — every figure that is WORKED OUT rather than typed.
//
// Phase 1 of rebuilding the PES CAPITAL PROJECT workbook. This file is the
// SNAPSHOT sheet's arithmetic, lifted out of the spreadsheet and written down
// once, in one place, where it can be read and tested.
//
// ── Why this file exists at all ──────────────────────────────────────────────
// In the workbook, a fact and a calculation look identical. B9 (start date) is
// typed; B11 (expected completion) is `=B9+B10`. Both are just cells in column
// B. You cannot tell them apart by looking, which means:
//   · a broken formula looks exactly like a fact, and
//   · a "fact" can be overwritten by a formula, or the reverse, in one keystroke.
// That is not a hypothetical. It is how MEALS!C42 came to read `=SNAPSHOT!E13`
// and quietly report SAND's budget as the meals budget.
//
// So: the database stores ONLY what a person typed. Everything below is worked
// out fresh on every read. A derived number can never be stale, because it is
// never stored.
//
// ── CLIENT-SAFE, and it must stay that way ───────────────────────────────────
// Pure arithmetic, no imports, no database. Both the server pages and the client
// components import this. It is the `-shared` half of the split described in
// CLAUDE.md ("lib/notes.ts is server-only, lib/notes-shared.ts is what client
// components import"). Never import `sb` or anything from `@/db` here.
//
// ── Every formula is traced to its cell ──────────────────────────────────────
// Each function below names the SNAPSHOT cell it replaces and, where the
// spreadsheet was wrong or fragile, says so and says what changed. Those
// differences are surfaced on screen too — see `contractCorrections()`.
// ─────────────────────────────────────────────────────────────────────────────

/** Milliseconds in a day. Dates here are whole days; no clock time is involved. */
const DAY_MS = 86_400_000;

/** Dar es Salaam. Every date in COS is read in this zone (CLAUDE.md). */
export const EAT = "Africa/Nairobi";

/* ─────────────────────────────────────────────────────────── the inputs ─── */

/**
 * What a person typed. Mirrors the `projects` table's stored columns.
 *
 * Money arrives from Postgres `numeric` as a STRING (postgres.js and Supabase
 * both do this, deliberately — it is how they avoid silently rounding large
 * decimals through a JavaScript float). `num()` below is the one place that
 * conversion happens.
 */
export type ProjectInput = {
  startDate: string | Date | null;
  durationDays: number | null;
  /** Contract price EXCLUDING VAT — workbook B14. */
  quotationValue: string | number | null;
  /** Purchase-order value INCLUDING VAT — workbook C48. */
  poValue: string | number | null;
  /** Extra works agreed after the PO, INCLUDING VAT — workbook C49. */
  additionalWork: string | number | null;
  /** e.g. 0.18 for 18%. A field, not a constant — see below. */
  vatRate: string | number | null;
  /** e.g. 0.10 for 10%. */
  whtRate: string | number | null;
  /** Physical completion as a fraction: 0.98 = 98% — workbook B36. */
  completionPct: string | number | null;
};

/**
 * Figures that come from LATER phases and are simply absent in Phase 1.
 *
 * `budget` is the bill-of-quantities total (Phase 2) and `spent` is the
 * expenditure ledger (Phase 4). Until those exist they are `null`, and every
 * figure that depends on them returns `null` too — which the screen renders as
 * "—" with a note saying which phase supplies it.
 *
 * ⚠️ They are NOT defaulted to zero. A budget of zero is a real, meaningful
 * value (it would make the margin 100%); "we do not know yet" is a different
 * thing entirely and must look different. Conflating the two is how a dashboard
 * ends up confidently reporting a fictional profit.
 */
export type ProjectContext = {
  /** Total of the bill of quantities — workbook BUDGET DATA!C262. Phase 2. */
  budget?: number | null;
  /** Total recorded expenditure — workbook EXPENDITURES I+J. Phase 4. */
  spent?: number | null;
  /** Overridable so tests are not at the mercy of the calendar. */
  today?: Date;
};

/* ───────────────────────────────────────────────────── small conversions ─── */

/** A stored value as a number, or null when genuinely absent. */
export function num(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * A calendar date, pinned to UTC midnight, so day arithmetic is exact.
 *
 * ⚠️ This is fiddlier than it looks and the obvious version is wrong. The first
 * attempt did `new Date("2026-01-19")` then `setHours(0,0,0,0)`: the string
 * parses as UTC midnight, and setHours then moves it to LOCAL midnight — which,
 * in Dar es Salaam (UTC+3), is three hours EARLIER, i.e. the previous day. Add
 * the 120-day duration and the expected completion came out 18 May instead of
 * 19 May. The unit test caught it; a person never would, because 205 days
 * elapsed and −85 remaining were both still correct (both ends had shifted
 * equally) and only the one displayed date was a day out.
 *
 * So: a date-only string is read as the calendar date it plainly is, and a
 * timestamp from the database is read as the date it falls on IN DAR ES SALAAM
 * before the clock time is discarded. `en-CA` formats as YYYY-MM-DD — the same
 * idiom `lib/calendar-overlays.ts` already uses for this.
 */
function day(v: string | Date | null | undefined): Date | null {
  if (!v) return null;
  if (typeof v === "string") {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
    if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  }
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  const [y, mo, da] = d.toLocaleDateString("en-CA", { timeZone: EAT }).split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, da));
}

/** a ÷ b, but null when b is missing or zero. Guards every ratio below. */
function ratio(a: number | null, b: number | null): number | null {
  if (a === null || b === null || b === 0) return null;
  return a / b;
}

/* ──────────────────────────────────────────────────────────── programme ─── */

export type Programme = {
  /** SNAPSHOT B11 — `=B9+B10`. */
  expectedCompletion: Date | null;
  /** SNAPSHOT B12 — `=TODAY()-B9`. */
  daysElapsed: number | null;
  /** SNAPSHOT B13 — `=B10-B12`. Negative means overdue. */
  daysRemaining: number | null;
  /** Positive count of days past the expected date; 0 when not overdue. */
  daysOverdue: number;
  /** How far through the allowed time we are, as a fraction. Not in the workbook. */
  timeElapsedPct: number | null;
};

/**
 * The programme block, SNAPSHOT B9–B13.
 *
 * The workbook shows B13 as a bare negative number: today it reads `-85`. That
 * is correct arithmetic and poor communication — a minus sign is easy to skim
 * past on a page of black figures. `daysOverdue` restates the same fact as a
 * positive number the screen can colour and label "85 days overdue". Nothing is
 * hidden; the raw `daysRemaining` is returned as well.
 *
 * `timeElapsedPct` is new. It exists so the record can put time spent next to
 * work completed — the comparison that tells you whether a job is actually
 * behind. The workbook has both numbers but never places them together.
 */
export function programme(p: ProjectInput, ctx: ProjectContext = {}): Programme {
  const start = day(p.startDate);
  const duration = p.durationDays ?? null;
  const today = day(ctx.today ?? new Date())!;

  const expectedCompletion =
    start && duration !== null ? new Date(start.getTime() + duration * DAY_MS) : null;
  const daysElapsed = start ? Math.round((today.getTime() - start.getTime()) / DAY_MS) : null;
  const daysRemaining =
    duration !== null && daysElapsed !== null ? duration - daysElapsed : null;

  return {
    expectedCompletion,
    daysElapsed,
    daysRemaining,
    daysOverdue: daysRemaining !== null && daysRemaining < 0 ? Math.abs(daysRemaining) : 0,
    timeElapsedPct: ratio(daysElapsed, duration),
  };
}

/* ───────────────────────────────────────────────────────────── contract ─── */

export type Contract = {
  /** SNAPSHOT C50 — `=C48+C49`. Total order value including VAT. */
  totalContract: number | null;
  /** The VAT contained within `totalContract`. Not shown in the workbook. */
  vatPortion: number | null;
  /** `totalContract` with VAT stripped out — the base withholding tax applies to. */
  contractExVat: number | null;
  /** SNAPSHOT C47 — the client's 10% withholding deduction. */
  withholdingTax: number | null;
  /** SNAPSHOT B16 — `=B14-B15`. Null until Phase 2 supplies the budget. */
  budgetedProfit: number | null;
  /** SNAPSHOT B17 — `=B16/B14`. */
  projectedMargin: number | null;
  /** SNAPSHOT B19 — `=B16-B18`. */
  profitAfterWht: number | null;
  /** SNAPSHOT B20 — `=B19/B14`. */
  marginAfterWht: number | null;
};

/**
 * The money block, SNAPSHOT B14–B20 and C46–C50.
 *
 * ── Correction 1: what withholding tax is charged on ─────────────────────────
 * Workbook:  `C47 = (C46/1.18)*10%`
 * Here:      `(poValue + additionalWork) / (1 + vatRate) * whtRate`
 *
 * `C46` is `=SUM(C40:C45)` — the total of the four PAYMENT PLAN stage rows. That
 * happens to equal the PO value today, because the four stages were worked out
 * as 30/25/25/20 of it. But the two are not the same thing: the stage rows are a
 * BILLING SCHEDULE, and additional works (C49) never appear in them. The moment
 * a variation is agreed, the workbook's tax figure stops matching the contract
 * it is supposedly taxing. Taking it from the contract value itself removes
 * that trap. **On this project the two agree exactly today** — see
 * `contractCorrections()`, which shows both so you can confirm that yourself.
 *
 * ── Correction 2: the rates ──────────────────────────────────────────────────
 * `1.18` and `10%` were typed inside the formula, where nothing on screen
 * mentions them. They are now fields on the project, shown next to the figure
 * they produce. Same answer at 18% and 10%; a different and CORRECT answer for a
 * zero-rated or exempt contract, and a visible one if a rate ever changes.
 *
 * ── Why `/(1 + vatRate)` and not `× (1 - vatRate)` ───────────────────────────
 * Removing VAT is division, not subtraction. A figure of 118 that includes 18%
 * VAT has a base of 118/1.18 = 100, not 118 × 0.82 = 96.76. The workbook gets
 * this right; it is written out here so nobody "simplifies" it later.
 */
export function contract(p: ProjectInput, ctx: ProjectContext = {}): Contract {
  const quotation = num(p.quotationValue);
  const po = num(p.poValue);
  const extra = num(p.additionalWork);
  const vatRate = num(p.vatRate);
  const whtRate = num(p.whtRate);
  const budget = ctx.budget ?? null;

  // Additional work absent means none agreed yet — zero is the right reading
  // here, unlike the budget, because "no variations" is a real state.
  const totalContract = po === null ? null : po + (extra ?? 0);

  const contractExVat =
    totalContract === null || vatRate === null ? null : totalContract / (1 + vatRate);
  const vatPortion =
    totalContract === null || contractExVat === null ? null : totalContract - contractExVat;
  const withholdingTax =
    contractExVat === null || whtRate === null ? null : contractExVat * whtRate;

  const budgetedProfit = quotation === null || budget === null ? null : quotation - budget;
  const profitAfterWht =
    budgetedProfit === null || withholdingTax === null ? null : budgetedProfit - withholdingTax;

  return {
    totalContract,
    vatPortion,
    contractExVat,
    withholdingTax,
    budgetedProfit,
    projectedMargin: ratio(budgetedProfit, quotation),
    profitAfterWht,
    marginAfterWht: ratio(profitAfterWht, quotation),
  };
}

/* ────────────────────────────────────────────────── showing the changes ─── */

export type Correction = {
  label: string;
  /** What the spreadsheet's formula produces, reproduced faithfully. */
  excel: number | null;
  /** What the corrected formula produces. */
  corrected: number | null;
  /** The spreadsheet formula, as written in the cell. */
  excelFormula: string;
  /** Why it changed, in one sentence. */
  why: string;
  /** True when the two agree today — most will, which is the point. */
  same: boolean;
};

/**
 * Old figure beside new figure, for every correction Phase 1 makes.
 *
 * You asked to see these side by side rather than be handed a corrected number
 * and told to trust it. This produces that comparison from the same inputs, so
 * it cannot drift from what the record actually shows.
 *
 * `stagePlanTotal` is the workbook's `C46` — the sum of the payment-plan stage
 * amounts. Phase 1 has no payment plan yet, so when it is not supplied the
 * comparison falls back to the PO value alone, which is what `C46` equals on
 * this project. Passing it in later makes the comparison exact.
 */
export function contractCorrections(
  p: ProjectInput,
  opts: { stagePlanTotal?: number | null } = {},
): Correction[] {
  const po = num(p.poValue);
  const extra = num(p.additionalWork);
  const vatRate = num(p.vatRate);
  const whtRate = num(p.whtRate);

  // The workbook's own formula, reproduced exactly: hard-coded 1.18 and 10%,
  // applied to the payment-plan total.
  const excelBase = opts.stagePlanTotal ?? po;
  const excelWht = excelBase === null ? null : (excelBase / 1.18) * 0.1;
  const correctedWht = contract(p).withholdingTax;

  const excelTotal = po; // the workbook has no separate "total contract" until C50
  const correctedTotal = po === null ? null : po + (extra ?? 0);

  const near = (a: number | null, b: number | null) =>
    a === null || b === null ? a === b : Math.abs(a - b) < 0.005;

  return [
    {
      label: "Withholding tax",
      excel: excelWht,
      corrected: correctedWht,
      excelFormula: "=(C46/1.18)*10%",
      why:
        `Charged on the contract value (PO + additional work) instead of the payment-plan total, ` +
        `and using this project's stored rates (VAT ${pct(vatRate) ?? "—"}, WHT ${pct(whtRate) ?? "—"}) ` +
        `instead of the 1.18 and 10% typed inside the formula.`,
      same: near(excelWht, correctedWht),
    },
    {
      label: "Total contract value",
      excel: excelTotal,
      corrected: correctedTotal,
      excelFormula: "=C48+C49",
      why:
        "Unchanged in method — additional work is added to the PO value. Shown here because " +
        "it is now what the tax above is calculated from.",
      same: near(excelTotal, correctedTotal),
    },
  ];
}

/* ─────────────────────────────────────────────────────────── formatting ─── */

/**
 * Money, Tanzanian shillings, no decimals.
 *
 * Whole shillings throughout: the contract is 195 million and the workbook's own
 * figures carry two decimal places that nobody reads. The stored value keeps its
 * precision; only the display rounds.
 */
export function money(v: number | null | undefined): string | null {
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  return new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 }).format(v);
}

/** A fraction as a percentage: 0.115 → "11.5%". */
export function pct(v: number | null | undefined, dp = 1): string | null {
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  return `${(v * 100).toFixed(dp)}%`;
}

/** A date as "19 May 2026", read in Dar es Salaam. */
export function fmtDate(v: Date | string | null | undefined): string | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric", timeZone: EAT,
  });
}

/* ────────────────────────────────────────────────────────────── status ──── */

export const PROJECT_STATUSES = ["Active", "On hold", "Completed", "Closed"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/** Open means anything but Completed/Closed — the same rule tasks use. */
export function isOpen(status: string): boolean {
  return status !== "Completed" && status !== "Closed";
}

/**
 * How a project is doing, for the status dot.
 *
 * Deliberately about TIME only. Whether it is over budget is a different
 * question with a different answer, and it arrives in Phase 2 when there is a
 * budget to compare against. One dot answering two questions would be a dot
 * answering neither.
 */
export function scheduleTone(pr: Programme, status: string): "success" | "warn" | "danger" | "muted" {
  if (!isOpen(status)) return "muted";
  if (pr.daysRemaining === null) return "muted";
  if (pr.daysRemaining < 0) return "danger";
  if (pr.daysRemaining <= 14) return "warn";
  return "success";
}

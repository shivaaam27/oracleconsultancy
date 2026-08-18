// ─────────────────────────────────────────────────────────────────────────────
// THE SNAPSHOT — budget-vs-actual gauge and the payment plan (Phase 5).
//
// The workbook's dashboard, rebuilt. Client-safe: pure arithmetic, no database.
// ─────────────────────────────────────────────────────────────────────────────

import { num } from "@/lib/projects-shared";

/* ───────────────────────────────────────────────── budget vs actual gauge ── */

export type GaugeRow = {
  category: string;
  budget: number;
  actual: number;
  /** actual ÷ budget. Null when there is no budget to measure against. */
  utilisation: number | null;
  /** This category's share of the whole budget — the workbook's "COST CONT". */
  share: number;
  band: GaugeBand;
};

/**
 * The six colour bands of SNAPSHOT columns H and M.
 *
 * ⚠️ The workbook compares these as TEXT (`cellIs between "1%" and "25%"`),
 * which is why "100%" sorts between "1%" and "25%" as a string. Comparing
 * numbers here fixes a real mis-colouring in the original.
 */
export type GaugeBand = "none" | "low" | "quarter" | "half" | "most" | "full" | "over";

export function gaugeBand(utilisation: number | null): GaugeBand {
  if (utilisation === null) return "none";
  if (utilisation <= 0) return "none";
  if (utilisation > 1) return "over";
  if (utilisation <= 0.25) return "low";
  if (utilisation <= 0.5) return "quarter";
  if (utilisation <= 0.75) return "half";
  if (utilisation <= 1) return "most";
  return "full";
}

export const BAND_TONE: Record<GaugeBand, string> = {
  none: "muted", low: "success", quarter: "success",
  half: "info", most: "warn", full: "warn", over: "danger",
};

/**
 * Budget against actual spend, per category — SNAPSHOT D6:M35.
 *
 * Worst first: the categories closest to (or past) their budget float to the
 * top, so the page opens on what needs attention. The workbook sorts by budget
 * SIZE instead, which buries a small category at 235% utilisation near the
 * bottom. On the real data FUEL is exactly that case.
 */
export function categoryGauge(
  budgetByCategory: Array<{ category: string; amount: number }>,
  spentByCategory: Map<string, number>,
): GaugeRow[] {
  const total = budgetByCategory.reduce((s, b) => s + b.amount, 0);
  const seen = new Set<string>();
  const rows: GaugeRow[] = [];

  for (const b of budgetByCategory) {
    seen.add(b.category);
    const actual = spentByCategory.get(b.category) ?? 0;
    const utilisation = b.amount > 0 ? actual / b.amount : null;
    rows.push({
      category: b.category, budget: b.amount, actual, utilisation,
      share: total > 0 ? b.amount / total : 0,
      band: gaugeBand(utilisation),
    });
  }

  // Spend on a category that has NO budget line. The workbook cannot show this
  // at all — its gauge is a fixed list of categories — so overspend on something
  // never budgeted for is invisible there.
  for (const [category, actual] of spentByCategory) {
    if (seen.has(category)) continue;
    rows.push({ category, budget: 0, actual, utilisation: null, share: 0, band: "over" });
  }

  return rows.sort((a, b) => {
    const au = a.utilisation ?? (a.actual > 0 ? Infinity : -1);
    const bu = b.utilisation ?? (b.actual > 0 ? Infinity : -1);
    return bu - au || b.budget - a.budget;
  });
}

/* ─────────────────────────────────────────────────────────── payment plan ── */

export type PaymentStage = {
  id: number;
  label: string;
  thresholdPct: string | null;
  sharePct: string | null;
  amount: string | null;
  invoiceDate: string | null;
  invoiceAmount: string | null;
  receivedDate: string | null;
  amountReceived: string | null;
  sortOrder: number;
  notes: string | null;
};

export type StageView = {
  stage: PaymentStage;
  /** Typed amount, else share × total contract. */
  amount: number | null;
  received: number;
  balance: number | null;
  /** SNAPSHOT D40: threshold reached by physical completion. */
  billable: boolean | null;
  invoiced: boolean;
};

/**
 * A stage's status — SNAPSHOT `=IF(B40 < $B$36, "COMPLETED", "NOT COMPLETED")`.
 *
 * One typed number (physical completion) drives the whole billing schedule,
 * which is the neatest idea in the workbook and is kept exactly.
 *
 * ⚠️ The workbook's wording is misleading: it labels a stage "COMPLETED" when it
 * means "this stage may now be billed". Renamed to `billable`, because a stage
 * you may invoice and a stage the client has PAID are very different things, and
 * the same row already carries the amount received.
 */
export function stageViews(
  stages: PaymentStage[],
  opts: { totalContract: number | null; completionPct: number | null },
): StageView[] {
  return [...stages]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((s) => {
      const share = num(s.sharePct);
      const typed = num(s.amount);
      const amount = typed ?? (share !== null && opts.totalContract !== null ? share * opts.totalContract : null);
      const received = num(s.amountReceived) ?? 0;
      const threshold = num(s.thresholdPct);
      return {
        stage: s,
        amount,
        received,
        balance: amount === null ? null : amount - received,
        billable:
          threshold === null || opts.completionPct === null ? null : threshold < opts.completionPct,
        invoiced: num(s.invoiceAmount) !== null,
      };
    });
}

export type PlanTotals = {
  planned: number;
  invoiced: number;
  received: number;
  /** Planned minus received — still to collect. */
  outstanding: number;
  /** Billable now but not yet invoiced — money being left on the table. */
  billableNotInvoiced: number;
};

export function planTotals(views: StageView[]): PlanTotals {
  let planned = 0, invoiced = 0, received = 0, billableNotInvoiced = 0;
  for (const v of views) {
    planned += v.amount ?? 0;
    invoiced += num(v.stage.invoiceAmount) ?? 0;
    received += v.received;
    if (v.billable && !v.invoiced) billableNotInvoiced += v.amount ?? 0;
  }
  return { planned, invoiced, received, outstanding: planned - received, billableNotInvoiced };
}

/** The four stages the workbook uses, offered when a plan is first set up. */
export const DEFAULT_STAGES: Array<{ label: string; thresholdPct: number; sharePct: number }> = [
  { label: "Advance payment (IPC 0)", thresholdPct: 0, sharePct: 0.3 },
  { label: "Interim payment 1 (IPC 1)", thresholdPct: 0.5, sharePct: 0.25 },
  { label: "Interim payment 2 (IPC 2)", thresholdPct: 0.75, sharePct: 0.25 },
  { label: "Practical completion", thresholdPct: 1, sharePct: 0.2 },
];

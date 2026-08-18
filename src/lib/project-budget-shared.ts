// Client-safe half of the project budget (Phase 2).
//
// Types and pure helpers only — no `sb`, no database. The server half is
// `project-budget.ts`. Getting this split wrong kills every page with
// "SUPABASE_SERVICE_ROLE_KEY is not set" (CLAUDE.md).

import { num } from "@/lib/projects-shared";

/** One priced line of the Bill of Quantities. */
export type BudgetLine = {
  id: number;
  projectId: number;
  /** `TIMBER2X2-SETTING OUT` — the key every later phase joins on. */
  itemCode: string;
  /** `TIMBER2X2` — the bucket the dashboard groups by. */
  category: string;
  /** `SETTING OUT` — where in the build it is used. */
  subJob: string | null;
  description: string | null;
  /** Postgres `numeric` arrives as a string; converted at the point of use. */
  amount: string;
  /** ⚠️ Always null in Phase 2 — the column exists but is not tracked. */
  qty: string | null;
  unit: string | null;
  sortOrder: number;
  notes: string | null;
};

export type CategoryTotal = {
  category: string;
  amount: number;
  lines: number;
  /** This category's share of the whole budget — the workbook's "COST CONT". */
  share: number;
};

/**
 * Build an item code the way the workbook does: `CONCATENATE(job code, sub-job)`.
 *
 * PATAMELA column E is exactly this, and it is why the same material bought for
 * twenty parts of a building can still be tracked per part. Offered as a
 * suggestion while typing — never forced, because the workbook's own codes are
 * not perfectly consistent (`SAND-BLINDING-BACKFILLING` has an extra hyphen)
 * and a rebuild that silently "corrects" existing codes would fail to match the
 * requisitions raised against them.
 */
export function suggestItemCode(category: string, subJob: string): string {
  const c = category.trim().replace(/\s+/g, " ").toUpperCase();
  const s = subJob.trim().replace(/\s+/g, " ").toUpperCase();
  if (!c) return "";
  return s ? `${c}-${s}` : c;
}

/**
 * Lines grouped by category, biggest first.
 *
 * This is the workbook's PATAMELA T/U block (`UNIQUE` + `SUMIF` by job code) and
 * it is what the SNAPSHOT gauge is drawn from in Phase 5. Worst-first ordering
 * matches the rest of COS (DESIGN_SYSTEM.md §12).
 */
export function groupByCategory(lines: BudgetLine[]): CategoryTotal[] {
  const by = new Map<string, { amount: number; count: number }>();
  for (const l of lines) {
    const cur = by.get(l.category) ?? { amount: 0, count: 0 };
    cur.amount += num(l.amount) ?? 0;
    cur.count += 1;
    by.set(l.category, cur);
  }
  const total = [...by.values()].reduce((s, v) => s + v.amount, 0);
  return [...by.entries()]
    .map(([category, v]) => ({
      category,
      amount: v.amount,
      lines: v.count,
      share: total > 0 ? v.amount / total : 0,
    }))
    .sort((a, b) => b.amount - a.amount);
}

/**
 * Item codes are compared in UPPER CASE with tidied spacing.
 *
 * The workbook's codes are shouty (`TIMBER2X2-SETTING OUT`) and typed by hand
 * over months, so `Cement-Strip-Foundation` and `CEMENT-STRIP-FOUNDATION` will
 * certainly both get typed. Two rows that differ only in case would defeat the
 * unique index and split one item's budget in two.
 */
export function normaliseCode(v: string): string {
  return v.trim().replace(/\s+/g, " ").toUpperCase();
}

/** Whole shillings with separators — matches the rest of the project screens. */
export function money(v: number | null | undefined): string | null {
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  return new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 }).format(v);
}

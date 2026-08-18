// ─────────────────────────────────────────────────────────────────────────────
// THE EXECUTIVE REPORT — the client-safe half: pure arithmetic (Stage 6).
//
// ⚠️ No `sb` import, and no new table. NOTHING ON THIS SCREEN IS TYPED. Every
// figure is worked out from the order lines, the shipments and the despatch
// documents that already exist.
//
// That is the whole point of the stage. In the workbook these are the sheets
// that hold no data of their own and have rotted anyway:
//
//   · PENDING            32,273 formulas, 27 typed cells — and 223 dead cells
//                        in its ITEM column, so the item text is whatever
//                        Google last computed before the file was exported
//   · PURCHASE ANALYSIS  14,839 formulas, 463 typed
//   · DAILY ANALYSIS     pure SUMIF
//   · PAYMENTS FORECAST  abandoned; 8 cells filled in the whole sheet
//
// A formula that has stopped recalculating looks exactly like a number somebody
// checked. Here there are no stored figures to go stale.
// ─────────────────────────────────────────────────────────────────────────────

import { num, type LineView } from "@/lib/ops-orders-shared";
import type { ShipmentView } from "@/lib/ops-shipments-shared";

/* ─────────────────────────────────────────────── what is stuck, and where ─── */

/** One open line, as PENDING lists it. */
export type PendingLine = {
  view: LineView;
  /** Whose desk it is on — or null, which is itself worth seeing. */
  pendingWith: string | null;
  status: string | null;
  /** Positive = past its due date. */
  overdueDays: number | null;
};

/**
 * Everything still open, worst first.
 *
 * "Open" means not invoiced — the same meaning the rest of COS gives it. An
 * archived line is already gone before this is called.
 *
 * ⚠️ Sorted by how late it is, with lines that have NO due date last rather
 * than first. A line nobody gave a date to is not the most urgent thing in the
 * business; it is a line nobody gave a date to.
 */
export function pendingLines(views: LineView[]): PendingLine[] {
  return views
    .filter((v) => !v.invoiced)
    .map((v) => ({
      view: v,
      pendingWith: v.line.pendingWith,
      status: v.line.status,
      overdueDays: v.overdueDays,
    }))
    .sort((a, b) => {
      if (a.overdueDays === null && b.overdueDays === null) return 0;
      if (a.overdueDays === null) return 1;
      if (b.overdueDays === null) return -1;
      return b.overdueDays - a.overdueDays;
    });
}

export type DeskGroup = {
  /** The name typed in "pending with", or null for the lines nobody claimed. */
  name: string | null;
  lines: number;
  overdue: number;
  /** Value of the open lines on this desk. Null when none could be priced. */
  valueTzs: number | null;
  unpriced: number;
  /** The worst line on the desk, in days late. */
  worstDays: number | null;
};

/**
 * The open work grouped by whose desk it is sitting on.
 *
 * ⚠️ The unclaimed lines are a GROUP, not a gap. The workbook's PENDING WITH
 * column is the most useful thing on the sheet and the most often left empty;
 * showing "nobody" as a row with a count is what makes that visible.
 */
export function byDesk(rows: PendingLine[]): DeskGroup[] {
  const groups = new Map<string, PendingLine[]>();
  for (const r of rows) {
    const key = r.pendingWith?.trim() || "";
    const b = groups.get(key);
    if (b) b.push(r); else groups.set(key, [r]);
  }

  const out: DeskGroup[] = [];
  for (const [key, list] of groups) {
    let valueTzs: number | null = null;
    let unpriced = 0, overdue = 0, worstDays: number | null = null;
    for (const r of list) {
      if (r.view.saleTotalTzs === null) unpriced += 1;
      else valueTzs = (valueTzs ?? 0) + r.view.saleTotalTzs;
      if ((r.overdueDays ?? 0) > 0) overdue += 1;
      if (r.overdueDays !== null && (worstDays === null || r.overdueDays > worstDays)) {
        worstDays = r.overdueDays;
      }
    }
    out.push({
      name: key === "" ? null : key,
      lines: list.length, overdue, valueTzs, unpriced, worstDays,
    });
  }

  // Worst first, and the unclaimed pile never hides at the bottom on a tie.
  return out.sort((a, b) => (b.worstDays ?? -Infinity) - (a.worstDays ?? -Infinity));
}

/** The same, grouped by the status somebody typed on the line. */
export function byStatus(rows: PendingLine[]): DeskGroup[] {
  const groups = new Map<string, PendingLine[]>();
  for (const r of rows) {
    const key = r.status?.trim() || "";
    const b = groups.get(key);
    if (b) b.push(r); else groups.set(key, [r]);
  }
  const out: DeskGroup[] = [];
  for (const [key, list] of groups) {
    let valueTzs: number | null = null;
    let unpriced = 0, overdue = 0, worstDays: number | null = null;
    for (const r of list) {
      if (r.view.saleTotalTzs === null) unpriced += 1;
      else valueTzs = (valueTzs ?? 0) + r.view.saleTotalTzs;
      if ((r.overdueDays ?? 0) > 0) overdue += 1;
      if (r.overdueDays !== null && (worstDays === null || r.overdueDays > worstDays)) {
        worstDays = r.overdueDays;
      }
    }
    out.push({ name: key === "" ? null : key, lines: list.length, overdue, valueTzs, unpriced, worstDays });
  }
  return out.sort((a, b) => (b.worstDays ?? -Infinity) - (a.worstDays ?? -Infinity));
}

/* ────────────────────────────────────────────── what we owe our suppliers ─── */

export type SupplierBalance = {
  supplier: string;
  lines: number;
  /** What those lines cost us, in shillings. */
  boughtTzs: number | null;
  /** The part with a payment date against it. */
  paidTzs: number | null;
  /** bought − paid. ⚠️ Null when what we bought is not known. */
  owedTzs: number | null;
  /** Lines we could not cost — reported, never quietly dropped. */
  uncosted: number;
  /** Lines still waiting to be paid. */
  unpaidLines: number;
  /** The oldest unpaid purchase, in days. */
  oldestDays: number | null;
};

/**
 * What is still owed to each supplier.
 *
 * This is PAYMENTS FORECAST, which the workbook gave up on after eight cells,
 * and the PAID / BALANCE columns of PURCHASE ANALYSIS.
 *
 * ⚠️ **This is the OLD, date-only view, and it is kept for one reason.** Stage 7
 * added `ops_payments`, so real amounts now exist and `payeeBalances` in
 * `ops-payments-shared.ts` is the figure to trust. This function still answers
 * "which purchases have never been marked paid at all", which is a different
 * and still useful question — a line with no payment date and no payment row is
 * one nobody has touched.
 *
 * ⚠️ Do not quote its `owedTzs` as what is owed. The Report screen reads the
 * payments version.
 */
export function supplierBalances(views: LineView[], today: Date = new Date()): SupplierBalance[] {
  const groups = new Map<string, LineView[]>();
  for (const v of views) {
    const name = v.line.supplier?.trim();
    if (!name) continue;
    const b = groups.get(name);
    if (b) b.push(v); else groups.set(name, [v]);
  }

  const now = today.getTime();
  const out: SupplierBalance[] = [];
  for (const [supplier, list] of groups) {
    let boughtTzs: number | null = null, paidTzs: number | null = null;
    let uncosted = 0, unpaidLines = 0, oldestDays: number | null = null;

    for (const v of list) {
      const cost = v.purchaseTotalTzs;
      if (cost === null) uncosted += 1;
      else boughtTzs = (boughtTzs ?? 0) + cost;

      const paid = Boolean(v.line.supplierPaymentDate);
      if (paid) {
        if (cost !== null) paidTzs = (paidTzs ?? 0) + cost;
      } else {
        unpaidLines += 1;
        const bought = v.line.purchaseDate;
        if (bought) {
          const days = Math.round((now - new Date(bought).getTime()) / 86_400_000);
          if (oldestDays === null || days > oldestDays) oldestDays = days;
        }
      }
    }

    out.push({
      supplier, lines: list.length, boughtTzs, paidTzs,
      owedTzs: boughtTzs === null ? null : boughtTzs - (paidTzs ?? 0),
      uncosted, unpaidLines, oldestDays,
    });
  }

  // Biggest debt first.
  return out.sort((a, b) => (b.owedTzs ?? -1) - (a.owedTzs ?? -1));
}

/* ─────────────────────────────────────────────── the whole business, once ─── */

export type ReportTotals = {
  openLines: number;
  overdueLines: number;
  /** Value of everything still open. */
  openValueTzs: number;
  openUnpriced: number;
  /** Lines with nobody's name against them. */
  unclaimed: number;
  /** Owed to suppliers for goods. */
  owedToSuppliers: number;
  suppliersUnknown: number;
  /** Duty and clearing charges still to pay, from the shipments. */
  dutyToPay: number;
  /** Shipments not yet cleared. */
  atPort: number;
};

export function reportTotals(
  pending: PendingLine[],
  suppliers: SupplierBalance[],
  shipments: ShipmentView[],
): ReportTotals {
  let openValueTzs = 0, openUnpriced = 0, overdueLines = 0, unclaimed = 0;
  for (const r of pending) {
    if (r.view.saleTotalTzs === null) openUnpriced += 1;
    else openValueTzs += r.view.saleTotalTzs;
    if ((r.overdueDays ?? 0) > 0) overdueLines += 1;
    if (!r.pendingWith?.trim()) unclaimed += 1;
  }

  let owedToSuppliers = 0, suppliersUnknown = 0;
  for (const s of suppliers) {
    if (s.owedTzs === null) suppliersUnknown += 1;
    else if (s.owedTzs > 0.005) owedToSuppliers += s.owedTzs;
  }

  let dutyToPay = 0, atPort = 0;
  for (const s of shipments) {
    if (!s.cleared) atPort += 1;
    if (s.balance !== null && s.balance > 0.005) {
      // The shipment's own frozen rate, as everywhere else in the module.
      const rate = num(s.shipment.exRate);
      const c = (s.shipment.costCurrency ?? "").trim().toUpperCase();
      const tzs = c === "" || c === "TZS" || c === "TSH" ? s.balance
        : rate === null || rate <= 0 ? null : s.balance * rate;
      if (tzs !== null) dutyToPay += tzs;
    }
  }

  return {
    openLines: pending.length, overdueLines, openValueTzs, openUnpriced, unclaimed,
    owedToSuppliers, suppliersUnknown, dutyToPay, atPort,
  };
}

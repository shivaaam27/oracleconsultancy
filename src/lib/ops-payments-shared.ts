// ─────────────────────────────────────────────────────────────────────────────
// PAYMENTS — the client-safe half: types and pure arithmetic (Stage 7).
//
// ⚠️ No `sb` import. The server half is `ops-payments.ts`.
//
// This is the half of the business COS could not hold until now. The order line
// carried `supplier_payment_date` and nothing else, so a purchase was settled or
// it was not — while IMP PMT AND FREIGHT has been tracking amount paid, balance,
// due date, overdue-by, ageing band and advances against the same invoice for
// 353 rows. A 40% advance had nowhere to go.
//
// Two rules run through everything here:
//
//   · **Owed is a subtraction, so it is UNKNOWN when either side is.** A
//     purchase nobody costed does not owe nothing.
//   · **An overpayment is shown, not clamped.** Paying 4,468 against 3,388
//     reads as −1,080 in the workbook too; it is either an advance against the
//     next order or a mistake, and both want looking at.
// ─────────────────────────────────────────────────────────────────────────────

import { num, day, toTzs, type LineView } from "@/lib/ops-orders-shared";
import type { ShipmentView } from "@/lib/ops-shipments-shared";

export type Payment = {
  id: number;
  companyId: number;
  payee: string | null;
  kind: string | null;
  paidDate: string | null;
  amount: string | null;
  currency: string | null;
  exRate: string | null;
  reference: string | null;
  orderLineId: number | null;
  shipmentId: number | null;
  notes: string | null;
  archived: boolean;
};

const DAY_MS = 86_400_000;

/** What a payment is worth in shillings, at the rate frozen on IT.
 *  ⚠️ Null for a foreign payment with no rate — not the raw number. */
export function paymentTzs(p: Payment): number | null {
  return toTzs(num(p.amount), p.currency, num(p.exRate));
}

/** Sum a set of payments, and say how many could not be converted. */
export function sumPayments(payments: Payment[]): { total: number | null; unconverted: number } {
  let total: number | null = null;
  let unconverted = 0;
  for (const p of payments) {
    const v = paymentTzs(p);
    if (v === null) unconverted += 1;
    else total = (total ?? 0) + v;
  }
  return { total, unconverted };
}

/* ─────────────────────────────────────── what is owed on one purchase ────── */

export type PurchaseDebt = {
  line: LineView;
  /** What the goods cost us, in shillings. */
  costTzs: number | null;
  paidTzs: number | null;
  payments: number;
  /** cost − paid. ⚠️ Null when the cost is unknown; negative when overpaid. */
  owedTzs: number | null;
  /** Paid before the goods were despatched — the workbook's ADVANCE PAID. */
  advanceTzs: number | null;
  settled: boolean;
  /** Days past the supplier's due date. Null once settled or with no date. */
  overdueDays: number | null;
  /** CURRENT | 0 - 30 DAYS | 31 - 60 DAYS | 61 - 90 DAYS | OVER 90 DAYS */
  ageing: string | null;
};

/**
 * The ageing band, in the workbook's own words.
 *
 * ⚠️ The bands are the ones on the MASTER sheet, so a figure here can be checked
 * against a figure there. They are NOT configurable in code — the Setup list
 * `ageing_bucket` holds the same names for reporting, and if the owner renames
 * one there this stays as it is until somebody wires it, which is honest rather
 * than half-wired.
 */
export function ageingBand(overdueDays: number | null): string | null {
  if (overdueDays === null) return null;
  if (overdueDays <= 0) return "CURRENT";
  if (overdueDays <= 30) return "0 - 30 DAYS";
  if (overdueDays <= 60) return "31 - 60 DAYS";
  if (overdueDays <= 90) return "61 - 90 DAYS";
  return "OVER 90 DAYS";
}

export function purchaseDebt(
  line: LineView,
  payments: Payment[],
  today: Date = new Date(),
): PurchaseDebt {
  const costTzs = line.purchaseTotalTzs;
  const { total: paidTzs } = sumPayments(payments);

  // An advance is money out before the goods went out. `delivered` comes off
  // the despatch document, so a payment made before that date is an advance.
  let advanceTzs: number | null = null;
  for (const p of payments) {
    const v = paymentTzs(p);
    if (v === null) continue;
    const isAdvance =
      (p.kind ?? "").trim().toUpperCase() === "ADVANCE" || (!line.delivered && p.paidDate !== null);
    if (isAdvance) advanceTzs = (advanceTzs ?? 0) + v;
  }

  const owedTzs = costTzs === null ? null : costTzs - (paidTzs ?? 0);
  const settled = owedTzs !== null && owedTzs <= 0.005;

  const due = day(line.line.supplierDueDate);
  const now = day(today)!;
  // The clock stops once it is settled — otherwise a purchase paid last year
  // sits at "300 days overdue" and buries the ones somebody still owes.
  const overdueDays =
    due === null || settled ? null : Math.round((now.getTime() - due.getTime()) / DAY_MS);

  return {
    line, costTzs, paidTzs, payments: payments.length,
    owedTzs, advanceTzs, settled, overdueDays, ageing: ageingBand(overdueDays),
  };
}

/* ───────────────────────────────────── what is owed on one shipment ─────── */

export type ShipmentDebt = {
  shipment: ShipmentView;
  /** Duty, VAT, wharfage, agency and freight, in shillings. */
  chargesTzs: number | null;
  paidTzs: number | null;
  payments: number;
  owedTzs: number | null;
  settled: boolean;
};

export function shipmentDebt(view: ShipmentView, payments: Payment[]): ShipmentDebt {
  const chargesTzs = view.costTotalTzs;
  const { total: paidTzs } = sumPayments(payments);
  const owedTzs = chargesTzs === null ? null : chargesTzs - (paidTzs ?? 0);
  return {
    shipment: view, chargesTzs, paidTzs, payments: payments.length,
    owedTzs, settled: owedTzs !== null && owedTzs <= 0.005,
  };
}

/* ──────────────────────────────────────────────── by whoever we owe it ──── */

export type PayeeBalance = {
  payee: string;
  /** What we have been billed by them, as far as anything is costed. */
  billedTzs: number | null;
  paidTzs: number | null;
  owedTzs: number | null;
  /** Purchases and shipments of theirs with nothing costed on them. */
  uncosted: number;
  payments: number;
  /** The worst ageing band anything of theirs sits in. */
  worstAgeing: string | null;
  oldestOverdueDays: number | null;
};

const BAND_ORDER = ["CURRENT", "0 - 30 DAYS", "31 - 60 DAYS", "61 - 90 DAYS", "OVER 90 DAYS"];

/**
 * Everything owed, grouped by who it is owed to.
 *
 * ⚠️ A payee is matched on the NAME, upper-cased and trimmed, because the same
 * supplier is typed by the goods side and by the payments side months apart.
 * The Setup lists stop them drifting; this stops the two halves failing to meet
 * when one of them slipped through before the lists existed.
 */
export function payeeBalances(
  purchases: PurchaseDebt[],
  shipments: ShipmentDebt[],
  loosePayments: Payment[],
  today: Date = new Date(),
): PayeeBalance[] {
  const key = (v: string | null | undefined) => (v ?? "").trim().toUpperCase();
  const rows = new Map<string, PayeeBalance & { _name: string }>();

  const get = (name: string) => {
    const k = key(name);
    let r = rows.get(k);
    if (!r) {
      r = {
        _name: name.trim(), payee: name.trim(), billedTzs: null, paidTzs: null, owedTzs: null,
        uncosted: 0, payments: 0, worstAgeing: null, oldestOverdueDays: null,
      };
      rows.set(k, r);
    }
    return r;
  };

  for (const d of purchases) {
    const name = d.line.line.supplier;
    if (!name?.trim()) continue;
    const r = get(name);
    if (d.costTzs === null) r.uncosted += 1;
    else r.billedTzs = (r.billedTzs ?? 0) + d.costTzs;
    if (d.paidTzs !== null) r.paidTzs = (r.paidTzs ?? 0) + d.paidTzs;
    r.payments += d.payments;
    if (d.overdueDays !== null && (r.oldestOverdueDays === null || d.overdueDays > r.oldestOverdueDays)) {
      r.oldestOverdueDays = d.overdueDays;
    }
    if (d.ageing && (r.worstAgeing === null
      || BAND_ORDER.indexOf(d.ageing) > BAND_ORDER.indexOf(r.worstAgeing))) {
      r.worstAgeing = d.ageing;
    }
  }

  for (const d of shipments) {
    // ⚠️ Charged by the AGENT and the forwarder, not the goods supplier. Where
    // no agent is named the charges belong to nobody and are left out rather
    // than pinned on whoever happens to be nearby.
    const name = d.shipment.shipment.clearingAgent;
    if (!name?.trim()) continue;
    const r = get(name);
    if (d.chargesTzs === null) r.uncosted += 1;
    else r.billedTzs = (r.billedTzs ?? 0) + d.chargesTzs;
    if (d.paidTzs !== null) r.paidTzs = (r.paidTzs ?? 0) + d.paidTzs;
    r.payments += d.payments;
  }

  // A payment against nothing still names who got the money.
  for (const p of loosePayments) {
    if (!p.payee?.trim()) continue;
    const r = get(p.payee);
    const v = paymentTzs(p);
    if (v !== null) r.paidTzs = (r.paidTzs ?? 0) + v;
    r.payments += 1;
  }

  const out: PayeeBalance[] = [];
  for (const r of rows.values()) {
    out.push({
      payee: r._name,
      billedTzs: r.billedTzs,
      paidTzs: r.paidTzs,
      owedTzs: r.billedTzs === null ? null : r.billedTzs - (r.paidTzs ?? 0),
      uncosted: r.uncosted,
      payments: r.payments,
      worstAgeing: r.worstAgeing,
      oldestOverdueDays: r.oldestOverdueDays,
    });
  }
  // Biggest debt first.
  return out.sort((a, b) => (b.owedTzs ?? -Infinity) - (a.owedTzs ?? -Infinity));
}

export type PayableTotals = {
  payees: number;
  billed: number;
  paid: number;
  owed: number;
  /** Payees whose debt could not be worked out. */
  unknown: number;
  /** How much of what we have paid went out before the goods did. */
  advance: number;
  overdue90: number;
};

export function payableTotals(rows: PayeeBalance[], purchases: PurchaseDebt[]): PayableTotals {
  let billed = 0, paid = 0, owed = 0, unknown = 0, overdue90 = 0;
  for (const r of rows) {
    if (r.billedTzs === null) unknown += 1; else billed += r.billedTzs;
    if (r.paidTzs !== null) paid += r.paidTzs;
    if (r.owedTzs !== null && r.owedTzs > 0.005) owed += r.owedTzs;
    if (r.worstAgeing === "OVER 90 DAYS") overdue90 += 1;
  }
  let advance = 0;
  for (const d of purchases) if (d.advanceTzs !== null) advance += d.advanceTzs;
  return { payees: rows.length, billed, paid, owed, unknown, advance, overdue90 };
}

/** What to offer in the "what for" box. Free text — these only suggest. */
export const PAYMENT_KINDS = ["GOODS", "ADVANCE", "FREIGHT", "DUTY", "AGENCY FEES", "OTHER"];

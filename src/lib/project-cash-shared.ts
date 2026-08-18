// ─────────────────────────────────────────────────────────────────────────────
// PAYMENTS AND EXPENDITURES — the cash side (Phase 4). Client-safe half.
//
// Two different questions, and the workbook keeps them on two sheets because
// they genuinely are different:
//
//   PAYMENTS      money RELEASED — it has left head office
//   EXPENDITURES  money SPENT    — it has been accounted for, line by line
//
// ⚠️ THE GAP BETWEEN THEM IS THE POINT. On the real Patamela figures 94,431,950
// was released and only 54,754,050 accounted for: **39,677,900 of float sitting
// on site, unexplained.** Both numbers appear on the workbook's dashboard and
// nothing there names the difference — worse, SNAPSHOT B21 uses the RELEASED
// figure as "actual progressive cost", so the profit lines are flattered by the
// whole 39.7m. Here the two are always shown together with the gap called out.
// ─────────────────────────────────────────────────────────────────────────────

import { num } from "@/lib/projects-shared";

/** The three ledgers of the PAYMENTS sheet. */
export const PAYMENT_ROUTES = ["DIRECT", "SHAO", "HQ"] as const;
export type PaymentRoute = (typeof PAYMENT_ROUTES)[number];

export const PAYMENT_ROUTE_LABEL: Record<PaymentRoute, string> = {
  DIRECT: "Direct to supplier",
  SHAO: "Cash to Shao",
  HQ: "Paid by head office",
};

/** Who holds site float — EXPENDITURES columns I and J. */
export const PAYERS = ["SHAO", "MAURICE"] as const;
export type Payer = (typeof PAYERS)[number];

export type Payment = {
  id: number;
  projectId: number;
  route: string;
  referenceNo: string | null;
  batchNo: string | null;
  supplier: string | null;
  paidDate: string | null;
  amountPaid: string;
  /** The invoice in full, when it was typed. Null = work it out. */
  totalPayable: string | null;
  notes: string | null;
};

export type Expenditure = {
  id: number;
  projectId: number;
  spentDate: string | null;
  itemCode: string | null;
  description: string | null;
  payer: string;
  amount: string;
  source: string | null;
  mobileNo: string | null;
  batchNo: string | null;
  notes: string | null;
};

/* ──────────────────────────────────────────────────────────────── the float ─ */

export type FloatRow = {
  expenditure: Expenditure;
  /** Balance remaining for THIS payer after this row. */
  payerBalance: number;
  /** Combined balance across both payers after this row. */
  combinedBalance: number;
};

export type FloatState = {
  /** Money released to each payer. */
  releasedBy: Record<string, number>;
  /** Money accounted for by each payer. */
  spentBy: Record<string, number>;
  /** What each payer still holds. */
  heldBy: Record<string, number>;
  totalReleased: number;
  totalSpent: number;
  /** Released minus spent — cash on site not yet accounted for. */
  unaccounted: number;
  rows: FloatRow[];
  /** A payer who has spent more than they were given. */
  overdrawn: string[];
};

/**
 * The running chequebook — EXPENDITURES columns N, O and P.
 *
 * The workbook seeds row 6 from the PAYMENTS totals and then every row holds a
 * formula subtracting from the row above. That chain is fragile: one bad row
 * silently corrupts every row beneath it, and inserting a row in the middle
 * breaks the sequence. Here the balances are walked fresh each time from the
 * expenditures in date order, so a corrected entry simply re-computes.
 *
 * `openingBy` is what each payer was given, taken from the PAYMENTS ledger. In
 * the workbook that is `N6 = PAYMENTS!O3` (Shao) and
 * `O6 = PAYMENTS!F3 + PAYMENTS!X3` (everything else).
 */
export function walkFloat(
  expenditures: Expenditure[],
  openingBy: Record<string, number>,
): FloatState {
  const spentBy: Record<string, number> = {};
  const running: Record<string, number> = { ...openingBy };
  let combined = Object.values(openingBy).reduce((s, v) => s + v, 0);

  // Date order, with undated rows last — the balance must follow the money, and
  // sorting by id alone would put a back-dated correction in the wrong place.
  const ordered = [...expenditures].sort((a, b) => {
    const ad = a.spentDate ?? "9999-12-31";
    const bd = b.spentDate ?? "9999-12-31";
    return ad === bd ? a.id - b.id : ad < bd ? -1 : 1;
  });

  const rows: FloatRow[] = ordered.map((e) => {
    const amt = num(e.amount) ?? 0;
    const payer = e.payer || "SHAO";
    spentBy[payer] = (spentBy[payer] ?? 0) + amt;
    running[payer] = (running[payer] ?? 0) - amt;
    combined -= amt;
    return { expenditure: e, payerBalance: running[payer], combinedBalance: combined };
  });

  const totalReleased = Object.values(openingBy).reduce((s, v) => s + v, 0);
  const totalSpent = Object.values(spentBy).reduce((s, v) => s + v, 0);

  return {
    releasedBy: openingBy,
    spentBy,
    heldBy: running,
    totalReleased,
    totalSpent,
    unaccounted: totalReleased - totalSpent,
    rows,
    overdrawn: Object.entries(running).filter(([, v]) => v < 0).map(([k]) => k),
  };
}

/**
 * What each payer was released, from the payments ledger.
 *
 * The workbook hard-wires this: Shao's float is the SHAO ledger total, and
 * everything else (direct + HQ) is treated as Maurice's. That mapping is kept,
 * because it is how the site actually operates, but it lives in ONE named place
 * instead of inside two cell formulas.
 */
export function openingFloat(payments: Payment[]): Record<string, number> {
  let shao = 0, other = 0;
  for (const p of payments) {
    const amt = num(p.amountPaid) ?? 0;
    if (p.route === "SHAO") shao += amt;
    else other += amt;
  }
  return { SHAO: shao, MAURICE: other };
}

/* ─────────────────────────────────────────────────────── paying a request ── */

/**
 * What a payment reference still owes — the workbook's "TOTAL PAYABLE".
 *
 * `=SUMIF(REQUISITIONS!M:M, B5, REQUISITIONS!Q:Q)` for a direct payment, and a
 * two-condition `SUMIFS` on batch + route for the other two ledgers. Only
 * APPROVED money is payable; a request nobody has decided on owes nothing.
 */
export function payableFor(
  requisitions: Array<{ referenceNo: string | null; batchNo: string | null; route: string | null; amountApproved: string | null; status: string }>,
  key: { route: PaymentRoute; referenceNo?: string | null; batchNo?: string | null },
): number {
  let total = 0;
  for (const r of requisitions) {
    if (r.status === "Rejected" || r.status === "Cancelled") continue;
    const approved = num(r.amountApproved);
    if (approved === null) continue;
    if (key.route === "DIRECT") {
      if (key.referenceNo && r.referenceNo === key.referenceNo) total += approved;
    } else if (key.batchNo && r.batchNo === key.batchNo && r.route === key.route) {
      total += approved;
    }
  }
  return total;
}

/** PAID | PARTIALLY PAID | NOT PAID — the workbook's IFS chain, as a function. */
export function paymentStatus(payable: number, paid: number): "PAID" | "PARTIALLY PAID" | "NOT PAID" | "" {
  if (paid === 0 && payable === 0) return "";
  const balance = payable - paid;
  if (balance <= 0.005) return "PAID";
  if (paid > 0) return "PARTIALLY PAID";
  return "NOT PAID";
}

/* ───────────────────────────────────────────────── spend against a budget ── */

/** Money actually spent per budget item — the SNAPSHOT gauge's "ACTUAL". */
export function spentByItem(expenditures: Expenditure[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of expenditures) {
    if (!e.itemCode) continue;
    out.set(e.itemCode, (out.get(e.itemCode) ?? 0) + (num(e.amount) ?? 0));
  }
  return out;
}

/** Spend that belongs to no budget line — fuel, food, taxis. */
export function unallocatedSpend(expenditures: Expenditure[]): number {
  return expenditures
    .filter((e) => !e.itemCode)
    .reduce((s, e) => s + (num(e.amount) ?? 0), 0);
}

/* ─────────────────────────────────────────────── what is still owed ──────── */

export type ApprovedRequisition = {
  referenceNo: string | null;
  batchNo: string | null;
  route: string | null;
  amountApproved: string | null;
  status: string;
};

export type PaymentView = {
  payment: Payment;
  /** The invoice in full: typed if typed, else the approved money behind it. */
  payable: number | null;
  /** Where that figure came from, so the screen can say. */
  payableFrom: "typed" | "approved" | null;
  /** payable minus paid. Positive = still owed. Null when payable is unknown. */
  balance: number | null;
  status: "PAID" | "PARTIALLY PAID" | "NOT PAID" | "";
};

export function paymentViews(
  payments: Payment[],
  requisitions: ApprovedRequisition[],
): PaymentView[] {
  return payments.map((p) => {
    const paid = num(p.amountPaid) ?? 0;
    const typed = num(p.totalPayable);
    const derived = payableFor(requisitions, {
      route: (p.route as PaymentRoute) ?? "DIRECT",
      referenceNo: p.referenceNo,
      batchNo: p.batchNo,
    });
    const payable = typed ?? (derived > 0 ? derived : null);
    return {
      payment: p,
      payable,
      payableFrom: typed !== null ? "typed" : payable !== null ? "approved" : null,
      balance: payable === null ? null : payable - paid,
      status: payable === null ? "" : paymentStatus(payable, paid),
    };
  });
}

/**
 * What the job still owes, and to whom.
 *
 * ⚠️ Only rows where the invoice total is KNOWN are counted. A payment with
 * nothing to measure against is listed separately rather than treated as fully
 * settled — silently assuming a blank means "paid in full" is exactly the kind
 * of flattering guess the workbook makes elsewhere.
 */
export type OwedSummary = {
  owed: number;
  overpaid: number;
  settled: number;
  unknown: number;
  bySupplier: Array<{ supplier: string; owed: number }>;
};

export function owedSummary(views: PaymentView[]): OwedSummary {
  let owed = 0, overpaid = 0, settled = 0, unknown = 0;
  const by = new Map<string, number>();
  for (const v of views) {
    if (v.balance === null) { unknown += 1; continue; }
    if (v.balance > 0.005) {
      owed += v.balance;
      const who = v.payment.supplier ?? v.payment.referenceNo ?? v.payment.batchNo ?? "Unnamed";
      by.set(who, (by.get(who) ?? 0) + v.balance);
    } else if (v.balance < -0.005) {
      overpaid += -v.balance;
    } else {
      settled += 1;
    }
  }
  return {
    owed, overpaid, settled, unknown,
    bySupplier: [...by.entries()]
      .map(([supplier, amount]) => ({ supplier, owed: amount }))
      .sort((a, b) => b.owed - a.owed),
  };
}

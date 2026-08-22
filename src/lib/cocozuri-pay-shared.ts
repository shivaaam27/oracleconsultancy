/**
 * CocoZuri, manufacturing Stage 8 — money OUT. The CLIENT-SAFE half.
 *
 * ⚠️ THIS FILE IS CLIENT-SAFE; `cocozuri-pay.ts` IS SERVER-ONLY.
 *
 * From the notes, page 1: *"Creditors — paying them"*. The exact twin of the
 * receipts that already exist for *"Debtors — we get money"*.
 *
 * ⚠️ NO `paid` OR `balance` COLUMN. What is still owed on a purchase is its
 * payable less what has been paid against it, worked out on read — the same rule
 * as every other total in this module.
 */

import { purchaseTotals, type CzPurchase } from "@/lib/cocozuri-buy-shared";

/* ------------------------------------------------------------------ *
 * The record
 * ------------------------------------------------------------------ */

export type CzPayment = {
  id: number;
  purchaseId: number;
  /** Resolved for display — a payment means nothing without what it settles. */
  purchaseRef: string | null;
  /** Who was actually paid: the supplier, or the person who bought it. */
  paidTo: string | null;
  paidOn: string;
  amount: number;
  currency: string;
  method: string | null;
  reference: string | null;
  /** ⚠️ The mirror of the "received in DSC" fact. Recorded, never interpreted. */
  paidFromCompanyId: number | null;
  paidFromName: string | null;
  notes: string | null;
};

/* ------------------------------------------------------------------ *
 * Who is owed, and how much
 * ------------------------------------------------------------------ */

/**
 * ⚠️ ONLY TWO OF THE FOUR WAYS OF PAYING LEAVE ANYTHING OWED.
 *
 * A purchase paid from the bank or the cash box was settled the moment it was
 * bought — Stage 2 credited bank or cash directly, so there is no liability and
 * nothing to pay later. Offering to "pay" one would credit the bank twice.
 *
 * `credit` leaves the SUPPLIER owed; `own_money` leaves a PERSON owed, which is
 * the case the owner named specifically.
 */
export function leavesSomethingOwed(paidFrom: CzPurchase["paidFrom"]): boolean {
  return paidFrom === "credit" || paidFrom === "own_money";
}

/** Who the money is owed to. ⚠️ Off the PURCHASE, never off the form — the same
 *  rule as a receipt taking its customer off the invoice. */
export function owedTo(p: Pick<CzPurchase, "paidFrom" | "paidBy" | "vendorName" | "supplierName">): string | null {
  return p.paidFrom === "own_money"
    ? p.paidBy?.trim() || null
    : p.vendorName?.trim() || p.supplierName?.trim() || null;
}

export type CzOwing = {
  purchase: CzPurchase;
  /** What the whole purchase came to. */
  payable: number;
  paid: number;
  outstanding: number;
  paidTo: string | null;
  /** ⚠️ Days since it was bought. There are no payment terms on a purchase —
   *  nobody has said there are — so this claims age, never lateness. */
  daysOld: number;
};

/**
 * What is still owed, worst first.
 *
 * ⚠️ ONLY AN APPROVED PURCHASE IS OWED. A draft is somebody thinking about it
 * and a cancelled one has been taken back off the shelf — the same rule as
 * "only an issued invoice is owed" on the money-in side.
 */
export function owingRows(
  purchases: CzPurchase[],
  payments: CzPayment[],
  today: string,
): CzOwing[] {
  const paidByPurchase = new Map<number, number>();
  for (const p of payments) {
    paidByPurchase.set(p.purchaseId, round2((paidByPurchase.get(p.purchaseId) ?? 0) + num(p.amount)));
  }
  return purchases
    .filter((p) => p.status === "approved" && leavesSomethingOwed(p.paidFrom))
    .map((purchase) => {
      const t = purchaseTotals(purchase.lines, purchase.vatRate, purchase.taxInclusive, purchase.freightAmount);
      const paid = paidByPurchase.get(purchase.id) ?? 0;
      return {
        purchase,
        payable: t.payable,
        paid,
        outstanding: round2(t.payable - paid),
        paidTo: owedTo(purchase),
        daysOld: daysBetween(purchase.purchasedOn, today),
      };
    })
    .filter((r) => Math.abs(r.outstanding) > 0.005)
    .sort((a, b) => b.daysOld - a.daysOld || b.outstanding - a.outstanding);
}

/** Everything still owed, in one figure. */
export function totalOwing(rows: CzOwing[]): number {
  return round2(rows.reduce((t, r) => t + r.outstanding, 0));
}

/* ------------------------------------------------------------------ *
 * What stops a payment
 * ------------------------------------------------------------------ */

export function paymentBlockers(input: {
  lines: { purchaseId: number; amount: number; payable: number; alreadyPaid: number }[];
  paidOn: string;
}): string[] {
  const out: string[] = [];
  const real = input.lines.filter((l) => num(l.amount) !== 0);
  if (real.length === 0) out.push("Say how much is being paid, and against what.");
  if (!/^\d{4}-\d{2}-\d{2}/.test(input.paidOn)) out.push("A payment needs a date.");
  if (real.some((l) => num(l.amount) < 0)) {
    // ⚠️ Money coming BACK from a supplier is a different event, not a negative
    // payment. Allowing both makes a creditor's account impossible to read.
    out.push("A payment cannot be negative. A refund from a supplier is its own thing.");
  }
  return out;
}

/**
 * ⚠️ AN OVERPAYMENT IS RECORDED AS IT STANDS, NOT REFUSED — exactly as on the
 * money-in side. People really do overpay, and a system that will not write it
 * down is one that gets a second set of books kept beside it. The screens show
 * it as a negative amount outstanding.
 */
export function overpaid(payable: number, paid: number): number {
  const over = round2(paid - payable);
  return over > 0 ? over : 0;
}

/* ------------------------------------------------------------------ *
 * Into the books
 * ------------------------------------------------------------------ */

export type CzPayVoucherLine = {
  accountId: number;
  debit: number;
  credit: number;
  partyType?: string | null;
  party?: string | null;
  remarks?: string | null;
};

/**
 * **Dr creditors · Cr bank or cash.** The mirror image of a receipt.
 *
 * ⚠️ THE PARTY IS THE ONE STAGE 2 CREDITED. A purchase bought with somebody's
 * own money was booked to creditors with the PERSON as the party; paying them
 * back has to find the same party, or the creditors ledger will show the person
 * still owed and the supplier in credit.
 */
export function paymentVoucherLines(
  payment: Pick<CzPayment, "amount" | "method" | "reference" | "purchaseRef">,
  accounts: { payable: number; credit: number },
  party: { name: string | null; kind: "Supplier" | "Person" },
): CzPayVoucherLine[] {
  const amount = round2(num(payment.amount));
  const note = [payment.method, payment.reference, payment.purchaseRef ? `against ${payment.purchaseRef}` : null]
    .filter(Boolean).join(" · ");
  return [
    {
      accountId: accounts.payable,
      debit: amount,
      credit: 0,
      partyType: party.kind,
      party: party.name,
      remarks: note || null,
    },
    { accountId: accounts.credit, debit: 0, credit: amount, remarks: note || null },
  ];
}

export function payLinesBalance(lines: CzPayVoucherLine[]): boolean {
  const d = round2(lines.reduce((t, l) => t + l.debit, 0));
  const c = round2(lines.reduce((t, l) => t + l.credit, 0));
  return d === c;
}

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round2 = (n: number) => Math.round(n * 100) / 100;

function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from.slice(0, 10)}T00:00:00Z`);
  const z = Date.parse(`${to.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(z)) return 0;
  return Math.max(0, Math.round((z - a) / 86_400_000));
}

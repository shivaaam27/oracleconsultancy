// ─────────────────────────────────────────────────────────────────────────────
// DELIVERY & BILLING — the client-safe half: types and pure arithmetic (Stage 5).
//
// ⚠️ No `sb` import. The server half is `ops-invoices.ts`.
//
// This replaces the Deliveries sheet and the workbook's PO BALANCE column, and
// three things about those are worth stating before any of the code:
//
//   1. **The Deliveries sheet has no delivered quantity.** Its "Delivered"
//      column holds two distinct values across 560 rows: "DELIVERED" and
//      "delivered". So a part-delivery cannot be recorded there at all. Here
//      the quantity is optional — record it when it differs, ignore it when it
//      does not — and "6 of 10 out" is worked out rather than typed.
//
//   2. **PO BALANCE is `W - AJ`**, the order's value less the invoice's. That
//      is right, and it is kept. What is NOT kept is doing the subtraction when
//      one side is unknown: an order with unpriced lines has an unknown
//      balance, not a balance equal to whatever happens to be priced.
//
//   3. **Delivered and billed are two dates.** POS STATUS has one column,
//      "INV/DEL DATE", for both — so goods delivered in September and billed in
//      November can only be recorded as one of the two, and the sheet cannot
//      answer "what has gone out that we have not yet billed for", which is the
//      question the money depends on.
// ─────────────────────────────────────────────────────────────────────────────

import { num, day, toTzs, type LineView } from "@/lib/ops-orders-shared";

// ⚠️ `DespatchLite` lives in `ops-orders-shared.ts`, which this file imports —
// declaring it there keeps the dependency one-way. Re-exported so a caller
// needs only one import.
export type { DespatchLite } from "@/lib/ops-orders-shared";

export type Invoice = {
  id: number;
  companyId: number;
  /** What travelled with the goods. */
  deliveryNoteNo: string | null;
  deliveredDate: string | null;
  invoiceNo: string | null;
  invoiceDate: string | null;
  /** Optional. Blank = whatever the lines on it come to. */
  invoiceValue: string | null;
  invoiceCurrency: string | null;
  exRate: string | null;
  client: string | null;
  status: string | null;
  pendingWith: string | null;
  notes: string | null;
  /* ── VAT and the fiscal receipt (Phase 3) ────────────────────────────────
   * ⚠️ `taxInclusive` is a THREE-state: true, false, or null for "nobody has
   * said". Null is why the same 1,180,000 cannot be split, and the VAT return
   * reports such an invoice as unknown rather than guessing. */
  taxRateId: number | null;
  /** ⚠️ Frozen when chosen, like `exRate` — see the schema comment. */
  taxPercent: string | null;
  taxInclusive: boolean | null;
  efdNo: string | null;
  efdDate: string | null;
  archived: boolean;
};

const DAY_MS = 86_400_000;

export type InvoiceView = {
  invoice: Invoice;
  /** What the order lines pointing at it are worth, in shillings. */
  linesValueTzs: number | null;
  lineCount: number;
  /** Lines on it that could not be priced — reported, never quietly dropped. */
  unpricedLines: number;
  /** What was actually billed: the typed figure if there is one, else the
   *  lines. Null when neither is known. */
  billedTzs: number | null;
  /** Where a typed figure was used rather than the lines. */
  billedIsTyped: boolean;
  /** typed − lines, when BOTH are known and they differ by more than a cent.
   *  ⚠️ Shown, never absorbed: it is either a discount somebody agreed or a
   *  typing mistake, and both are worth a second look. */
  difference: number | null;
  delivered: boolean;
  billed: boolean;
  /** Delivery → invoice, in days. */
  daysToBill: number | null;
  /** Days since it went out with nothing billed. Null once billed. */
  unbilledDays: number | null;
  /** What is holding it up, in one phrase, or null when it is finished. */
  waitingOn: string | null;
};

export function invoiceView(
  inv: Invoice,
  lines: LineView[],
  today: Date = new Date(),
): InvoiceView {
  let linesValueTzs: number | null = null;
  let unpricedLines = 0;
  for (const v of lines) {
    if (v.saleTotalTzs === null) unpricedLines += 1;
    else linesValueTzs = (linesValueTzs ?? 0) + v.saleTotalTzs;
  }

  const typed = toTzs(num(inv.invoiceValue), inv.invoiceCurrency, num(inv.exRate));
  const billedIsTyped = typed !== null;
  const billedTzs = typed ?? linesValueTzs;
  const difference =
    typed === null || linesValueTzs === null || Math.abs(typed - linesValueTzs) < 0.005
      ? null
      : typed - linesValueTzs;

  const now = day(today)!;
  const out = day(inv.deliveredDate);
  const billedOn = day(inv.invoiceDate);
  const delivered = out !== null;
  const billed = Boolean(inv.invoiceNo?.trim() || inv.invoiceDate);

  const daysToBill =
    out === null || billedOn === null ? null : Math.round((billedOn.getTime() - out.getTime()) / DAY_MS);
  // The clock stops once it is billed — otherwise last year's delivery sits at
  // "300 days unbilled" and buries the ones somebody could still invoice.
  const unbilledDays =
    out === null || billed ? null : Math.round((now.getTime() - out.getTime()) / DAY_MS);

  // The order the work really happens in, so the phrase names the FIRST thing
  // missing rather than all of them.
  let waitingOn: string | null = null;
  if (!delivered) waitingOn = "not gone out yet";
  else if (!billed) waitingOn = "delivered, not billed";
  else if (lines.length === 0) waitingOn = "no order lines on it yet";

  return {
    invoice: inv, linesValueTzs, lineCount: lines.length, unpricedLines,
    billedTzs, billedIsTyped, difference,
    delivered, billed, daysToBill, unbilledDays, waitingOn,
  };
}

export type InvoiceTotals = {
  documents: number;
  delivered: number;
  billed: number;
  /** Gone out and not yet billed — the money sitting in the yard. */
  awaitingBilling: number;
  billedValue: number;
  /** Value of what has gone out but not been billed. */
  awaitingValue: number;
  /** Documents whose value could not be worked out at all. */
  unvalued: number;
  /** Documents where the typed figure and the lines disagree. */
  disagreeing: number;
};

export function invoiceTotals(views: InvoiceView[]): InvoiceTotals {
  let delivered = 0, billed = 0, awaitingBilling = 0;
  let billedValue = 0, awaitingValue = 0, unvalued = 0, disagreeing = 0;
  for (const v of views) {
    if (v.delivered) delivered += 1;
    if (v.billed) {
      billed += 1;
      if (v.billedTzs !== null) billedValue += v.billedTzs;
    } else if (v.delivered) {
      awaitingBilling += 1;
      if (v.billedTzs !== null) awaitingValue += v.billedTzs;
    }
    if (v.billedTzs === null) unvalued += 1;
    if (v.difference !== null) disagreeing += 1;
  }
  return {
    documents: views.length, delivered, billed, awaitingBilling,
    billedValue, awaitingValue, unvalued, disagreeing,
  };
}

/* ───────────────────────────────────────────────────── the PO balance ────── */

export type PoBalance = {
  poNo: string;
  client: string | null;
  lines: number;
  /** What the PO is worth. Null when a line on it has no price. */
  orderedTzs: number | null;
  /** Lines that have gone out — fully or in part. */
  deliveredLines: number;
  /** Lines whose delivered quantity is short of what was ordered. */
  partLines: number;
  billedTzs: number | null;
  /** ordered − billed. Positive = still to bill. ⚠️ Null when either side is
   *  unknown; a balance is a subtraction, and you cannot subtract from a total
   *  nobody has worked out. */
  balanceTzs: number | null;
  /** Lines on this PO with no price, which is WHY the balance may be null. */
  unpriced: number;
  /** Every line delivered and every line billed. */
  complete: boolean;
};

/**
 * What each PO still owes us, worked out from the lines and their documents.
 *
 * ⚠️ A PO nobody has billed has a balance equal to the WHOLE order — not zero.
 * That is the number the workbook's `W - AJ` gives when AJ is empty, and it is
 * the one that matters: it is the money not yet asked for.
 */
export function poBalances(
  lines: LineView[],
  docOf: (line: LineView) => InvoiceView | null,
): PoBalance[] {
  const groups = new Map<string, LineView[]>();
  for (const v of lines) {
    const k = v.line.poNo;
    const bucket = groups.get(k);
    if (bucket) bucket.push(v); else groups.set(k, [v]);
  }

  const out: PoBalance[] = [];
  for (const [poNo, rows] of groups) {
    let orderedTzs: number | null = 0;
    let unpriced = 0, deliveredLines = 0, partLines = 0, billedLines = 0;
    let billedTzs: number | null = null;
    const countedDocs = new Set<number>();
    let client: string | null = null;

    for (const v of rows) {
      client = client ?? v.line.client;
      if (v.saleTotalTzs === null) { unpriced += 1; orderedTzs = null; }
      else if (orderedTzs !== null) orderedTzs += v.saleTotalTzs;

      const doc = docOf(v);
      if (doc?.delivered) deliveredLines += 1;
      if (v.partlyDelivered) partLines += 1;
      if (doc?.billed) {
        billedLines += 1;
        // ⚠️ Once per DOCUMENT, not once per line. An invoice covering four
        // lines of this PO must be counted once or the PO reads as billed four
        // times over — which is precisely what copying the value down every
        // line of a group does in the sheet.
        if (!countedDocs.has(doc.invoice.id)) {
          countedDocs.add(doc.invoice.id);
          if (doc.billedTzs !== null) billedTzs = (billedTzs ?? 0) + doc.billedTzs;
        }
      }
    }

    out.push({
      poNo, client, lines: rows.length,
      orderedTzs, deliveredLines, partLines,
      billedTzs, unpriced,
      balanceTzs: orderedTzs === null ? null : orderedTzs - (billedTzs ?? 0),
      complete: deliveredLines === rows.length && billedLines === rows.length,
    });
  }

  // Worst first — the biggest unbilled balance is the one to chase.
  return out.sort((a, b) => (b.balanceTzs ?? -1) - (a.balanceTzs ?? -1));
}

export type BalanceTotals = {
  pos: number;
  ordered: number;
  billed: number;
  outstanding: number;
  /** POs whose balance could not be worked out — reported, never hidden. */
  unknown: number;
  complete: number;
};

export function balanceTotals(rows: PoBalance[]): BalanceTotals {
  let ordered = 0, billed = 0, outstanding = 0, unknown = 0, complete = 0;
  for (const r of rows) {
    if (r.orderedTzs === null) unknown += 1;
    else ordered += r.orderedTzs;
    if (r.billedTzs !== null) billed += r.billedTzs;
    if (r.balanceTzs !== null) outstanding += r.balanceTzs;
    if (r.complete) complete += 1;
  }
  return { pos: rows.length, ordered, billed, outstanding, unknown, complete };
}

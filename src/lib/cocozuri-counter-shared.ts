/**
 * CocoZuri, manufacturing Stage 5b — the counter. The CLIENT-SAFE half.
 *
 * ⚠️ THIS FILE IS CLIENT-SAFE; `cocozuri-counter.ts` IS SERVER-ONLY.
 *
 * ⚠️ THE OWNER SETTLED WHAT THIS IS (22 Aug 2026): *"cash taken and kept in
 * drawer and informed via WhatsApp and there is some data sheets, some cash
 * collected via online modes... **for now we won't integrate a payment system
 * here, just reports get digital**."*
 *
 * So this is **a record of a sale, not a till**. Nothing takes payment, nothing
 * talks to a card machine or to mobile money. What it replaces is the WhatsApp
 * message and the paper sheet — so the takings, and what left the shelf, become
 * a report.
 *
 * ⚠️ AND THE KITCHEN IS THE MAIN COUNTER. Both sell; the kitchen takes the bulk
 * and custom orders, the shop takes the rare walk-in.
 */

import { vatOf } from "@/lib/cocozuri-shared";

/* ------------------------------------------------------------------ *
 * The record
 * ------------------------------------------------------------------ */

/** ⚠️ How the money came in — written down, never integrated. */
export type CzPaidBy = "cash" | "online" | "other";

export const CZ_PAID_BY: { key: CzPaidBy; label: string; hint: string }[] = [
  { key: "cash", label: "Cash", hint: "Notes in the drawer." },
  { key: "online", label: "Online", hint: "Mobile money or a transfer. Put the reference in if there is one." },
  { key: "other", label: "Something else", hint: "Say what in the note." },
];

export type CzCounterLine = {
  id: number;
  lineNo: number;
  itemId: number;
  batchId: number | null;
  batchNo: string | null;
  /** Frozen the day it was sold. */
  description: string;
  qty: number;
  unitPrice: number;
};

export type CzCounterSale = {
  id: number;
  reference: string;
  locationId: number;
  locationName: string | null;
  onDate: string;
  customerId: number | null;
  customerName: string | null;
  paidBy: CzPaidBy;
  paymentRef: string | null;
  vatRate: number;
  soldBy: string | null;
  recordedBy: string | null;
  status: "recorded" | "cancelled";
  notes: string | null;
  lines: CzCounterLine[];
};

/* ------------------------------------------------------------------ *
 * The number
 * ------------------------------------------------------------------ */

/** `CS-2608-01` — allocated, like every other number in this module. */
export function nextCounterRef(existing: string[], onDate: string): string {
  const prefix = `CS-${onDate.slice(2, 4)}${onDate.slice(5, 7)}-`;
  let max = 0;
  for (const n of existing) {
    if (!n.startsWith(prefix)) continue;
    const tail = Number(n.slice(prefix.length));
    if (Number.isFinite(tail) && tail > max) max = tail;
  }
  return `${prefix}${String(max + 1).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ *
 * What it came to
 * ------------------------------------------------------------------ */

export type CzCounterTotals = { gross: number; net: number; vat: number; pieces: number };

/**
 * ⚠️ A COUNTER PRICE IS WHAT THE CUSTOMER HANDED OVER, so it INCLUDES the VAT —
 * the same as every CocoZuri invoice. `vatOf` is the VAT *contained* in a gross
 * amount, never a percentage of it: the spreadsheets got that backwards and
 * overstated VAT by TZS 532,296 across 129 invoices.
 */
export function counterTotals(
  lines: { qty: number; unitPrice: number }[],
  vatRate: number,
): CzCounterTotals {
  const gross = round2(lines.reduce((t, l) => t + num(l.qty) * num(l.unitPrice), 0));
  const vat = round2(vatOf(gross, num(vatRate)));
  return {
    gross,
    net: round2(gross - vat),
    vat,
    pieces: round3(lines.reduce((t, l) => t + num(l.qty), 0)),
  };
}

/* ------------------------------------------------------------------ *
 * The takings — the report that replaces the WhatsApp message
 * ------------------------------------------------------------------ */

export type CzTakings = {
  onDate: string;
  locationId: number;
  locationName: string | null;
  cash: number;
  online: number;
  other: number;
  total: number;
  sales: number;
  pieces: number;
};

/**
 * A day's takings, per counter, split by how the money came in.
 *
 * ⚠️ SPLIT BECAUSE THAT IS THE QUESTION SOMEBODY ACTUALLY ASKS at the end of the
 * day: how much should be in the drawer, and how much came in by phone. One
 * total answers neither.
 *
 * ⚠️ AND CANCELLED SALES ARE OUT. A sale recorded and then found not to have
 * happened is not takings, and leaving it in would have somebody hunting the
 * drawer for money that was never there.
 */
export function takings(sales: CzCounterSale[]): CzTakings[] {
  const buckets = new Map<string, CzTakings>();
  for (const s of sales) {
    if (s.status !== "recorded") continue;
    const key = `${s.onDate}#${s.locationId}`;
    let row = buckets.get(key);
    if (!row) {
      row = {
        onDate: s.onDate, locationId: s.locationId, locationName: s.locationName,
        cash: 0, online: 0, other: 0, total: 0, sales: 0, pieces: 0,
      };
      buckets.set(key, row);
    }
    const t = counterTotals(s.lines, s.vatRate);
    row[s.paidBy] = round2(row[s.paidBy] + t.gross);
    row.total = round2(row.total + t.gross);
    row.pieces = round3(row.pieces + t.pieces);
    row.sales += 1;
  }
  // Newest first — a takings sheet is read from today backwards.
  return [...buckets.values()].sort((a, b) => b.onDate.localeCompare(a.onDate) || a.locationId - b.locationId);
}

/* ------------------------------------------------------------------ *
 * What stops one being recorded
 * ------------------------------------------------------------------ */

export function counterBlockers(input: {
  locationId: number | null;
  onDate: string;
  lines: { itemId: number | null; qty: number; unitPrice: unknown }[];
  /** Today, so a date in the future can be caught. */
  today?: string;
}): string[] {
  const out: string[] = [];
  if (!input.locationId) out.push("Say which counter it was sold from.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.onDate)) out.push("A sale needs the date it happened.");
  /* ⚠️ A SALE CANNOT BE IN THE FUTURE, and refusing it is not fussiness. The
     whole premise of this screen is that the money has already changed hands;
     a mistyped month puts the sale outside today's takings AND leaves the shelf
     unchanged until that date arrives — which looks like the software losing
     things. Caught here rather than found a fortnight later. */
  else if (input.today && input.onDate > input.today) {
    out.push("That date has not happened yet. Write down the day it was actually sold.");
  }
  const real = input.lines.filter((l) => num(l.qty) > 0);
  /* ⚠️ THE NEGATIVE CHECK COMES FIRST, and the order is the point: a line typed
     as −1 is not "nothing listed", and saying so would send somebody looking for
     a line they can see in front of them. Something coming BACK is a return —
     its own document, with its own rules — and a negative sale would move the
     stock the right way while putting the money in the wrong place. */
  if (input.lines.some((l) => num(l.qty) < 0)) {
    out.push("A quantity cannot be negative. Something coming back is a return.");
  } else if (real.length === 0) {
    out.push("Nothing has been listed as sold.");
  }
  if (real.some((l) => !l.itemId)) out.push("Something on the list is not a thing on that counter's shelf.");
  // ⚠️ A price of NIL is allowed — a sample, a taster, a replacement — but a
  // MISSING one is not. Same rule as an invoice line: never invent a figure.
  if (real.some((l) => !Number.isFinite(Number(l.unitPrice)))) {
    out.push("Every line needs a price. Nil is fine; blank is not.");
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Into the books
 * ------------------------------------------------------------------ */

export type CzCounterVoucherLine = {
  accountId: number;
  debit: number;
  credit: number;
  remarks?: string | null;
};

/**
 * **Dr cash or bank · Cr sales · Cr VAT.**
 *
 * ⚠️ NO DEBTOR. A counter sale is paid there and then — that is the whole
 * difference from an invoice, and putting it through trade debtors would leave a
 * balance nobody is ever going to collect.
 *
 * ⚠️ AND VAT IS NEVER INCOME. The sales line is the NET, and `net = gross − vat`
 * so the voucher balances to the cent.
 */
export function counterVoucherLines(
  sale: Pick<CzCounterSale, "lines" | "vatRate" | "paidBy" | "reference">,
  accounts: { cash: number; bank: number; sales: number; vatOutput: number },
): CzCounterVoucherLine[] {
  const t = counterTotals(sale.lines, sale.vatRate);
  // ⚠️ Cash in the drawer is the cash account; anything by phone or transfer
  // reached the bank. "Something else" is treated as cash — it is what the
  // drawer is for — and the note says what it really was.
  const debitAccount = sale.paidBy === "online" ? accounts.bank : accounts.cash;

  const out: CzCounterVoucherLine[] = [
    { accountId: debitAccount, debit: t.gross, credit: 0, remarks: sale.reference },
    { accountId: accounts.sales, debit: 0, credit: t.net, remarks: sale.reference },
  ];
  if (t.vat !== 0) {
    out.push({ accountId: accounts.vatOutput, debit: 0, credit: t.vat, remarks: `VAT at ${sale.vatRate}% · ${sale.reference}` });
  }
  return out;
}

export function counterLinesBalance(lines: CzCounterVoucherLine[]): boolean {
  const d = round2(lines.reduce((t, l) => t + l.debit, 0));
  const c = round2(lines.reduce((t, l) => t + l.credit, 0));
  return d === c;
}

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

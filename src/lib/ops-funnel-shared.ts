// ─────────────────────────────────────────────────────────────────────────────
// THE FUNNEL — the client-safe half: types and pure arithmetic (Stage 4).
//
// ⚠️ No `sb` import. The server half is `ops-funnel.ts`.
//
// This replaces the workbook's INFO - RFQ sheet and the MONTHLY ANALYSIS built
// on top of it. The sheet's conversion figures are the reason this file exists,
// so the fault is worth stating exactly:
//
//   G6 = F6/C6   POs raised in June ÷ quotes sent in June
//   K24 = H24/E24   PO value in Aug-26 ÷ quotation value in Aug-26  →  132%
//
// An order almost never comes from the same month's quote, so those two numbers
// are about different enquiries. Aug-26 reads 132% not because more was won
// than quoted but because August's orders came from June and July's quotes.
//
// The honest version is here: **an enquiry is measured against its own cohort**.
// A quote sent in June and won in August counts in JUNE — the month the client
// asked — because that is the enquiry the conversion is about. No ratio in this
// file ever divides one month by another, which is why none can exceed 100%.
//
// ⚠️ And a cohort that still has live enquiries in it is NOT FINISHED. Its
// conversion can only rise, so it is reported as a floor ("at least 21%") until
// every enquiry in it has either become an order or been closed. The workbook
// prints last week's month at 4% and lets you conclude the year is going badly.
// ─────────────────────────────────────────────────────────────────────────────

import { num, day, toTzs, type OrderLine, type DespatchLite } from "@/lib/ops-orders-shared";
import { lineView } from "@/lib/ops-orders-shared";

export type Enquiry = {
  id: number;
  companyId: number;
  rfqNo: string;
  rfqDate: string | null;
  client: string | null;
  description: string | null;
  assignedTo: string | null;
  quotationNo: string | null;
  quotationDate: string | null;
  quoteCurrency: string | null;
  quoteValue: string | null;
  quoteExRate: string | null;
  /** The PO this enquiry won, by number. ⚠️ A pointer — never a copy of its value. */
  poNo: string | null;
  outcome: string | null;
  outcomeReason: string | null;
  remarks: string | null;
  archived: boolean;
};

const DAY_MS = 86_400_000;

/**
 * A PO number as it is MATCHED, not as it is stored.
 *
 * ⚠️ Both sides are typed by hand, months apart, by different people — the
 * enquiry when the order is won, the line when it is entered. "24322 " and
 * "24322" are one PO, and the workbook's habit of holding the same number in
 * two sheets is exactly how they drift apart.
 */
export function poKey(v: string | null | undefined): string | null {
  const t = (v ?? "").trim().toUpperCase();
  return t === "" ? null : t;
}

/** Group order lines by the PO number they carry, ready to be looked up. */
export function linesByPo(lines: OrderLine[]): Map<string, OrderLine[]> {
  const out = new Map<string, OrderLine[]>();
  for (const l of lines) {
    const k = poKey(l.poNo);
    if (!k) continue;
    const bucket = out.get(k);
    if (bucket) bucket.push(l); else out.set(k, [l]);
  }
  return out;
}

/** How far one enquiry actually got. Derived, never typed. */
export type FunnelStage = "enquiry" | "quoted" | "ordered" | "invoiced";

export type EnquiryView = {
  enquiry: Enquiry;
  stage: FunnelStage;
  quoted: boolean;
  ordered: boolean;
  invoiced: boolean;
  /** Closed with an outcome and no order — dead, and it will not convert. */
  lost: boolean;
  /** Still live: no order, no outcome. These are what make a cohort a floor. */
  open: boolean;
  /** The quote, in shillings, at the rate frozen on this row. Null when unknown. */
  quoteValueTzs: number | null;
  /** ⚠️ Read from the order lines carrying this PO number — never stored here.
   *  Null when the PO is named but no line has been entered for it yet: an
   *  order nobody has typed is of UNKNOWN value, not of no value. */
  orderValueTzs: number | null;
  /** How many lines were found, and how many of them could not be priced. */
  orderLines: number;
  unpricedLines: number;
  invoicedValueTzs: number | null;
  /** Earliest date on the lines — when the order actually landed. */
  orderDate: string | null;
  /** RFQ → quotation, in days. Null until it is quoted. */
  daysToQuote: number | null;
  /** RFQ → order, in days. Null until it is ordered. */
  daysToOrder: number | null;
  /** Days it has been sitting with nobody deciding. Null once it is settled. */
  ageDays: number | null;
  /** Why it is not moving, in one phrase, or null when it is finished. */
  waitingOn: string | null;
};

/**
 * Everything derived about one enquiry.
 *
 * ⚠️ `docOf` looks up the delivery note / invoice a line went out on. Since
 * Stage 5 that is where "invoiced" lives — an order line no longer carries an
 * invoice number of its own, because one invoice covers many lines. Pass
 * nothing and no line reads as invoiced, which is right for an enquiry whose
 * order has not been despatched.
 */
export function enquiryView(
  e: Enquiry,
  byPo: Map<string, OrderLine[]>,
  today: Date = new Date(),
  docOf?: (line: OrderLine) => DespatchLite | null,
): EnquiryView {
  const now = day(today)!;
  const rfq = day(e.rfqDate);
  const quotedOn = day(e.quotationDate);

  const quoted = Boolean(e.quotationNo?.trim() || e.quotationDate);
  const quoteValueTzs = toTzs(num(e.quoteValue), e.quoteCurrency, num(e.quoteExRate));

  const key = poKey(e.poNo);
  const lines = key ? (byPo.get(key) ?? []) : [];
  // The order is real the moment its number is written down; the lines catch up.
  const ordered = key !== null;

  let orderValueTzs: number | null = null;
  let invoicedValueTzs: number | null = null;
  let unpricedLines = 0;
  let orderDate: string | null = null;
  let anyInvoiced = false;

  for (const l of lines) {
    const v = lineView(l, today, docOf?.(l));
    if (v.saleTotalTzs === null) unpricedLines += 1;
    else orderValueTzs = (orderValueTzs ?? 0) + v.saleTotalTzs;
    if (v.invoiced) {
      anyInvoiced = true;
      if (v.saleTotalTzs !== null) invoicedValueTzs = (invoicedValueTzs ?? 0) + v.saleTotalTzs;
    }
    if (l.receivedDate && (orderDate === null || l.receivedDate < orderDate)) {
      orderDate = l.receivedDate;
    }
  }

  const invoiced = anyInvoiced;
  const stage: FunnelStage =
    invoiced ? "invoiced" : ordered ? "ordered" : quoted ? "quoted" : "enquiry";

  const closed = Boolean(e.outcome?.trim());
  const lost = closed && !ordered;
  const open = !ordered && !closed;

  const orderDay = day(orderDate);
  const daysToQuote =
    rfq === null || quotedOn === null ? null : Math.round((quotedOn.getTime() - rfq.getTime()) / DAY_MS);
  const daysToOrder =
    rfq === null || orderDay === null ? null : Math.round((orderDay.getTime() - rfq.getTime()) / DAY_MS);
  // The clock stops the moment it is settled, either way. Leaving a won order
  // at "300 days waiting" buries the enquiries somebody could still act on.
  const ageDays = rfq === null || !open ? null : Math.round((now.getTime() - rfq.getTime()) / DAY_MS);

  // The first thing missing, in the order the work really happens.
  let waitingOn: string | null = null;
  if (open) waitingOn = quoted ? "waiting on the client" : "not quoted yet";
  else if (ordered && lines.length === 0) waitingOn = "no order lines typed yet";
  else if (ordered && !invoiced) waitingOn = "not invoiced yet";

  return {
    enquiry: e, stage, quoted, ordered, invoiced, lost, open,
    quoteValueTzs, orderValueTzs, orderLines: lines.length, unpricedLines,
    invoicedValueTzs, orderDate, daysToQuote, daysToOrder, ageDays, waitingOn,
  };
}

/* ─────────────────────────────────────────────────────────── the cohorts ─── */

export type Cohort = {
  /** "2026-06" — the month the CLIENT ASKED, which is what the row is about. */
  month: string;
  label: string;
  enquiries: number;
  quoted: number;
  ordered: number;
  invoiced: number;
  /** Still live. While this is above zero the conversion is a floor. */
  open: number;
  lost: number;
  quoteValue: number;
  orderValue: number;
  /** Enquiries whose quote or order value could not be worked out. Reported,
   *  never quietly left out of the totals above. */
  unvalued: number;
  /** quoted ÷ enquiries — both from THIS cohort. */
  quoteRate: number | null;
  /** ordered ÷ quoted — both from THIS cohort. Cannot exceed 100%. */
  orderRate: number | null;
  /** orderValue ÷ quoteValue, within the cohort. */
  valueRate: number | null;
  /** True when every enquiry in the month has settled and the figures are final. */
  settled: boolean;
  /** Median days from enquiry to order, across the ones that converted. */
  medianDaysToOrder: number | null;
};

/** "2026-06" from an ISO date, read in UTC so the day never slips a month. */
export function monthKey(v: string | Date | null | undefined): string | null {
  const d = day(v);
  if (!d) return null;
  return d.toLocaleDateString("en-CA", { timeZone: "UTC" }).slice(0, 7);
}

/** "Jun 2026". */
export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1))
    .toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

/**
 * The funnel by month of enquiry.
 *
 * ⚠️ Every count and every ratio in a row comes from the SAME set of enquiries
 * — the ones the client raised in that month. An order won in August against a
 * June enquiry is counted in June. That is the whole difference from the sheet,
 * and it is why `orderRate` can never come out above 100%.
 *
 * Enquiries with no date of their own are left out and reported separately by
 * `funnelTotals`, because there is no month to put them in and guessing one
 * would move real money into a month it did not happen in.
 */
export function funnelCohorts(views: EnquiryView[]): Cohort[] {
  const groups = new Map<string, EnquiryView[]>();
  for (const v of views) {
    const k = monthKey(v.enquiry.rfqDate);
    if (!k) continue;
    const bucket = groups.get(k);
    if (bucket) bucket.push(v); else groups.set(k, [v]);
  }

  const out: Cohort[] = [];
  for (const [month, rows] of groups) {
    let quoted = 0, ordered = 0, invoiced = 0, open = 0, lost = 0;
    let quoteValue = 0, orderValue = 0, unvalued = 0;
    const daysToOrder: number[] = [];

    for (const v of rows) {
      if (v.quoted) quoted += 1;
      if (v.ordered) ordered += 1;
      if (v.invoiced) invoiced += 1;
      if (v.open) open += 1;
      if (v.lost) lost += 1;
      if (v.quoteValueTzs !== null) quoteValue += v.quoteValueTzs;
      if (v.orderValueTzs !== null) orderValue += v.orderValueTzs;
      // An enquiry counts as unvalued when the figure that should be there
      // isn't: a quote with no value, or a won order with no priced line.
      if ((v.quoted && v.quoteValueTzs === null) || (v.ordered && v.orderValueTzs === null)) {
        unvalued += 1;
      }
      if (v.daysToOrder !== null) daysToOrder.push(v.daysToOrder);
    }

    out.push({
      month,
      label: monthLabel(month),
      enquiries: rows.length,
      quoted, ordered, invoiced, open, lost,
      quoteValue, orderValue, unvalued,
      quoteRate: rows.length === 0 ? null : quoted / rows.length,
      orderRate: quoted === 0 ? null : ordered / quoted,
      // ⚠️ Only where BOTH sides are known. A month whose orders are priced and
      // whose quotes are not would otherwise read as a spectacular success.
      valueRate: quoteValue <= 0 ? null : orderValue / quoteValue,
      settled: open === 0,
      medianDaysToOrder: median(daysToOrder),
    });
  }

  // Newest first — the month somebody is asking about is nearly always this one.
  return out.sort((a, b) => (a.month < b.month ? 1 : a.month > b.month ? -1 : 0));
}

export type FunnelTotals = {
  enquiries: number;
  quoted: number;
  ordered: number;
  invoiced: number;
  open: number;
  lost: number;
  quoteValue: number;
  orderValue: number;
  invoicedValue: number;
  unvalued: number;
  /** Enquiries with no date at all — they cannot sit in a month. */
  undated: number;
  quoteRate: number | null;
  orderRate: number | null;
  /** False while anything is still live, and the rates above are floors. */
  settled: boolean;
  medianDaysToQuote: number | null;
  medianDaysToOrder: number | null;
};

export function funnelTotals(views: EnquiryView[]): FunnelTotals {
  let quoted = 0, ordered = 0, invoiced = 0, open = 0, lost = 0;
  let quoteValue = 0, orderValue = 0, invoicedValue = 0, unvalued = 0, undated = 0;
  const toQuote: number[] = [], toOrder: number[] = [];

  for (const v of views) {
    if (v.quoted) quoted += 1;
    if (v.ordered) ordered += 1;
    if (v.invoiced) invoiced += 1;
    if (v.open) open += 1;
    if (v.lost) lost += 1;
    if (v.quoteValueTzs !== null) quoteValue += v.quoteValueTzs;
    if (v.orderValueTzs !== null) orderValue += v.orderValueTzs;
    if (v.invoicedValueTzs !== null) invoicedValue += v.invoicedValueTzs;
    if ((v.quoted && v.quoteValueTzs === null) || (v.ordered && v.orderValueTzs === null)) unvalued += 1;
    if (!v.enquiry.rfqDate) undated += 1;
    if (v.daysToQuote !== null) toQuote.push(v.daysToQuote);
    if (v.daysToOrder !== null) toOrder.push(v.daysToOrder);
  }

  return {
    enquiries: views.length, quoted, ordered, invoiced, open, lost,
    quoteValue, orderValue, invoicedValue, unvalued, undated,
    quoteRate: views.length === 0 ? null : quoted / views.length,
    orderRate: quoted === 0 ? null : ordered / quoted,
    settled: open === 0,
    medianDaysToQuote: median(toQuote),
    medianDaysToOrder: median(toOrder),
  };
}

/**
 * A rate, written the way it should be read.
 *
 * ⚠️ "at least 21%" when the cohort is still live. A figure that can only go up
 * must not be printed as though it were final — that is how a good June looks
 * like a bad one for the three months it takes to close.
 */
export function rateText(rate: number | null, settled: boolean, dp = 0): string {
  if (rate === null) return "—";
  const shown = `${(rate * 100).toFixed(dp)}%`;
  return settled ? shown : `at least ${shown}`;
}

export const STAGE_LABEL: Record<FunnelStage, string> = {
  enquiry: "Enquiry",
  quoted: "Quoted",
  ordered: "Ordered",
  invoiced: "Invoiced",
};

/** What to offer for a dead enquiry — the workbook's remarks, made countable. */
export const OUTCOME_SUGGESTIONS = [
  "LOST",
  "NO QUOTE",
  "CLIENT DIDN'T PROVIDE ENOUGH INFO",
  "SUPPLIER DIDN'T GET BACK",
  "REQUEST IGNORED",
  "CANCELLED",
];

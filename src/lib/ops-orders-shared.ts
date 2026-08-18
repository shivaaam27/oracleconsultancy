// ─────────────────────────────────────────────────────────────────────────────
// OPS ORDER LINES — the client-safe half: types and pure arithmetic (Stage 2).
//
// ⚠️ No `sb` import. The server half is `ops-orders.ts`.
//
// EVERY FIGURE HERE IS DERIVED ON READ. Nothing in this file is ever written to
// the database. That is the whole answer to the workbook's central fault: there,
// a fact and a formula are both just cells, so a stale formula is
// indistinguishable from a number somebody checked.
//
// ⚠️ Unknown is null, never zero. A line with no quantity has no total — it does
// not have a total of nothing. The workbook prints 0 and the 0 gets summed.
// ─────────────────────────────────────────────────────────────────────────────

export type OrderLine = {
  id: number;
  companyId: number;
  poNo: string;
  client: string | null;
  costCentre: string | null;
  receivedDate: string | null;
  dueDate: string | null;
  description: string;
  qty: string | null;
  uom: string | null;
  saleCurrency: string | null;
  saleUnitPrice: string | null;
  exRate: string | null;
  kind: string | null;
  quotationNo: string | null;
  quotedUnitBp: string | null;
  lcFactor: string | null;
  source: string | null;
  supplier: string | null;
  origin: string | null;
  profNo: string | null;
  purchaseDate: string | null;
  purchaseCurrency: string | null;
  purchaseQty: string | null;
  purchaseUnitPrice: string | null;
  supplierPaymentDate: string | null;
  status: string | null;
  pendingWith: string | null;
  remarks: string | null;
  invoiceNo: string | null;
  invoiceDate: string | null;
  archived: boolean;
};

/** Postgres `numeric` arrives as a string, and sometimes as a number. */
export function num(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[\s,]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** A calendar date pinned to UTC midnight, so day arithmetic is exact.
 *
 *  ⚠️ The obvious version is wrong: `new Date("2026-01-19")` parses as UTC
 *  midnight and `setHours(0,0,0,0)` then moves it to LOCAL midnight, which in
 *  Dar es Salaam is the previous day. The projects module lost a day to this. */
export function day(v: string | Date | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  const [y, m, dd] = d.toLocaleDateString("en-CA", { timeZone: "UTC" }).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, dd));
}

const DAY_MS = 86_400_000;

export type LineView = {
  line: OrderLine;
  /** qty × unit price, in the currency the sale was priced in. */
  saleTotal: number | null;
  /** The same, in shillings, using THIS line's frozen rate. */
  saleTotalTzs: number | null;
  purchaseTotal: number | null;
  purchaseTotalTzs: number | null;
  /** sale − purchase, in shillings. Null unless BOTH sides are known. */
  margin: number | null;
  /** margin ÷ sale. Null when there is nothing to divide by. */
  marginPct: number | null;
  /** Positive = late. Null when there is no due date or it is already invoiced. */
  overdueDays: number | null;
  /** Days since the order came in, whatever has happened since. */
  ageDays: number | null;
  invoiced: boolean;
};

/**
 * Convert to shillings using the rate ON THE LINE.
 *
 * ⚠️ Never a rate from settings, and never today's rate. A line priced at 2,500
 * must still read at 2,500 in a year. When the amount is in shillings already
 * the rate is irrelevant; when it is in another currency and no rate was
 * entered, the answer is unknown — not the raw number.
 */
export function toTzs(amount: number | null, currency: string | null, exRate: number | null): number | null {
  if (amount === null) return null;
  const c = (currency ?? "").trim().toUpperCase();
  if (c === "" || c === "TZS" || c === "TSH") return amount;
  if (exRate === null || exRate <= 0) return null;
  return amount * exRate;
}

export function lineView(line: OrderLine, today: Date = new Date()): LineView {
  const qty = num(line.qty);
  const price = num(line.saleUnitPrice);
  const rate = num(line.exRate);
  const saleTotal = qty === null || price === null ? null : qty * price;

  const pQty = num(line.purchaseQty);
  const pPrice = num(line.purchaseUnitPrice);
  const purchaseTotal = pQty === null || pPrice === null ? null : pQty * pPrice;

  const saleTotalTzs = toTzs(saleTotal, line.saleCurrency, rate);
  const purchaseTotalTzs = toTzs(purchaseTotal, line.purchaseCurrency ?? line.saleCurrency, rate);
  const margin =
    saleTotalTzs === null || purchaseTotalTzs === null ? null : saleTotalTzs - purchaseTotalTzs;

  const due = day(line.dueDate);
  const now = day(today)!;
  const invoiced = Boolean(line.invoiceNo || line.invoiceDate);
  // An invoiced line is finished; leaving it "400 days late" for ever buries
  // the ones that still need chasing.
  const overdueDays = due === null || invoiced ? null : Math.round((now.getTime() - due.getTime()) / DAY_MS);

  const received = day(line.receivedDate);
  const ageDays = received === null ? null : Math.round((now.getTime() - received.getTime()) / DAY_MS);

  return {
    line,
    saleTotal,
    saleTotalTzs,
    purchaseTotal,
    purchaseTotalTzs,
    margin,
    marginPct: margin === null || !saleTotalTzs ? null : margin / saleTotalTzs,
    overdueDays,
    ageDays,
    invoiced,
  };
}

export type OrderTotals = {
  lines: number;
  orders: number;
  sale: number;
  purchase: number;
  margin: number;
  /** Lines whose sale value could not be worked out — missing qty, price or rate. */
  unpriced: number;
  overdue: number;
  invoiced: number;
};

/**
 * Totals across a set of lines.
 *
 * ⚠️ `unpriced` is reported rather than hidden. A total that quietly leaves out
 * eleven lines it could not price is the kind of number the workbook produces.
 */
export function orderTotals(views: LineView[]): OrderTotals {
  let sale = 0, purchase = 0, margin = 0, unpriced = 0, overdue = 0, invoiced = 0;
  const orders = new Set<string>();
  for (const v of views) {
    orders.add(v.line.poNo);
    if (v.saleTotalTzs === null) unpriced += 1;
    else sale += v.saleTotalTzs;
    if (v.purchaseTotalTzs !== null) purchase += v.purchaseTotalTzs;
    if (v.margin !== null) margin += v.margin;
    if ((v.overdueDays ?? 0) > 0) overdue += 1;
    if (v.invoiced) invoiced += 1;
  }
  return { lines: views.length, orders: orders.size, sale, purchase, margin, unpriced, overdue, invoiced };
}

/** Whole shillings with separators. */
export function money(v: number | null | undefined): string | null {
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  return new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 }).format(v);
}

export function pct(v: number | null | undefined, dp = 1): string | null {
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  return `${(v * 100).toFixed(dp)}%`;
}

/** "19 Jan 2026", read in Dar es Salaam. */
export function fmtDate(v: string | Date | null | undefined): string | null {
  const d = day(v);
  if (!d) return null;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** The three ways an item reaches the client — workbook column R. */
export const ORDER_KINDS = ["LOCAL", "IMPORT", "STOCK"] as const;

/**
 * How a line reads at a glance.
 *
 * ⚠️ Derived from the dates and the invoice, NOT from the status somebody typed.
 * The two are shown side by side on purpose: where they disagree, that is worth
 * seeing rather than resolving silently.
 */
export type LineFlag = "invoiced" | "overdue" | "due-soon" | "open";

export function lineFlag(v: LineView): LineFlag {
  if (v.invoiced) return "invoiced";
  if (v.overdueDays !== null && v.overdueDays > 0) return "overdue";
  if (v.overdueDays !== null && v.overdueDays > -14) return "due-soon";
  return "open";
}

export const FLAG_LABEL: Record<LineFlag, string> = {
  invoiced: "Invoiced",
  overdue: "Overdue",
  "due-soon": "Due soon",
  open: "Open",
};

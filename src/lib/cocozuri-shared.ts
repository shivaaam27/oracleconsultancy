/**
 * CocoZuri Operations — the CLIENT-SAFE half: types and pure helpers, no database.
 *
 * ⚠️ This file exists because of a hard rule in CLAUDE.md: `src/lib/cocozuri.ts`
 * imports the server-only `sb`, so a CLIENT component importing anything from it
 * drags `@/db/supabase` into the browser bundle and every page dies with
 * "SUPABASE_SERVICE_ROLE_KEY is not set". Same shape as `recruitment-shared.ts`,
 * `ledger-shared.ts` and `notes-shared.ts`.
 *
 * FORWARD RULE: anything a client component needs from CocoZuri goes HERE.
 */

export type CzProduct = {
  id: number;
  name: string;
  category: string | null;
  brand: string | null;
  uom: string;
  packSize: number | null;
  packUnit: string | null;
  sku: string | null;
  active: boolean;
  archived: boolean;
  notes: string | null;
  updatedAt: string;
};

export type CzCustomer = {
  id: number;
  name: string;
  shortName: string | null;
  tin: string | null;
  vatNo: string | null;
  poBox: string | null;
  address: string | null;
  city: string | null;
  country: string;
  currency: string;
  paymentTermsDays: number;
  /** Percent. Null means "use the company default" — see `vatRateFor`. */
  vatRate: number | null;
  invoiceSeries: string | null;
  notes: string | null;
  archived: boolean;
  /** ⚠️ Ids, not just names. An invoice stores WHICH branch, and a name cannot
   *  be stored — Shoppers alone has ten and they are renamed. */
  branches: { id: number; name: string }[];
  updatedAt: string;
};

export type CzPrice = {
  id: number;
  productId: number;
  /** Null = the standard list price, for a customer with no agreed price. */
  customerId: number | null;
  price: number;
  currency: string;
  effectiveFrom: string;
  note: string | null;
};

/* ------------------------------------------------------------------ *
 * Money
 * ------------------------------------------------------------------ */

/**
 * The VAT contained in a VAT-INCLUSIVE amount.
 *
 * ⚠️ THIS IS THE FIX FOR THE WORST FAULT IN THE SPREADSHEETS, and it is worth
 * spelling out. There, the net was worked out as `amount × 100/107` — the amount
 * with VAT taken out, which is right — but the VAT itself as `amount × 7%`, which
 * is 7% of the GROSS. The two do not add back to the invoice. Measured across the
 * 140 invoices in the master: **VAT overstated by TZS 532,296**, on 129 of them.
 *
 * VAT contained in a gross amount is `gross × rate ÷ (100 + rate)`. Nothing else.
 */
export function vatOf(gross: number, ratePercent: number): number {
  if (!Number.isFinite(gross) || !Number.isFinite(ratePercent) || ratePercent <= 0) return 0;
  return (gross * ratePercent) / (100 + ratePercent);
}

/** The amount without VAT — the other half of the same sum, so the two always
 *  add back to the gross exactly. */
export function netOf(gross: number, ratePercent: number): number {
  if (!Number.isFinite(gross)) return 0;
  return gross - vatOf(gross, ratePercent);
}

/** The rate to use for a customer: their own, or the company default. Never a
 *  literal in code — see the note on `cz_customers.vat_rate`. */
export function vatRateFor(customer: { vatRate: number | null } | null, companyDefault: number): number {
  const own = customer?.vatRate;
  return own == null || !Number.isFinite(own) ? companyDefault : own;
}

/* ------------------------------------------------------------------ *
 * Prices
 * ------------------------------------------------------------------ */

/**
 * The price in force for a product and customer on a given day.
 *
 * The rule, and the order matters: **the customer's own agreed price beats the
 * standard list price**, and within either, the newest one whose date has arrived
 * wins. Nothing is stored as "the current price" — it is worked out on read, so
 * putting the prices up tomorrow cannot rewrite what was charged yesterday.
 *
 * Returns null when there is no price at all. ⚠️ The caller must SAY SO rather
 * than fall back to zero or to another customer's price: an invoice raised at a
 * made-up figure is worse than one that could not be raised.
 */
export function priceInForce(
  prices: CzPrice[],
  opts: { productId: number; customerId?: number | null; on?: string },
): CzPrice | null {
  const on = opts.on ?? new Date().toISOString();
  const usable = prices.filter((p) => p.productId === opts.productId && p.effectiveFrom <= on);
  // ⚠️ Ties broken by id, so the answer is the same every time it is asked. Two
  // prices can share a date — merging two duplicate products brings both their
  // price histories together — and "whichever the database happened to return
  // last" is not an acceptable answer to "what does this cost".
  const pick = (rows: CzPrice[]) =>
    rows.length === 0
      ? null
      : rows.reduce((best, r) =>
          r.effectiveFrom > best.effectiveFrom ||
          (r.effectiveFrom === best.effectiveFrom && r.id > best.id)
            ? r
            : best,
        );

  if (opts.customerId != null) {
    const theirs = pick(usable.filter((p) => p.customerId === opts.customerId));
    if (theirs) return theirs;
  }
  return pick(usable.filter((p) => p.customerId == null));
}

/* ------------------------------------------------------------------ *
 * Display
 * ------------------------------------------------------------------ */

/** "100 GM" — the two columns the invoice prints apart, joined for a list. */
export function packLabel(p: { packSize: number | null; packUnit: string | null }): string {
  if (p.packSize == null) return p.packUnit ?? "";
  const n = Number.isInteger(p.packSize) ? String(p.packSize) : String(p.packSize);
  return p.packUnit ? `${n} ${p.packUnit}` : n;
}

/** Money, the way the invoices show it: no decimals, thousands separated. */
export function money(n: number, currency = "TZS"): string {
  const v = Math.round(n).toLocaleString("en-GB");
  return currency === "TZS" ? v : `${currency} ${v}`;
}

/** The categories the spreadsheets already use, in the order they appear there.
 *  ⚠️ A SUGGESTION, NOT A RULE — the field is free text and a thirteenth category
 *  needs no code change. This only drives the order things are grouped in. */
export const CZ_CATEGORY_ORDER = [
  "BONBONS",
  "FRAMES",
  "HANDROLLED TRUFFLES",
  "ROCHERS",
  "CHOCOLATE STICKS",
  "BARS",
  "CHOCOLATE SLABS(100GM)",
  "DESSERTS",
  "COOKIES",
  "OTHER ITEMS",
  "EXTRA ITEMS",
  "SAMPLES",
];

export function categoryRank(c: string | null): number {
  if (!c) return CZ_CATEGORY_ORDER.length + 1;
  const i = CZ_CATEGORY_ORDER.indexOf(c.toUpperCase());
  return i === -1 ? CZ_CATEGORY_ORDER.length : i;
}

/* ------------------------------------------------------------------ *
 * The amount, in words
 * ------------------------------------------------------------------ */

const ONES = ["", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE",
  "TEN", "ELEVEN", "TWELVE", "THIRTEEN", "FOURTEEN", "FIFTEEN", "SIXTEEN", "SEVENTEEN",
  "EIGHTEEN", "NINETEEN"];
const TENS = ["", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY"];

function underThousand(n: number): string {
  if (n === 0) return "";
  if (n < 20) return ONES[n]!;
  if (n < 100) {
    const t = TENS[Math.floor(n / 10)]!;
    const r = n % 10;
    // "TWENTY-EIGHT", the way the invoices already write it.
    return r ? `${t}-${ONES[r]}` : t;
  }
  const h = `${ONES[Math.floor(n / 100)]} HUNDRED`;
  const r = n % 100;
  return r ? `${h} ${underThousand(r)}` : h;
}

/**
 * An amount written out, for the "IN WORDS" line on an invoice.
 *
 * ⚠️ IT IS TYPED BY HAND ON EVERY INVOICE IN THE SPREADSHEETS — 295 of them —
 * which is both a waste of a minute and a place for a number to disagree with
 * itself. This produces the same phrasing the invoices already use
 * ("ONE MILLION ONE HUNDRED TWENTY-EIGHT THOUSAND"), so a printed invoice does
 * not suddenly change voice.
 *
 * Whole units only. The invoices never show cents, and inventing them here would
 * put a figure on the page that the total above it does not show.
 */
export function amountInWords(amount: number): string {
  const n = Math.round(Math.abs(amount));
  if (!Number.isFinite(n)) return "";
  if (n === 0) return "ZERO";

  const scales: [number, string][] = [
    [1_000_000_000, "BILLION"],
    [1_000_000, "MILLION"],
    [1_000, "THOUSAND"],
  ];
  let left = n;
  const parts: string[] = [];
  for (const [value, label] of scales) {
    const count = Math.floor(left / value);
    if (count > 0) {
      parts.push(`${underThousand(count)} ${label}`);
      left -= count * value;
    }
  }
  if (left > 0) parts.push(underThousand(left));
  const words = parts.join(" ").replace(/\s+/g, " ").trim();
  return amount < 0 ? `MINUS ${words}` : words;
}

/* ------------------------------------------------------------------ *
 * The invoice
 * ------------------------------------------------------------------ */

export type CzInvoiceLine = {
  id?: number;
  productId: number | null;
  lineNo: number;
  description: string;
  brand: string | null;
  packSize: number | null;
  packUnit: string | null;
  uom: string | null;
  qty: number;
  unitPrice: number;
};

export type CzInvoice = {
  id: number;
  customerId: number;
  branchId: number | null;
  /** Resolved for display. An invoice to Shoppers means nothing without it —
   *  they have ten shops and the spreadsheet has a column for exactly this. */
  branchName: string | null;
  docType: "invoice" | "credit_note";
  number: string;
  series: string | null;
  issueDate: string;
  termsDays: number;
  currency: string;
  vatRate: number;
  taxInclusive: boolean;
  customerName: string;
  customerTin: string | null;
  customerVatNo: string | null;
  customerPoBox: string | null;
  customerCity: string | null;
  reference: string | null;
  status: "draft" | "issued" | "cancelled";
  notes: string | null;
  lines: CzInvoiceLine[];
};

/** One line's money. Derived, never stored — the qty and the price are the fact. */
export function lineAmount(l: { qty: number; unitPrice: number }): number {
  const q = Number(l.qty), p = Number(l.unitPrice);
  return Number.isFinite(q) && Number.isFinite(p) ? q * p : 0;
}

export type CzTotals = { gross: number; net: number; vat: number; pieces: number };

/**
 * What an invoice comes to.
 *
 * ⚠️ NOTHING HERE IS STORED. There is no total column on `cz_invoices` and there
 * must never be one: the lines are the fact and the total is worked out on read,
 * the same rule the general ledger follows. A stored total is a number that can
 * disagree with the invoice it is printed on.
 *
 * `taxInclusive` is what the spreadsheets do — the column is headed "TOTAL (INC
 * VAT)" — so the line prices already contain the VAT and `gross` is their sum.
 * When it is false the VAT is added on top instead. Stored per invoice so a later
 * change of habit cannot reinterpret old paperwork.
 */
export function invoiceTotals(
  lines: { qty: number; unitPrice: number }[],
  vatRate: number,
  taxInclusive = true,
): CzTotals {
  const sum = lines.reduce((t, l) => t + lineAmount(l), 0);
  const pieces = lines.reduce((t, l) => t + (Number.isFinite(Number(l.qty)) ? Number(l.qty) : 0), 0);
  if (taxInclusive) {
    const vat = vatOf(sum, vatRate);
    return { gross: sum, net: sum - vat, vat, pieces };
  }
  const vat = sum * (Number.isFinite(vatRate) && vatRate > 0 ? vatRate / 100 : 0);
  return { gross: sum + vat, net: sum, vat, pieces };
}

/** When it falls due — issue date plus the terms frozen on the invoice. */
export function invoiceDueDate(issueDate: string, termsDays: number): Date {
  const d = new Date(issueDate);
  d.setDate(d.getDate() + (Number.isFinite(termsDays) ? termsDays : 30));
  return d;
}

/**
 * The next number in a series.
 *
 * The business runs two: `CZ-142` and `CZ/AP/43`, each counting on its own. A
 * credit note has its own again (`CZ-CN/01`), which is why the series is passed
 * in rather than worked out from the document type.
 *
 * ⚠️ The width is taken from the widest number already used in that series, so
 * `CZ-CN/01` stays two digits and `CZ-142` stays three. Nothing here decides
 * what a series is called — that is data on the customer.
 */
export function nextInSeries(series: string, existing: string[], floor = 0): string {
  // ⚠️ THE FLOOR IS WHY THE FIRST INVOICE IS NOT "CZ-1". The business is already
  // at CZ-236 in its spreadsheets, and those invoices are not in COS — so left to
  // itself the numbering would start again from one and two different documents
  // would end up carrying the same number. The floor is a setting the owner types
  // once, per series. Found by raising the very first invoice and reading it.
  let max = Number.isFinite(floor) && floor > 0 ? Math.floor(floor) : 0;
  let width = 1;
  for (const n of existing) {
    if (!n.startsWith(series)) continue;
    const tail = n.slice(series.length);
    if (!/^\d+$/.test(tail)) continue;
    const v = Number(tail);
    if (v > max) max = v;
    if (tail.length > width) width = tail.length;
  }
  return `${series}${String(max + 1).padStart(width, "0")}`;
}

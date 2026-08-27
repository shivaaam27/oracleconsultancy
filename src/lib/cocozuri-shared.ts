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

/**
 * A date, the way every CocoZuri screen shows one: `22 Aug 26`.
 *
 * ⚠️ ONE FORMAT, BECAUSE THERE WERE FOUR. The invoices, receipts and purchases
 * lists each built their own `toLocaleDateString` call; the batches, transfers,
 * counter and payments lists printed the raw `2026-08-22`; and the budgets sheet
 * dropped the year altogether. Four shapes of the same fact, side by side in one
 * module, is exactly the sort of thing that makes a system feel unfinished.
 *
 * ⚠️ IT TAKES THE DATE AT NOON, NOT MIDNIGHT. `new Date("2026-08-22")` is
 * parsed as UTC midnight, which in Dar es Salaam is still the 22nd — but the
 * same code west of Greenwich prints the 21st. Noon cannot slip either way.
 *
 * ⚠️ A PRINTED DOCUMENT KEEPS ITS OWN, FORMAL STYLE (`22 AUG 2026`) — see the
 * invoice and the statement. That is a deliberate difference between a screen
 * and a piece of paper somebody files, not an inconsistency.
 */
export function czDate(iso: string | null | undefined): string {
  const s = String(iso ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "—";
  const d = new Date(`${s}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" });
}

/**
 * A month, the way the profit and cost-of-sales screens should show one:
 * `Aug 2026`. ⚠️ They printed the raw `2026-08` at the reader — in the page
 * title, in the period picker and in the middle of a sentence — which is the
 * same fault as an ISO date and reads like a database field.
 */
export function czMonth(ym: string | null | undefined): string {
  const s = String(ym ?? "").slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(s)) return String(ym ?? "—");
  const d = new Date(`${s}-01T12:00:00`);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

/** The same date without the year — for a run of dates inside one month, where
 *  repeating "26" on every row is noise. */
export function czDayMonth(iso: string | null | undefined): string {
  const s = String(iso ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "—";
  const d = new Date(`${s}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
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
  /**
   * Which invoice this credit note answers. Null on an invoice, and null on a
   * credit note that is a credit on the account rather than against one document.
   *
   * ⚠️ THIS IS WHAT MAKES A PER-INVOICE BALANCE POSSIBLE. The master ledger does
   * it with a RETURN NOTES column beside the invoice row — the credit is already
   * allocated there — and without the same allocation here "what is still owed
   * on CZ-180" could not be answered, only "what does this customer owe".
   */
  appliesToInvoiceId: number | null;
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
export function nextInSeries(series: string, existing: string[], floor: number | string = 0): string {
  // ⚠️ THE FLOOR IS WHY THE FIRST INVOICE IS NOT "CZ-1". The business is already
  // at CZ-236 in its spreadsheets, and those invoices are not in COS — so left to
  // itself the numbering would start again from one and two different documents
  // would end up carrying the same number. The floor is a setting the owner types
  // once, per series. Found by raising the very first invoice and reading it.
  //
  // ⚠️ THE FLOOR MAY BE A STRING, AND THAT IS HOW THE WIDTH IS SET FOR A SERIES
  // WITH NOTHING IN COS YET. Width is normally taken from the numbers already
  // used, but the first document in a series has none to look at — so the very
  // first credit note came out `CZ-CN/1` when the one on paper is `CZ-CN/01`.
  // Writing the floor as "01" says both things at once: carry on from 1, and
  // pad to two digits. Found by raising a credit note, which nothing had done
  // before Phase 3 gave a credit note something to answer.
  const floorText = typeof floor === "string" ? floor.trim() : "";
  const floorNum = typeof floor === "string" ? Number(floorText) : floor;
  let max = Number.isFinite(floorNum) && floorNum > 0 ? Math.floor(floorNum) : 0;
  let width = /^\d+$/.test(floorText) ? floorText.length : 1;
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

/* ================================================================== *
 * Phase 3 — money in, what is owed, and how late.
 *
 * ⚠️ NOTHING IN THIS SECTION IS STORED. Not a balance, not an age, not a band.
 * The invoice lines, the credit notes and the receipts are the facts; everything
 * below is worked out on read, every time. That is the ledger's rule and the
 * reason nothing in COS goes stale — and it is exactly what the spreadsheets got
 * wrong, where a hand-typed DEBTOR MASTER had to be kept up to date by somebody.
 * ================================================================== */

/**
 * A payment received against an invoice.
 *
 * ⚠️ ONE ROW PER PAYMENT PER INVOICE. A part payment is a row and so is the
 * balance, which is how the PES module already records money out. A single
 * cheque covering five invoices is five rows sharing one reference — that keeps
 * every shilling attached to the paperwork it settles, instead of a lump of
 * money on account that somebody has to allocate later.
 */
export type CzReceipt = {
  id: number;
  customerId: number;
  invoiceId: number;
  /** Resolved for display — a receipt means nothing without the invoice it settles. */
  invoiceNumber: string | null;
  receivedOn: string;
  amount: number;
  currency: string;
  /** Cash, cheque, bank transfer, mobile. Free text: the spreadsheet's REMARKS
   *  column has said all four and more, and a fixed list would lose the rest. */
  method: string | null;
  /** Cheque number, transfer reference — whatever proves it. */
  reference: string | null;
  /**
   * ⚠️ THE "RECEIVED IN DSC" FACT, RECORDED RATHER THAN DECIDED.
   *
   * The master ledger's REMARKS column keeps saying things like "Cheque received
   * in DSC" and "Cash Received with Jitesh In DSC" — Cocozuri invoices, but the
   * money lands in DSC Ltd, a different company. That is an inter-company matter
   * nobody has ruled on yet (plan section 4, question 4), so this column records
   * WHICH company took the money and makes no claim about what it means. When
   * the owner answers, the answer will have data to work from.
   */
  receivedIntoCompanyId: number | null;
  receivedIntoName: string | null;
  notes: string | null;
};

/** What an invoice comes to — the one line everything below counts on. */
export function invoiceGross(inv: Pick<CzInvoice, "lines" | "vatRate" | "taxInclusive">): number {
  return invoiceTotals(inv.lines, inv.vatRate, inv.taxInclusive).gross;
}

/**
 * What is still owed on one invoice.
 *
 * invoice − credit notes applied to it − payments received against it, which is
 * exactly the master ledger's BALANCE = AMOUNT − RETURNS − PAID.
 *
 * ⚠️ AN OVERPAYMENT COMES BACK NEGATIVE, and is left that way on purpose. It is
 * a real thing that happens and it is money owed back to the customer; clamping
 * it at zero would hide it, and the whole point of this module is that a figure
 * on the screen is a figure somebody can act on.
 */
export function invoiceBalance(
  invoice: CzInvoice,
  receipts: { invoiceId: number; amount: number }[],
  creditNotes: CzInvoice[] = [],
): { gross: number; paid: number; credited: number; balance: number } {
  const gross = invoiceGross(invoice);
  const paid = receipts
    .filter((r) => r.invoiceId === invoice.id)
    .reduce((t, r) => t + (Number.isFinite(r.amount) ? r.amount : 0), 0);
  const credited = creditNotes
    .filter((c) => c.docType === "credit_note" && c.appliesToInvoiceId === invoice.id && c.status === "issued")
    .reduce((t, c) => t + invoiceGross(c), 0);
  return { gross, paid, credited, balance: gross - paid - credited };
}

/* ------------------------------ ageing ----------------------------- */

export type CzAgeingKey = "current" | "d1_30" | "d31_60" | "d61_90" | "over90";

/**
 * The five bands.
 *
 * ⚠️ THIS IS FAULT 2 IN THE PLAN, FIXED. Sheet2 of the master defines the bands
 * as 1–30, 31–60 and then 91+ — the 61–90 band simply is not there, so
 * everything between 61 and 90 days late is reported as "31–60 DAYS". Measured
 * on the day the workbooks were read: two unpaid invoices worth TZS 1,567,000
 * (CZ-180 and CZ/AP/47) were being shown a whole month younger than they were.
 *
 * Do not drop a band to make a screen fit. The missing one is the reason this
 * page exists at all.
 */
export const CZ_AGEING_BANDS: { key: CzAgeingKey; label: string; short: string; from: number; to: number | null }[] = [
  { key: "current", label: "Not yet due",  short: "Current", from: -Infinity, to: 0 },
  { key: "d1_30",   label: "1–30 days",    short: "1–30",    from: 1,  to: 30 },
  { key: "d31_60",  label: "31–60 days",   short: "31–60",   from: 31, to: 60 },
  { key: "d61_90",  label: "61–90 days",   short: "61–90",   from: 61, to: 90 },
  { key: "over90",  label: "Over 90 days", short: "90+",     from: 91, to: null },
];

/**
 * How many whole days past due.
 *
 * The master ledger computes TODAY() − (DATE + 30), so a positive number is days
 * LATE and zero or less means it is not due yet. Kept as a plain millisecond
 * difference rather than a calendar-day one, because the due date is the issue
 * date plus the terms — the same time of day — so no time zone can move the
 * answer by a day.
 */
export function daysOverdue(due: Date, asOf: Date = new Date()): number {
  const ms = asOf.getTime() - due.getTime();
  return Number.isFinite(ms) ? Math.floor(ms / 86_400_000) : 0;
}

export function ageingBandOf(days: number): CzAgeingKey {
  for (const b of CZ_AGEING_BANDS) {
    if (days >= b.from && (b.to == null || days <= b.to)) return b.key;
  }
  return "over90";
}

export function emptyAgeing(): Record<CzAgeingKey, number> {
  return { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, over90: 0 };
}

/** Add a set of aged amounts up, band by band. */
export function ageingSummary(items: { days: number; amount: number }[]): Record<CzAgeingKey, number> {
  const out = emptyAgeing();
  for (const it of items) {
    if (!Number.isFinite(it.amount)) continue;
    out[ageingBandOf(it.days)] += it.amount;
  }
  return out;
}

/* --------------------------- what is owed -------------------------- */

export type CzOutstanding = {
  invoice: CzInvoice;
  gross: number;
  paid: number;
  credited: number;
  balance: number;
  due: Date;
  days: number;
  band: CzAgeingKey;
};

/**
 * Every invoice with something still on it, worst first.
 *
 * ⚠️ ONLY ISSUED DOCUMENTS COUNT. A draft is not owed — nobody has been asked to
 * pay it — and a cancelled one never was. Getting this wrong would put money in
 * the debtors that the customer has never been sent a bill for.
 *
 * "Worst first" means most overdue, then largest — the order the rest of COS
 * uses for any list somebody is meant to act on (DESIGN_SYSTEM.md section 12).
 */
export function outstandingOf(
  invoices: CzInvoice[],
  receipts: { invoiceId: number; amount: number }[],
  asOf: Date = new Date(),
): CzOutstanding[] {
  const issued = invoices.filter((i) => i.status === "issued");
  const credits = issued.filter((i) => i.docType === "credit_note");
  return issued
    .filter((i) => i.docType === "invoice")
    .map((invoice) => {
      const { gross, paid, credited, balance } = invoiceBalance(invoice, receipts, credits);
      const due = invoiceDueDate(invoice.issueDate, invoice.termsDays);
      const days = daysOverdue(due, asOf);
      return { invoice, gross, paid, credited, balance, due, days, band: ageingBandOf(days) };
    })
    // ⚠️ Rounded to the shilling before comparing. VAT arithmetic can leave a
    // fully-settled invoice holding a fraction of a cent, and an invoice nobody
    // owes anything on must not appear on a chase list because of it.
    .filter((r) => Math.round(r.balance) !== 0)
    .sort((a, b) => b.days - a.days || b.balance - a.balance || a.invoice.number.localeCompare(b.invoice.number));
}

export type CzCustomerAccount = {
  customerId: number;
  customerName: string;
  invoiced: number;
  credited: number;
  received: number;
  balance: number;
  /** Credit notes pointed at no invoice — a credit sitting on the account. */
  unappliedCredit: number;
  bands: Record<CzAgeingKey, number>;
  /** Days late on the oldest thing outstanding. Zero when nothing is overdue. */
  oldestDays: number;
  openInvoices: number;
};

/**
 * The debtor list — one line per customer.
 *
 * This is the DEBTOR MASTER sheet, except nobody types it. There, a month-end
 * snapshot of what each customer owed was typed out by hand, month after month,
 * and was out of date the moment a payment came in.
 *
 * ⚠️ AN UNAPPLIED CREDIT NOTE IS SHOWN SEPARATELY, not quietly netted off. It
 * does reduce what the customer owes overall, but it is attached to no invoice,
 * so it cannot be aged — and folding it into a band would put a figure in a
 * column that means something else.
 */
export function customerAccounts(
  invoices: CzInvoice[],
  receipts: { invoiceId: number; customerId: number; amount: number }[],
  asOf: Date = new Date(),
): CzCustomerAccount[] {
  const issued = invoices.filter((i) => i.status === "issued");
  const outstanding = outstandingOf(invoices, receipts, asOf);
  const byCustomer = new Map<number, CzCustomerAccount>();

  const seat = (id: number, name: string) => {
    let a = byCustomer.get(id);
    if (!a) {
      a = {
        customerId: id, customerName: name,
        invoiced: 0, credited: 0, received: 0, balance: 0, unappliedCredit: 0,
        bands: emptyAgeing(), oldestDays: 0, openInvoices: 0,
      };
      byCustomer.set(id, a);
    }
    return a;
  };

  for (const i of issued) {
    const a = seat(i.customerId, i.customerName);
    const g = invoiceGross(i);
    if (i.docType === "credit_note") {
      a.credited += g;
      if (i.appliesToInvoiceId == null) a.unappliedCredit += g;
    } else {
      a.invoiced += g;
    }
  }
  for (const r of receipts) {
    const a = byCustomer.get(r.customerId);
    if (a) a.received += Number.isFinite(r.amount) ? r.amount : 0;
  }
  for (const o of outstanding) {
    const a = seat(o.invoice.customerId, o.invoice.customerName);
    a.bands[o.band] += o.balance;
    a.openInvoices += 1;
    if (o.days > a.oldestDays) a.oldestDays = o.days;
  }
  for (const a of byCustomer.values()) a.balance = a.invoiced - a.credited - a.received;

  return [...byCustomer.values()]
    .sort((a, b) => b.oldestDays - a.oldestDays || b.balance - a.balance || a.customerName.localeCompare(b.customerName));
}

/* --------------------------- the statement ------------------------- */

export type CzStatementRow = {
  date: string;
  kind: "invoice" | "credit_note" | "receipt";
  ref: string;
  detail: string | null;
  debit: number;
  credit: number;
  /** Running balance AFTER this line. Derived, never stored. */
  balance: number;
};

/** Invoices before credit notes before receipts on the same day, so a statement
 *  reads in the order the paperwork actually happened. */
const KIND_RANK: Record<CzStatementRow["kind"], number> = { invoice: 0, credit_note: 1, receipt: 2 };

/**
 * A statement of account — what the customer tabs of the master workbook print,
 * as a page that can be sent.
 *
 * `from` and `to` bracket the period, and anything before `from` is rolled into
 * the OPENING BALANCE rather than dropped. That is the difference between a
 * statement and a filtered list: a statement still adds up. The closing balance
 * is what they owe at the end of it.
 */
export function statementRows(
  invoices: CzInvoice[],
  receipts: CzReceipt[],
  opts?: { from?: string; to?: string },
): { opening: number; rows: CzStatementRow[]; closing: number } {
  const events: CzStatementRow[] = [];

  for (const i of invoices) {
    if (i.status !== "issued") continue;
    const g = invoiceGross(i);
    const isCredit = i.docType === "credit_note";
    events.push({
      date: i.issueDate,
      kind: isCredit ? "credit_note" : "invoice",
      ref: i.number,
      detail: i.branchName ?? i.reference ?? null,
      debit: isCredit ? 0 : g,
      credit: isCredit ? g : 0,
      balance: 0,
    });
  }
  for (const r of receipts) {
    events.push({
      date: r.receivedOn,
      kind: "receipt",
      ref: r.reference?.trim() || r.method?.trim() || "Payment",
      detail: r.invoiceNumber ? `against ${r.invoiceNumber}` : null,
      debit: 0,
      credit: r.amount,
      balance: 0,
    });
  }

  events.sort((a, b) =>
    a.date.localeCompare(b.date) || KIND_RANK[a.kind] - KIND_RANK[b.kind] || a.ref.localeCompare(b.ref));

  let running = 0;
  let opening = 0;
  const rows: CzStatementRow[] = [];
  for (const e of events) {
    if (opts?.to && e.date > opts.to) continue;
    running += e.debit - e.credit;
    if (opts?.from && e.date < opts.from) { opening = running; continue; }
    rows.push({ ...e, balance: running });
  }
  return { opening, rows, closing: running };
}

/* ================================================================== *
 * Phase 5 — into the books.
 *
 * ⚠️ THESE FUNCTIONS BUILD LINES; THEY DO NOT WRITE ANYTHING. Everything that
 * reaches `gl_entries` goes through `postVoucher()` in `ledger-post.ts` — the
 * one door, the same rule the PES module and the recruitment desk follow. A
 * second write path is a second set of books.
 *
 * They are here, in the pure half, so the arithmetic can be tested without a
 * database: a voucher that does not balance is a broken ledger, and "it looked
 * right on screen" is not a test.
 * ================================================================== */

/** The accounts a CocoZuri document needs. Resolved server-side from the chart;
 *  passed in here so the line-building stays pure. */
export type CzPostingAccounts = {
  /** Trade debtors — what customers owe. */
  receivable: number;
  /** Where the sale is earned. */
  sales: number;
  /** VAT collected on behalf of the revenue authority. Never income. */
  vatOutput: number;
};

/** One line of a voucher, in the shape `postVoucher` takes. Kept structural
 *  rather than importing the ledger's type, so the client half stays free of
 *  the ledger entirely. */
export type CzVoucherLine = {
  accountId: number;
  debit: number;
  credit: number;
  partyType?: string | null;
  party?: string | null;
  remarks?: string | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * What an invoice does to the books.
 *
 *   Dr  Trade debtors        the whole invoice, VAT and all
 *     Cr  Sales                       what was actually earned
 *     Cr  VAT payable                 what is owed to the revenue authority
 *
 * ⚠️ VAT IS NEVER INCOME. It is money collected on somebody else's behalf and
 * it goes to a liability, which is why the sales line is the NET. The
 * spreadsheets have no such split at all — they record one gross figure and
 * work the VAT out afterwards, wrongly (fault #1).
 *
 * ⚠️ NET IS DERIVED AS `gross − vat`, NOT COMPUTED SEPARATELY. Both are rounded
 * to the cent, and two independent roundings can leave the voucher a cent out
 * of balance — which `postVoucher` would absorb and write a note about. Taking
 * the difference makes it balance exactly, every time.
 *
 * ⚠️ A CREDIT NOTE IS THE SAME VOUCHER WITH THE SIDES SWAPPED. Not a negative
 * invoice: negative debits are a way of hiding a mistake in plain sight, and
 * the ledger's own rule is that you answer a document with another document.
 */
export function invoiceVoucherLines(
  invoice: Pick<CzInvoice, "lines" | "vatRate" | "taxInclusive" | "docType" | "customerName" | "number">,
  accounts: CzPostingAccounts,
): CzVoucherLine[] {
  const t = invoiceTotals(invoice.lines, invoice.vatRate, invoice.taxInclusive);
  const gross = round2(t.gross);
  const vat = round2(t.vat);
  const net = round2(gross - vat);
  const isCredit = invoice.docType === "credit_note";
  const party = { partyType: "Customer" as const, party: invoice.customerName };

  const out: CzVoucherLine[] = [
    {
      accountId: accounts.receivable,
      debit: isCredit ? 0 : gross,
      credit: isCredit ? gross : 0,
      ...party,
      remarks: invoice.number,
    },
    {
      accountId: accounts.sales,
      debit: isCredit ? net : 0,
      credit: isCredit ? 0 : net,
      remarks: invoice.number,
    },
  ];
  // ⚠️ No line at all when there is no VAT. A zero-rated invoice posting a
  // nil VAT line would put empty rows in the books for ever, and "zero-rated"
  // is a fact about the sale, not an entry in the ledger.
  if (vat !== 0) {
    out.push({
      accountId: accounts.vatOutput,
      debit: isCredit ? vat : 0,
      credit: isCredit ? 0 : vat,
      remarks: `VAT at ${invoice.vatRate}% · ${invoice.number}`,
    });
  }
  return out;
}

/**
 * What a payment does to the books.
 *
 *   Dr  Bank (or cash)     the money that arrived
 *     Cr  Trade debtors            the customer owes that much less
 *
 * ⚠️ IT TOUCHES NEITHER SALES NOR VAT. The sale was earned when the invoice was
 * raised; being paid for it is a movement between two assets. Posting a receipt
 * to income is the classic way to count the same revenue twice.
 */
export function receiptVoucherLines(
  receipt: Pick<CzReceipt, "amount" | "reference" | "method" | "invoiceNumber">,
  accounts: { debit: number; receivable: number },
  customerName: string,
): CzVoucherLine[] {
  const amount = round2(receipt.amount);
  const note = [receipt.method, receipt.reference, receipt.invoiceNumber ? `against ${receipt.invoiceNumber}` : null]
    .filter(Boolean).join(" · ");
  return [
    { accountId: accounts.debit, debit: amount, credit: 0, remarks: note || null },
    {
      accountId: accounts.receivable,
      debit: 0, credit: amount,
      partyType: "Customer", party: customerName,
      remarks: note || null,
    },
  ];
}

/** Does a set of lines balance? The ledger's first rule, checked here too so a
 *  test can hold the line-builder to it directly. */
export function linesBalance(lines: CzVoucherLine[]): boolean {
  const d = round2(lines.reduce((t, l) => t + l.debit, 0));
  const c = round2(lines.reduce((t, l) => t + l.credit, 0));
  return d === c;
}

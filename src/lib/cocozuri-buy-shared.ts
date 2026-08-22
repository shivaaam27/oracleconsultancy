/**
 * CocoZuri, manufacturing Stage 2 — buying. The CLIENT-SAFE half.
 *
 * ⚠️ THIS FILE IS CLIENT-SAFE; `cocozuri-buy.ts` IS SERVER-ONLY (it imports
 * `sb`). A client component importing the server half drags `@/db/supabase`
 * into the browser bundle and every page dies with "SUPABASE_SERVICE_ROLE_KEY
 * is not set". Buying is its own pair for the same reason stock is: it is its
 * own subject, and one 1,500-line shared file helps nobody.
 *
 * ⚠️ NOTHING HERE IS STORED. Not a line total, not the VAT, not the freight
 * share, not the landed unit cost, not what a budget has left. The lines, the
 * rate and the freight are the facts; every other figure is worked out on read.
 * The same rule as the general ledger, the ageing and the stock book.
 *
 * Read `memory/cocozuri_manufacturing_plan.md` §4 Stage 2 and §5a first — §5a
 * holds the owner's two answers, and they are what this shape is built on.
 */

import { vatOf } from "@/lib/cocozuri-shared";

/* ------------------------------------------------------------------ *
 * The records
 * ------------------------------------------------------------------ */

/** draft → submitted → approved | rejected → closed. */
export type CzBudgetStatus = "draft" | "submitted" | "approved" | "rejected" | "closed";

export const CZ_BUDGET_STATUSES: CzBudgetStatus[] = [
  "draft", "submitted", "approved", "rejected", "closed",
];

/**
 * Money somebody has said may be spent.
 *
 * ⚠️ THE APPROVAL IS A PERSON AND A MOMENT, NOT A BOOLEAN — the owner's own
 * framing (plan §5a). "Approved" with nobody's name against it answers no
 * question worth asking, and a budget nobody has approved is not a budget: the
 * purchase side refuses to measure against one.
 *
 * ⚠️ There is no `spent` field. What has gone is worked out by `budgetUsage()`
 * from the approved purchases, every time it is asked.
 */
export type CzBudget = {
  id: number;
  title: string;
  /** Null = every place. */
  locationId: number | null;
  locationName: string | null;
  startsOn: string;
  endsOn: string;
  amount: number;
  status: CzBudgetStatus;
  submittedBy: string | null;
  submittedAt: string | null;
  decidedByPersonId: number | null;
  /** The name AS IT STOOD. A person may leave; the decision still happened. */
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  notes: string | null;
};

/** Where the money came from. ⚠️ `own_money` means SOMEBODY IS OWED IT BACK. */
export type CzPaidFrom = "credit" | "cash" | "bank" | "own_money";

export const CZ_PAID_FROM: { key: CzPaidFrom; label: string; hint: string }[] = [
  { key: "credit", label: "On account", hint: "Not paid yet — the supplier is owed it." },
  { key: "cash", label: "Cash", hint: "Out of the cash box." },
  { key: "bank", label: "Bank", hint: "Straight out of the bank account." },
  {
    key: "own_money",
    label: "Somebody's own money",
    // ⚠️ The owner named this case specifically: raw materials are often bought
    // "at random or self-bought". It is not a curiosity, it is normal here.
    hint: "Bought personally — that person is owed the money back.",
  },
];

export type CzPurchaseStatus = "draft" | "approved" | "cancelled";

/**
 * Something that was bought.
 *
 * ⚠️ `vendorId` IS OPTIONAL AND MUST STAY OPTIONAL (the owner, 22 Aug 2026).
 * A form that demands a supplier for a kilo of flour off a market stall will
 * not be filled in, and a purchase nobody records never reaches the books at
 * all — which is worse than a purchase with a blank supplier. `supplierName` is
 * the free-text answer for the stall that has no record in COS.
 */
export type CzPurchase = {
  id: number;
  reference: string;
  purchasedOn: string;
  locationId: number;
  locationName: string | null;
  vendorId: number | null;
  vendorName: string | null;
  supplierName: string | null;
  supplierRef: string | null;
  budgetId: number | null;
  paidFrom: CzPaidFrom;
  paidByPersonId: number | null;
  paidBy: string | null;
  currency: string;
  exRate: number | null;
  vatRate: number;
  /** ⚠️ THREE-STATE. `null` means nobody has said — never treat it as false. */
  taxInclusive: boolean | null;
  freightAmount: number;
  freightNote: string | null;
  status: CzPurchaseStatus;
  approvedByPersonId: number | null;
  approvedBy: string | null;
  approvedAt: string | null;
  approvalNote: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  notes: string | null;
  lines: CzPurchaseLine[];
};

export type CzPurchaseLine = {
  id: number;
  lineNo: number;
  itemId: number;
  /** Frozen the day it was bought. */
  description: string;
  qty: number;
  uom: string;
  unitPrice: number;
};

/* ------------------------------------------------------------------ *
 * The arithmetic
 * ------------------------------------------------------------------ */

const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10000) / 10000;
const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export type CzPurchaseTotals = {
  /** Σ qty × unit price, exactly as typed. */
  goods: number;
  /** The goods without VAT. */
  net: number;
  /** The VAT on the goods. */
  vat: number;
  /**
   * ⚠️ FALSE WHEN THE PURCHASE IS RATED AND NOBODY HAS SAID WHETHER THE PRICES
   * INCLUDE THE VAT. The same 1,180,000 is either +VAT or includes-VAT, and
   * guessing moves real money between an expense and a reclaim. When this is
   * false the VAT is reported as UNKNOWN, never as nil, and the purchase cannot
   * be put in the books.
   */
  vatKnown: boolean;
  freight: number;
  /** What the stock is worth on the shelf: net goods plus the freight to get it
   *  there. ⚠️ This is the figure that reaches `gl_entries` as Stock. */
  landed: number;
  /** What is payable to whoever supplied it: landed plus the VAT. */
  payable: number;
};

/**
 * What a purchase comes to.
 *
 * ⚠️ VAT IS THE AMOUNT **CONTAINED** WHEN THE PRICES INCLUDE IT — the same
 * `vatOf()` the selling side uses, and the same fault it exists to kill: the
 * spreadsheets took VAT as a percentage OF the gross and overstated it by TZS
 * 532,296 across 129 invoices. Never compute it the other way here either.
 *
 * ⚠️ FREIGHT CARRIES NO VAT SPLIT, ON PURPOSE. Whether the transit charge is
 * itself rated depends on who raised it and nobody has said; treating it as
 * rated would invent a reclaim. It is added to the cost of the stock whole, and
 * the screen says so. A separately-billed forwarder is its own purchase.
 *
 * ⚠️ NET IS DERIVED AS `goods − vat`, NOT COMPUTED SEPARATELY, so the two halves
 * always add back to the goods figure exactly and the voucher balances to the
 * cent. Same reasoning as `invoiceVoucherLines`.
 */
export function purchaseTotals(
  lines: { qty: number; unitPrice: number }[],
  vatRate: number,
  taxInclusive: boolean | null,
  freightAmount = 0,
): CzPurchaseTotals {
  const goods = round2(lines.reduce((t, l) => t + n(l.qty) * n(l.unitPrice), 0));
  const freight = round2(n(freightAmount));
  const rate = n(vatRate);

  // No rate means no VAT, and that is a fact rather than an unanswered question
  // — most market purchases carry no VAT invoice at all.
  if (rate <= 0) {
    return { goods, net: goods, vat: 0, vatKnown: true, freight, landed: round2(goods + freight), payable: round2(goods + freight) };
  }
  if (taxInclusive == null) {
    // Rated, but nobody has said which way round. The goods figure is still a
    // fact; the split is not, so it is not offered.
    return { goods, net: goods, vat: 0, vatKnown: false, freight, landed: round2(goods + freight), payable: round2(goods + freight) };
  }
  const vat = taxInclusive ? round2(vatOf(goods, rate)) : round2(goods * (rate / 100));
  const net = taxInclusive ? round2(goods - vat) : goods;
  const landed = round2(net + freight);
  return { goods, net, vat, vatKnown: true, freight, landed, payable: round2(landed + vat) };
}

export type CzLandedLine = {
  line: CzPurchaseLine;
  /** qty × unit price, before any freight. */
  value: number;
  /** The net of that, once VAT is taken out (the value that reaches stock). */
  netValue: number;
  /** This line's share of the transit cost. */
  freightShare: number;
  /** netValue + freightShare — what this line is worth on the shelf. */
  landedValue: number;
  /**
   * What ONE of them cost, freight and all. ⚠️ THIS IS THE NUMBER THAT REACHES
   * `cz_stock_moves.unit_cost`, and it is the whole point of the exercise: a bag
   * of almonds should carry the cost of getting it here, or every batch costed
   * from it is cheaper than the truth.
   */
  unitCost: number | null;
};

/**
 * Spread the transit cost over what was received.
 *
 * ⚠️ BY VALUE, NOT BY WEIGHT OR BY LINE. Weight is not recorded and per-line
 * would put as much freight on one sachet of vanilla as on forty kilos of
 * cocoa. Value is the ordinary convention and it is the only one the data can
 * actually support.
 *
 * ⚠️ THE LAST LINE TAKES THE ROUNDING REMAINDER, so the shares add back to the
 * freight figure exactly. Nine lines each rounded to the cent will otherwise
 * miss it by a few, and the stock value and the ledger would disagree.
 *
 * ⚠️ WHEN THE GOODS ARE WORTH NOTHING (a free sample, a replacement sent at no
 * charge) the freight is spread by QUANTITY instead — dividing by a zero value
 * would put it all on nobody. If there is no quantity either it cannot be
 * spread at all, and `unitCost` is null rather than a made-up figure.
 */
export function landedLines(
  lines: CzPurchaseLine[],
  vatRate: number,
  taxInclusive: boolean | null,
  freightAmount = 0,
): CzLandedLine[] {
  const rate = n(vatRate);
  const freight = round2(n(freightAmount));
  // Each line's value net of VAT, using the same rule as the totals.
  const netOfLine = (v: number) =>
    rate <= 0 || taxInclusive == null ? v : taxInclusive ? v - vatOf(v, rate) : v;

  const raw = lines.map((line) => {
    const value = round2(n(line.qty) * n(line.unitPrice));
    return { line, value, netValue: round2(netOfLine(value)) };
  });

  const totalNet = raw.reduce((t, r) => t + r.netValue, 0);
  const totalQty = raw.reduce((t, r) => t + n(r.line.qty), 0);
  const basis: "value" | "qty" | "none" =
    freight === 0 ? "none" : totalNet > 0 ? "value" : totalQty > 0 ? "qty" : "none";

  let given = 0;
  return raw.map((r, i) => {
    const last = i === raw.length - 1;
    let share = 0;
    if (basis === "value") share = last ? round2(freight - given) : round2((freight * r.netValue) / totalNet);
    else if (basis === "qty") share = last ? round2(freight - given) : round2((freight * n(r.line.qty)) / totalQty);
    given = round2(given + share);
    const landedValue = round2(r.netValue + share);
    const q = n(r.line.qty);
    return {
      ...r,
      freightShare: share,
      landedValue,
      unitCost: q === 0 ? null : round4(landedValue / q),
    };
  });
}

/* ------------------------------------------------------------------ *
 * Budgets
 * ------------------------------------------------------------------ */

export type CzBudgetUsage = {
  budget: CzBudget;
  /** What approved purchases inside the window come to. */
  spent: number;
  /** amount − spent. Negative means it has been overrun. */
  remaining: number;
  over: boolean;
  /** How many purchases make up `spent`. */
  count: number;
  /** Where in its own life it is, in plain words. */
  live: boolean;
};

/**
 * What a budget has left.
 *
 * ⚠️ MEASURED AGAINST WHAT LEAVES THE BANK — the payable figure, VAT and
 * freight and all — NOT against the net. A budget at this size of business is a
 * cash question, and whether the input VAT is genuinely reclaimable at CocoZuri
 * is tied up in the unanswered 7%-versus-18% question (`cocozuri_ops_plan.md`
 * §4.5). Measuring the net would quietly understate every budget by the VAT.
 * The screen says which reading it is using, so it can be changed on a word
 * from the owner rather than on a guess.
 *
 * ⚠️ ONLY APPROVED PURCHASES COUNT. A draft is somebody thinking about it, and
 * a cancelled one never happened — the same rule as "only an issued invoice is
 * owed".
 */
export function budgetUsage(budget: CzBudget, purchases: CzPurchase[]): CzBudgetUsage {
  const mine = purchases.filter((p) => matchesBudget(budget, p));
  const spent = round2(
    mine.reduce(
      (t, p) => t + purchaseTotals(p.lines, p.vatRate, p.taxInclusive, p.freightAmount).payable,
      0,
    ),
  );
  return {
    budget,
    spent,
    remaining: round2(budget.amount - spent),
    over: spent > budget.amount + 0.005,
    count: mine.length,
    live: budget.status === "approved",
  };
}

/**
 * Does this purchase belong to this budget?
 *
 * ⚠️ IT IS NOT ENOUGH THAT SOMEBODY TICKED IT. A purchase explicitly attached to
 * the budget still has to fall inside the period, and in the place, that the
 * budget covers — otherwise January's spend could be charged to March's budget
 * by picking the wrong row from a list.
 */
export function matchesBudget(budget: CzBudget, p: CzPurchase): boolean {
  if (p.status !== "approved") return false;
  if (p.purchasedOn < budget.startsOn || p.purchasedOn > budget.endsOn) return false;
  if (budget.locationId != null && p.locationId !== budget.locationId) return false;
  // An explicit link wins over nothing; an unlinked purchase in the window and
  // the place still counts, because that is what the money was actually spent on.
  return p.budgetId == null || p.budgetId === budget.id;
}

/** The budgets a purchase could sensibly be put against — approved, covering
 *  its date and its place. Offered rather than typed, so the wrong one is
 *  harder to pick than the right one. */
export function budgetsFor(budgets: CzBudget[], on: string, locationId: number): CzBudget[] {
  return budgets.filter(
    (b) =>
      b.status === "approved" &&
      on >= b.startsOn &&
      on <= b.endsOn &&
      (b.locationId == null || b.locationId === locationId),
  );
}

/* ------------------------------------------------------------------ *
 * What stops a purchase going through
 * ------------------------------------------------------------------ */

/**
 * Everything wrong with a purchase, in sentences.
 *
 * ⚠️ IT REFUSES, IT DOES NOT REPAIR. Every one of these is a thing only a person
 * knows — whether the price included the VAT, who is owed the money, what was
 * actually bought. Filling any of them in on somebody's behalf would put a
 * figure in the accounts that nobody has ever agreed to.
 */
export function purchaseBlockers(p: {
  lines: CzPurchaseLine[];
  vatRate: number;
  taxInclusive: boolean | null;
  paidFrom: CzPaidFrom;
  paidBy: string | null;
  paidByPersonId: number | null;
  freightAmount: number;
}): string[] {
  const out: string[] = [];
  if (p.lines.length === 0) out.push("Nothing has been listed as bought.");
  if (p.lines.some((l) => n(l.qty) <= 0)) out.push("A line has no quantity.");
  if (p.lines.some((l) => n(l.unitPrice) < 0)) out.push("A line has a negative price.");
  if (n(p.freightAmount) < 0) out.push("The transit cost cannot be negative.");
  if (n(p.vatRate) > 0 && p.taxInclusive == null) {
    out.push(
      `It carries VAT at ${n(p.vatRate)}% and nobody has said whether the prices include it. The same figure is either +VAT or includes-VAT, and the difference is real money.`,
    );
  }
  if (p.paidFrom === "own_money" && !p.paidBy?.trim() && p.paidByPersonId == null) {
    out.push("Somebody paid for this personally and is owed the money back — say who.");
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Small display helpers
 * ------------------------------------------------------------------ */

export function paidFromLabel(k: CzPaidFrom): string {
  return CZ_PAID_FROM.find((p) => p.key === k)?.label ?? k;
}

/** Who it came from, in one phrase: the vendor on file, else what was typed,
 *  else said plainly. ⚠️ "Not named" is a legitimate answer here and is never
 *  dressed up as an error — see the note on `vendorId`. */
export function supplierLabel(p: Pick<CzPurchase, "vendorName" | "supplierName">): string {
  return p.vendorName?.trim() || p.supplierName?.trim() || "Not named";
}

/** The first and last day of the month `iso` falls in — a budget's usual shape. */
export function budgetMonth(iso: string): { from: string; to: string } {
  const d = new Date(`${iso}T00:00:00Z`);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const pad = (v: number) => String(v).padStart(2, "0");
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return { from: `${y}-${pad(m + 1)}-01`, to: `${y}-${pad(m + 1)}-${pad(last)}` };
}

/* ------------------------------------------------------------------ *
 * Into the books
 *
 * ⚠️ NOTHING HERE WRITES ANYTHING. It builds the lines; `postVoucher()` in
 * `ledger-post.ts` is the one door into `gl_entries`, and the lines are built
 * here so a test can hold them to the ledger's first rule directly.
 * ------------------------------------------------------------------ */

export type CzBuyAccounts = {
  /** Where the goods land as an asset — 1150 Stock in the shared chart. */
  stock: number;
  /** VAT paid on purchases, reclaimable. -1 when the chart has no such account,
   *  which only matters once something is actually rated. */
  vatInput: number;
  /** Trade creditors. */
  payable: number;
  bank: number;
  cash: number | null;
};

/** One line of a voucher, in the shape `postVoucher` takes. Kept structural
 *  rather than importing the ledger's type, so the client half stays free of
 *  the ledger entirely. */
export type CzBuyVoucherLine = {
  accountId: number;
  debit: number;
  credit: number;
  partyType?: string | null;
  party?: string | null;
  remarks?: string | null;
};

/**
 * What a purchase does to the books.
 *
 *   Dr  Stock                  the LANDED cost — goods net of VAT, plus freight
 *     Dr  VAT recoverable          only when something is actually rated
 *       Cr  whichever side paid    the whole amount payable
 *
 * ⚠️ FREIGHT IS PART OF THE STOCK, NOT AN EXPENSE. That is the entire point of
 * note #21 — "transit cost → supplier". Booking it to a carriage expense would
 * make the almonds look cheaper than they were and every batch costed from them
 * wrong in the same direction.
 *
 * ⚠️ VAT IS NEVER PART OF THE COST when it is reclaimable, which is why the
 * stock line is the NET. The same rule as the selling side, where VAT is never
 * income.
 *
 * ⚠️ THE CREDIT SIDE IS WHOEVER IS ACTUALLY OUT OF POCKET, and `own_money` is
 * the case the owner named: somebody bought it personally, so the business owes
 * THAT PERSON, not the supplier and not the bank. Crediting the bank for money
 * that never left it would be a lie in the accounts and would leave a member of
 * staff quietly unpaid.
 */
export function purchaseVoucherLines(
  purchase: Pick<CzPurchase, "lines" | "vatRate" | "taxInclusive" | "freightAmount" | "paidFrom" | "paidBy" | "reference" | "vendorName" | "supplierName">,
  accounts: CzBuyAccounts,
): CzBuyVoucherLine[] {
  const t = purchaseTotals(purchase.lines, purchase.vatRate, purchase.taxInclusive, purchase.freightAmount);
  const out: CzBuyVoucherLine[] = [
    {
      accountId: accounts.stock,
      debit: t.landed,
      credit: 0,
      remarks:
        t.freight > 0
          ? `${purchase.reference} — goods ${t.net.toLocaleString("en-GB")} + transit ${t.freight.toLocaleString("en-GB")}`
          : purchase.reference,
    },
  ];
  // ⚠️ No line at all when there is no VAT. A nil VAT line would put empty rows
  // in the books for ever, and "no VAT invoice" is a fact about the purchase
  // rather than an entry in the ledger.
  if (t.vat !== 0) {
    out.push({
      accountId: accounts.vatInput,
      debit: t.vat,
      credit: 0,
      remarks: `VAT at ${purchase.vatRate}% · ${purchase.reference}`,
    });
  }

  const owedTo =
    purchase.paidFrom === "own_money"
      ? (purchase.paidBy?.trim() || null)
      : (purchase.vendorName?.trim() || purchase.supplierName?.trim() || null);

  const creditAccount =
    purchase.paidFrom === "cash"
      ? (accounts.cash ?? accounts.bank)
      : purchase.paidFrom === "bank"
        ? accounts.bank
        : accounts.payable;

  out.push({
    accountId: creditAccount,
    debit: 0,
    credit: t.payable,
    // Only a liability carries a party — cash and bank are our own accounts and
    // giving them a supplier would put a name on a statement that is not one.
    partyType: creditAccount === accounts.payable ? (purchase.paidFrom === "own_money" ? "Person" : "Supplier") : null,
    party: creditAccount === accounts.payable ? owedTo : null,
    remarks: purchase.paidFrom === "own_money" ? `${purchase.reference} — paid personally, owed back` : purchase.reference,
  });
  return out;
}

/** Do a set of lines balance? The ledger's first rule, checked here too so a
 *  test can hold the line-builder to it directly. */
export function buyLinesBalance(lines: CzBuyVoucherLine[]): boolean {
  const r2 = (v: number) => Math.round(v * 100) / 100;
  return r2(lines.reduce((t, l) => t + l.debit, 0)) === r2(lines.reduce((t, l) => t + l.credit, 0));
}

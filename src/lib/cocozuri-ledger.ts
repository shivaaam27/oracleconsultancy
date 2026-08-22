import { sb } from "@/db/supabase";
import { cocozuriCompany, getInvoiceByNumber, listInvoices, listReceipts } from "@/lib/cocozuri";
import { listAccounts, defaultAccount, hasChart } from "@/lib/ledger-accounts";
import { postVoucher, unpostVoucher, voucherStateOf, entriesForVoucher } from "@/lib/ledger-post";
import {
  invoiceVoucherLines, receiptVoucherLines,
  type CzInvoice, type CzPostingAccounts, type CzReceipt,
} from "@/lib/cocozuri-shared";
import { getPurchase, listPurchases } from "@/lib/cocozuri-buy";
import { getReturn, listReturns, returnScrapValue } from "@/lib/cocozuri-return";
import { lossReasonLabel, type CzReturn } from "@/lib/cocozuri-return-shared";
import { costOfSalesFor, stocktakeValueFor } from "@/lib/cocozuri-profit";
import { periodVoucherId } from "@/lib/cocozuri-profit-shared";
import { getPayment } from "@/lib/cocozuri-pay";
import { getCounterSale } from "@/lib/cocozuri-counter";
import { counterVoucherLines } from "@/lib/cocozuri-counter-shared";
import { leavesSomethingOwed, paymentVoucherLines } from "@/lib/cocozuri-pay-shared";
import {
  purchaseBlockers, purchaseTotals, purchaseVoucherLines,
  type CzBuyAccounts, type CzPurchase,
} from "@/lib/cocozuri-buy-shared";
import type { GlAccount } from "@/lib/ledger-shared";

/* ------------------------------------------------------------------ *
 * CocoZuri Phase 5 — into the books.
 *
 * ⚠️ NOTHING HERE WRITES TO `gl_entries`. Every posting goes through
 * `postVoucher()` and every reversal through `unpostVoucher()`, both in
 * `ledger-post.ts` — the one door, and the same rule the PES module and the
 * recruitment desk follow. A second insert would be a second set of books, and
 * the balance check, the frozen rate and the posted-once guard all live behind
 * that door.
 *
 * ⚠️ SERVER ONLY. The line-building is pure and lives in `cocozuri-shared.ts`
 * where it is tested; this file is the plumbing that finds the accounts and
 * calls the door.
 *
 * The five ledger rules this obeys, in the order they bite:
 *   1. every voucher balances — proven in the tests on `invoiceVoucherLines`;
 *   2. a posted entry is never edited — there is no update path here, only
 *      `postVoucher` and `unpostVoucher`;
 *   3. balances are derived — nothing here stores one;
 *   4. base currency TZS, rate frozen — handed to `postVoucher`, which refuses
 *      foreign money with no rate rather than guessing;
 *   5. posting is explicit — it happens when somebody presses Post, not
 *      silently when an invoice is raised.
 * ------------------------------------------------------------------ */

/** ⚠️ Named for this module, not "Sales Invoice". The voucher type is how the
 *  general ledger is read back, and CocoZuri's invoices should be findable as
 *  their own thing rather than mixed in with the trading module's. */
export const CZ_VOUCHER = {
  invoice: "CocoZuri Invoice",
  creditNote: "CocoZuri Credit Note",
  receipt: "CocoZuri Receipt",
  /** Manufacturing Stage 2 — what was bought. */
  purchase: "CocoZuri Purchase",
  /** Manufacturing Stage 6 — what was thrown away. */
  writeOff: "CocoZuri Write-off",
  /** Manufacturing Stage 7 — the cost of what was sold, one voucher a month. */
  costOfSales: "CocoZuri Cost of Sales",
  /** Manufacturing Stage 8 — money out to suppliers and to people. */
  payment: "CocoZuri Payment",
  /** Manufacturing Stage 8 — what a stock-take found, one voucher a month. */
  stocktake: "CocoZuri Stock-take",
  /** Manufacturing Stage 5b — sold over a counter, paid there and then. */
  counterSale: "CocoZuri Counter Sale",
} as const;

/** The account number the sale lands on when nobody has said otherwise — 4100
 *  Sales in the shared chart template. ⚠️ A DEFAULT, NOT A RULE: the setting
 *  below overrides it, because a company may want chocolate sales apart from
 *  everything else. */
const SALES_ACCOUNT_NUMBER = "4100";
const SALES_SETTING = "cocozuri.salesAccount";

export type AccountSet = CzPostingAccounts & { bank: number; cash: number | null };

export type ResolveResult =
  | { ok: true; accounts: AccountSet; all: GlAccount[] }
  | { ok: false; error: string; needsChart?: boolean };

/**
 * Find the four accounts a CocoZuri document needs.
 *
 * ⚠️ IT REFUSES RATHER THAN GUESSES. `defaultAccount` returns null instead of
 * picking something that looks close, and so does this: a posting engine that
 * guesses which account to use is worse than one that will not run. Every
 * failure says exactly which account is missing and what to do about it.
 */
export async function resolveAccounts(companyId: number): Promise<ResolveResult> {
  if (!(await hasChart(companyId))) {
    return {
      ok: false,
      needsChart: true,
      error: "Cocozuri has no chart of accounts yet. Set one up on the Ledger before posting anything.",
    };
  }

  const all = await listAccounts(companyId, { includeArchived: false });
  const [receivable, vatOutput, bank, cash] = await Promise.all([
    defaultAccount(companyId, "receivable"),
    defaultAccount(companyId, "vat_output"),
    defaultAccount(companyId, "bank"),
    defaultAccount(companyId, "cash"),
  ]);

  if (!receivable) return { ok: false, error: "No account is marked as trade debtors (the 'receivable' role)." };
  if (!bank) return { ok: false, error: "No account is marked as the bank (the 'bank' role)." };

  // The sale's account: what the owner chose, else 4100, else nothing.
  const { data: setting } = await sb.from("settings").select("value").eq("key", SALES_SETTING).maybeSingle();
  const chosen = (setting?.value as string | null)?.trim();
  const sales =
    (chosen ? all.find((a) => !a.isGroup && (a.number === chosen || String(a.id) === chosen)) : null) ??
    all.find((a) => !a.isGroup && a.number === SALES_ACCOUNT_NUMBER) ??
    null;
  if (!sales) {
    return {
      ok: false,
      error: chosen
        ? `The sales account is set to "${chosen}", and there is no postable account with that number.`
        : `No account numbered ${SALES_ACCOUNT_NUMBER} (Sales) to post the income to. Set "${SALES_SETTING}" to the account number you want.`,
    };
  }
  // ⚠️ VAT only matters when something is actually rated. A zero-rated book
  // never needs the account, so its absence is not an error until it is.
  return {
    ok: true,
    all,
    accounts: {
      receivable: receivable.id,
      sales: sales.id,
      vatOutput: vatOutput?.id ?? -1,
      bank: bank.id,
      cash: cash?.id ?? null,
    },
  };
}

/* --------------------------- buying (Stage 2) --------------------------- */

/** The stock account when nobody has said otherwise — 1150 in the shared chart
 *  template, which carries `accountType: "Stock"` and no role of its own. */
const STOCK_ACCOUNT_NUMBER = "1150";
const STOCK_SETTING = "cocozuri.stockAccount";

export type ResolveBuyResult =
  | { ok: true; accounts: CzBuyAccounts; all: GlAccount[] }
  | { ok: false; error: string; needsChart?: boolean };

/**
 * Find the accounts a purchase needs.
 *
 * ⚠️ IT REFUSES RATHER THAN GUESSES, exactly as `resolveAccounts` does. There is
 * no `stock` ROLE in the chart — the template numbers it 1150 and types it
 * "Stock" but marks it for nothing — so it is found by type, then by number,
 * then by a setting the owner types. Never by "the one that looks closest".
 */
export async function resolveBuyAccounts(companyId: number): Promise<ResolveBuyResult> {
  if (!(await hasChart(companyId))) {
    return {
      ok: false,
      needsChart: true,
      error: "Cocozuri has no chart of accounts yet. Set one up on the Ledger before posting anything.",
    };
  }
  const all = await listAccounts(companyId, { includeArchived: false });
  const [payable, vatInput, bank, cash] = await Promise.all([
    defaultAccount(companyId, "payable"),
    defaultAccount(companyId, "vat_input"),
    defaultAccount(companyId, "bank"),
    defaultAccount(companyId, "cash"),
  ]);
  if (!payable) return { ok: false, error: "No account is marked as trade creditors (the 'payable' role)." };
  if (!bank) return { ok: false, error: "No account is marked as the bank (the 'bank' role)." };

  const { data: setting } = await sb.from("settings").select("value").eq("key", STOCK_SETTING).maybeSingle();
  const chosen = (setting?.value as string | null)?.trim();
  const stock =
    (chosen ? all.find((a) => !a.isGroup && (a.number === chosen || String(a.id) === chosen)) : null) ??
    all.find((a) => !a.isGroup && a.accountType === "Stock") ??
    all.find((a) => !a.isGroup && a.number === STOCK_ACCOUNT_NUMBER) ??
    null;
  if (!stock) {
    return {
      ok: false,
      error: chosen
        ? `The stock account is set to "${chosen}", and there is no postable account with that number.`
        : `No stock account (type "Stock", or numbered ${STOCK_ACCOUNT_NUMBER}) to hold what was bought. Set "${STOCK_SETTING}" to the account number you want.`,
    };
  }
  // ⚠️ VAT only matters when something is actually rated, so a missing input-VAT
  // account is not an error until it is — same as the selling side.
  return {
    ok: true,
    all,
    accounts: { stock: stock.id, vatInput: vatInput?.id ?? -1, payable: payable.id, bank: bank.id, cash: cash?.id ?? null },
  };
}

/**
 * Put a purchase in the books.
 *
 * ⚠️ ONLY AN APPROVED PURCHASE POSTS. A draft is somebody thinking about it and
 * a cancelled one has already been taken back off the shelf. The same rule as
 * "only an issued invoice goes in the books" — and it is also why approving is
 * what moves the stock, so the two ledgers can never disagree about whether the
 * delivery happened.
 */
export async function postPurchase(purchaseId: number, by = "web-ui"): Promise<{ ok: boolean; error?: string }> {
  const company = await cocozuriCompany();
  if (!company) return { ok: false, error: "Cocozuri is not in the company list." };

  const purchase = await getPurchase(purchaseId);
  if (!purchase) return { ok: false, error: "That purchase does not exist." };
  if (purchase.status !== "approved") {
    return { ok: false, error: `${purchase.reference} is a ${purchase.status}. Only an approved purchase goes in the books.` };
  }
  const blockers = purchaseBlockers(purchase);
  if (blockers.length) return { ok: false, error: blockers[0] };

  const res = await resolveBuyAccounts(company.id);
  if (!res.ok) return { ok: false, error: res.error };

  const lines = purchaseVoucherLines(purchase, res.accounts);
  // ⚠️ Caught HERE with a sentence somebody can act on, rather than as a
  // foreign-key error from `postVoucher` three layers down.
  if (lines.some((l) => l.accountId === -1)) {
    return {
      ok: false,
      error: `${purchase.reference} carries VAT at ${purchase.vatRate}% and no account is marked as VAT recoverable (the 'vat_input' role).`,
    };
  }

  return postVoucher({
    companyId: company.id,
    voucherType: CZ_VOUCHER.purchase,
    voucherId: purchase.id,
    voucherNo: purchase.reference,
    postingDate: purchase.purchasedOn,
    lines,
    // ⚠️ Handed over as it stands. A foreign-currency purchase with no rate is
    // refused by `postVoucher` rather than quietly recorded as shillings.
    currency: purchase.currency,
    exRate: purchase.exRate,
    remarks: purchase.vendorName || purchase.supplierName || null,
    createdBy: by,
    accounts: res.all,
  });
}

/** Take a purchase back out — by writing a reversal, never by erasing. */
export async function unpostPurchase(
  purchaseId: number, reason?: string | null, by = "web-ui",
): Promise<{ ok: boolean; error?: string }> {
  const company = await cocozuriCompany();
  if (!company) return { ok: false, error: "Cocozuri is not in the company list." };
  return unpostVoucher({
    companyId: company.id,
    voucherType: CZ_VOUCHER.purchase,
    voucherId: purchaseId,
    reason: reason ?? null,
    createdBy: by,
  });
}

/** Whether a purchase has a live posting — used by `cancelPurchase` to refuse a
 *  cancellation that would take the stock out and leave the creditor standing. */
export async function purchaseIsPosted(purchaseId: number): Promise<boolean> {
  const company = await cocozuriCompany();
  if (!company) return false;
  const entries = await entriesForVoucher(company.id, CZ_VOUCHER.purchase, purchaseId);
  return entries.some((e) => !e.isReversal) && !entries.some((e) => e.isReversal);
}

/* ------------------ writing stock off (Stage 6) ------------------ */

/** Where an abnormal loss lands when nobody has said otherwise — 6930 in the
 *  shared chart template. ⚠️ It sits under "Other", NOT under cost of sales:
 *  breakage is not part of what it costs to make a bar, and burying it there
 *  would make gross profit read BETTER the more stock gets damaged. */
const LOSS_ACCOUNT_NUMBER = "6930";
const LOSS_SETTING = "cocozuri.lossAccount";

export type ResolveWriteOffResult =
  | { ok: true; accounts: { loss: number; stock: number }; all: GlAccount[] }
  | { ok: false; error: string; needsChart?: boolean };

/**
 * Find the two accounts a write-off needs.
 *
 * ⚠️ IT REFUSES RATHER THAN GUESSES, like every other resolver here. There is no
 * `loss` ROLE in the chart, so it is found by a setting, then by number — never
 * by "the expense account that looks closest". A write-off posted to the wrong
 * expense is a number somebody manages the factory by, pointing at the wrong
 * thing.
 */
export async function resolveWriteOffAccounts(companyId: number): Promise<ResolveWriteOffResult> {
  const buy = await resolveBuyAccounts(companyId);
  if (!buy.ok) return { ok: false, error: buy.error, needsChart: buy.needsChart };

  const { data: setting } = await sb.from("settings").select("value").eq("key", LOSS_SETTING).maybeSingle();
  const chosen = (setting?.value as string | null)?.trim();
  const loss =
    (chosen ? buy.all.find((a) => !a.isGroup && (a.number === chosen || String(a.id) === chosen)) : null) ??
    buy.all.find((a) => !a.isGroup && a.number === LOSS_ACCOUNT_NUMBER) ??
    null;
  if (!loss) {
    return {
      ok: false,
      error: chosen
        ? `The write-off account is set to "${chosen}", and there is no postable account with that number.`
        : `No account numbered ${LOSS_ACCOUNT_NUMBER} (Stock written off) to charge the loss to. Add it on the chart of accounts — re-running the template adds it — or set "${LOSS_SETTING}" to the account number you want.`,
    };
  }
  return { ok: true, all: buy.all, accounts: { loss: loss.id, stock: buy.accounts.stock } };
}

/**
 * Put a write-off in the books: **Dr stock written off · Cr stock.**
 *
 * ⚠️ ONLY A SETTLED RETURN POSTS. Anything still on the bench is stock we might
 * yet repack and sell, so the loss is not final. It is the same rule as "only an
 * approved purchase" and "only an issued invoice" — and it is also what keeps
 * this simple, because a document that could post twice as more of it was thrown
 * would need a posting per pass.
 *
 * ⚠️ IT REFUSES A LOSS IT CANNOT VALUE IN FULL, and names what it cannot value.
 * Posting the part it knows would understate the loss silently, which is the one
 * failure nobody would ever notice.
 *
 * ⚠️ THE OTHER HALF OF NOTE #11 — "cost value, from the debtor account" — IS NOT
 * POSTED HERE, AND MUST NOT BE. Nothing has ever relieved the stock account for
 * a sale (cost of goods sold arrives at Stage 7), so 1150 still carries the cost
 * of every bar ever sold. Putting a returned bar's cost BACK would count it
 * twice. Writing damaged stock OFF is different and correct: that value really
 * is sitting in 1150, and it really has gone.
 */
export async function postWriteOff(returnId: number, by = "web-ui"): Promise<{ ok: boolean; error?: string }> {
  const company = await cocozuriCompany();
  if (!company) return { ok: false, error: "Cocozuri is not in the company list." };

  const r = await getReturn(returnId);
  if (!r) return { ok: false, error: "That return does not exist." };
  if (r.status === "cancelled") return { ok: false, error: `${r.reference} was cancelled.` };
  if (r.status !== "settled") {
    return {
      ok: false,
      error: `${r.reference} is still being looked at. Finish sorting it first — what is on the bench might still be sold.`,
    };
  }
  const value = await returnScrapValue(r);
  if (value.lines.length === 0) {
    return { ok: false, error: `Nothing was thrown away on ${r.reference}, so there is nothing to write off.` };
  }
  if (!value.complete) {
    return {
      ok: false,
      error: `What was thrown away cannot be valued in full — nothing has ever been bought or made at a known cost for ${value.unknown.slice(0, 3).join(", ")}. Posting the rest would understate the loss.`,
    };
  }
  if (value.value <= 0) {
    return { ok: false, error: `What was thrown away on ${r.reference} costs nothing on the books, so there is nothing to post.` };
  }

  const res = await resolveWriteOffAccounts(company.id);
  if (!res.ok) return { ok: false, error: res.error };

  return postVoucher({
    companyId: company.id,
    voucherType: CZ_VOUCHER.writeOff,
    voucherId: r.id,
    voucherNo: r.reference,
    postingDate: r.settledOn ?? r.onDate,
    lines: [
      { accountId: res.accounts.loss, debit: value.value, credit: 0, remarks: lossReasonLabel(r.lossKind) },
      { accountId: res.accounts.stock, debit: 0, credit: value.value },
    ],
    remarks: [lossReasonLabel(r.lossKind), r.lossNote].filter(Boolean).join(" — ") || null,
    createdBy: by,
    accounts: res.all,
  });
}

/** Take a write-off back out — by writing a reversal, never by erasing. */
export async function unpostWriteOff(
  returnId: number, reason?: string | null, by = "web-ui",
): Promise<{ ok: boolean; error?: string }> {
  const company = await cocozuriCompany();
  if (!company) return { ok: false, error: "Cocozuri is not in the company list." };
  return unpostVoucher({
    companyId: company.id,
    voucherType: CZ_VOUCHER.writeOff,
    voucherId: returnId,
    reason: reason ?? null,
    createdBy: by,
  });
}

/** Whether a write-off has a live posting — used by `cancelReturn` to refuse a
 *  cancellation that would put the stock back and leave the loss standing. */
export async function writeOffIsPosted(returnId: number): Promise<boolean> {
  const company = await cocozuriCompany();
  if (!company) return false;
  const entries = await entriesForVoucher(company.id, CZ_VOUCHER.writeOff, returnId);
  return entries.some((e) => !e.isReversal) && !entries.some((e) => e.isReversal);
}

export async function writeOffState(returnId: number): Promise<BooksState> {
  const company = await cocozuriCompany();
  if (!company) return "unposted";
  return voucherStateOf(company.id, CZ_VOUCHER.writeOff, returnId);
}

/* ------------------ the cost of what was sold (Stage 7) ------------------ */

/** 5100 in the shared chart, typed "Cost of Goods Sold". */
const COGS_ACCOUNT_NUMBER = "5100";
const COGS_SETTING = "cocozuri.cogsAccount";

export type ResolveCogsResult =
  | { ok: true; accounts: { cogs: number; stock: number }; all: GlAccount[] }
  | { ok: false; error: string; needsChart?: boolean };

/** ⚠️ Found by type, then number, then a setting — and it REFUSES rather than
 *  guesses, like every other resolver here. */
export async function resolveCogsAccounts(companyId: number): Promise<ResolveCogsResult> {
  const buy = await resolveBuyAccounts(companyId);
  if (!buy.ok) return { ok: false, error: buy.error, needsChart: buy.needsChart };

  const { data: setting } = await sb.from("settings").select("value").eq("key", COGS_SETTING).maybeSingle();
  const chosen = (setting?.value as string | null)?.trim();
  const cogs =
    (chosen ? buy.all.find((a) => !a.isGroup && (a.number === chosen || String(a.id) === chosen)) : null) ??
    buy.all.find((a) => !a.isGroup && a.accountType === "Cost of Goods Sold" && a.number === COGS_ACCOUNT_NUMBER) ??
    buy.all.find((a) => !a.isGroup && a.number === COGS_ACCOUNT_NUMBER) ??
    null;
  if (!cogs) {
    return {
      ok: false,
      error: chosen
        ? `The cost-of-sales account is set to "${chosen}", and there is no postable account with that number.`
        : `No account numbered ${COGS_ACCOUNT_NUMBER} (Cost of goods sold). Set "${COGS_SETTING}" to the account number you want.`,
    };
  }
  return { ok: true, all: buy.all, accounts: { cogs: cogs.id, stock: buy.accounts.stock } };
}

/**
 * Post one month's cost of sales: **Dr 5100 Cost of goods sold · Cr 1150 Stock.**
 *
 * ⚠️ THIS IS WHAT MAKES THE PROFIT AND LOSS REAL. Until it runs, selling posts
 * Dr debtors · Cr sales · Cr VAT and touches stock not at all — so 1150 grows
 * for ever and the P&L shows revenue with no cost against it. Stage 6 deferred
 * the cost half of a sales return to here for exactly this reason.
 *
 * ⚠️ AND A RETURN NEEDS NO SPECIAL CASE. Goods coming back are a positive
 * movement, so they reduce the period's cost of sales by themselves. That is the
 * whole of note #11's "② cost value", and it is why it had to wait for this.
 *
 * ⚠️ ONE VOUCHER PER MONTH, filed under a derived id (`202608`), so the same
 * month can never be posted twice — `postVoucher` refuses a second one.
 *
 * ⚠️ IT REFUSES A PERIOD IT CANNOT VALUE IN FULL, and names what it cannot.
 * Posting the part it knows would understate the cost of sales, which overstates
 * profit — the one direction of error nobody ever notices.
 *
 * ⚠️ STOCK-TAKE DIFFERENCES ARE NOT IN IT. A count that finds twelve missing is
 * a real change in what the company owns, but it is not a cost of selling
 * anything. Where it belongs is Stage 8's work, and the screen says so rather
 * than folding it in quietly.
 */
export async function postCostOfSales(
  year: number, month: number, by = "web-ui",
): Promise<{ ok: boolean; error?: string }> {
  const company = await cocozuriCompany();
  if (!company) return { ok: false, error: "Cocozuri is not in the company list." };

  const cos = await costOfSalesFor(year, month);
  if (cos.lines.length === 0) {
    return { ok: false, error: `Nothing was sold in ${cos.from.slice(0, 7)}, so there is no cost of sales to post.` };
  }
  if (!cos.complete) {
    return {
      ok: false,
      error: `What was sold cannot be valued in full — nothing has ever been bought or made at a known cost for ${cos.unknown.slice(0, 3).join(", ")}${cos.unknown.length > 3 ? ` and ${cos.unknown.length - 3} more` : ""}. Posting the rest would understate the cost and overstate the profit.`,
    };
  }
  if (cos.value === 0) {
    return { ok: false, error: `What was sold in ${cos.from.slice(0, 7)} costs nothing on the books, so there is nothing to post.` };
  }
  /* ⚠️ A NEGATIVE MONTH IS POSSIBLE AND IS NOT AN ERROR: more can come back than
     went out in a short period. The sides are swapped rather than a negative
     amount being written, exactly as a credit note swaps them. */
  const amount = Math.abs(cos.value);
  const backwards = cos.value < 0;

  const res = await resolveCogsAccounts(company.id);
  if (!res.ok) return { ok: false, error: res.error };

  return postVoucher({
    companyId: company.id,
    voucherType: CZ_VOUCHER.costOfSales,
    voucherId: periodVoucherId(year, month),
    voucherNo: `COS-${cos.from.slice(0, 7)}`,
    postingDate: cos.to,
    lines: backwards
      ? [
          { accountId: res.accounts.stock, debit: amount, credit: 0 },
          { accountId: res.accounts.cogs, debit: 0, credit: amount },
        ]
      : [
          { accountId: res.accounts.cogs, debit: amount, credit: 0 },
          { accountId: res.accounts.stock, debit: 0, credit: amount },
        ],
    remarks: `Cost of what left the shelf in ${cos.from.slice(0, 7)}${backwards ? " (more came back than went out)" : ""}`,
    createdBy: by,
    accounts: res.all,
  });
}

/** Take a month's cost of sales back out — a reversal, never an erasure. */
export async function unpostCostOfSales(
  year: number, month: number, reason?: string | null, by = "web-ui",
): Promise<{ ok: boolean; error?: string }> {
  const company = await cocozuriCompany();
  if (!company) return { ok: false, error: "Cocozuri is not in the company list." };
  return unpostVoucher({
    companyId: company.id,
    voucherType: CZ_VOUCHER.costOfSales,
    voucherId: periodVoucherId(year, month),
    reason: reason ?? null,
    createdBy: by,
  });
}

export async function costOfSalesState(year: number, month: number): Promise<BooksState> {
  const company = await cocozuriCompany();
  if (!company) return "unposted";
  return voucherStateOf(company.id, CZ_VOUCHER.costOfSales, periodVoucherId(year, month));
}

/* ------------------ money out, and the stock-take (Stage 8) ------------------ */

/** 6940 in the shared chart — kept apart from 6930 on purpose: breakage
 *  somebody saw is a different fact from stock that simply is not there. */
const STOCKTAKE_ACCOUNT_NUMBER = "6940";
const STOCKTAKE_SETTING = "cocozuri.stocktakeAccount";

/**
 * Put a payment in the books: **Dr creditors · Cr bank or cash.**
 *
 * ⚠️ THE PARTY IS THE ONE STAGE 2 CREDITED. A purchase bought with somebody's
 * own money was booked to creditors with the PERSON as the party; paying them
 * back has to find the same party, or the creditors ledger shows the person
 * still owed and the supplier in credit.
 *
 * ⚠️ AND MONEY LEAVING ANOTHER COMPANY'S ACCOUNT IS REFUSED, exactly as money
 * arriving into one is on the receipts side. The inter-company question is still
 * unanswered, and crediting Cocozuri's bank for money that left DSC's would be a
 * lie in two sets of books at once.
 */
export async function postPayment(paymentId: number, by = "web-ui"): Promise<{ ok: boolean; error?: string }> {
  const company = await cocozuriCompany();
  if (!company) return { ok: false, error: "Cocozuri is not in the company list." };

  const payment = await getPayment(paymentId);
  if (!payment) return { ok: false, error: "That payment does not exist." };
  if (payment.paidFromCompanyId != null && payment.paidFromCompanyId !== company.id) {
    return {
      ok: false,
      error: `That money left ${payment.paidFromName ?? "another company"}, not Cocozuri. Posting it here would credit a bank account the money never came out of — the inter-company question has to be settled first.`,
    };
  }
  const purchase = await getPurchase(payment.purchaseId);
  if (!purchase) return { ok: false, error: "The purchase that payment settles no longer exists." };
  if (!leavesSomethingOwed(purchase.paidFrom)) {
    return { ok: false, error: `${purchase.reference} was paid when it was bought, so there is nothing to settle.` };
  }

  const res = await resolveBuyAccounts(company.id);
  if (!res.ok) return { ok: false, error: res.error };

  // ⚠️ Out of the cash box only when the payment says so; the bank otherwise.
  const credit = /cash/i.test(payment.method ?? "") ? (res.accounts.cash ?? res.accounts.bank) : res.accounts.bank;

  const lines = paymentVoucherLines(
    payment,
    { payable: res.accounts.payable, credit },
    { name: payment.paidTo, kind: purchase.paidFrom === "own_money" ? "Person" : "Supplier" },
  );

  return postVoucher({
    companyId: company.id,
    voucherType: CZ_VOUCHER.payment,
    voucherId: payment.id,
    voucherNo: payment.reference || `PAY-${payment.id}`,
    postingDate: payment.paidOn,
    lines,
    remarks: payment.paidTo ? `Paid ${payment.paidTo}` : null,
    createdBy: by,
    accounts: res.all,
  });
}

/** Take a payment back out — a reversal, never an erasure. */
export async function unpostPayment(
  paymentId: number, reason?: string | null, by = "web-ui",
): Promise<{ ok: boolean; error?: string }> {
  const company = await cocozuriCompany();
  if (!company) return { ok: false, error: "Cocozuri is not in the company list." };
  return unpostVoucher({
    companyId: company.id,
    voucherType: CZ_VOUCHER.payment,
    voucherId: paymentId,
    reason: reason ?? null,
    createdBy: by,
  });
}

/** ⚠️ Used by `deletePayment` to refuse erasing money that is in the books. */
export async function paymentIsPosted(paymentId: number): Promise<boolean> {
  const company = await cocozuriCompany();
  if (!company) return false;
  const entries = await entriesForVoucher(company.id, CZ_VOUCHER.payment, paymentId);
  return entries.some((e) => !e.isReversal) && !entries.some((e) => e.isReversal);
}

export type ResolveStocktakeResult =
  | { ok: true; accounts: { adjust: number; stock: number }; all: GlAccount[] }
  | { ok: false; error: string; needsChart?: boolean };

/** ⚠️ Refuses rather than guesses, like every resolver here. */
export async function resolveStocktakeAccounts(companyId: number): Promise<ResolveStocktakeResult> {
  const buy = await resolveBuyAccounts(companyId);
  if (!buy.ok) return { ok: false, error: buy.error, needsChart: buy.needsChart };
  const { data: setting } = await sb.from("settings").select("value").eq("key", STOCKTAKE_SETTING).maybeSingle();
  const chosen = (setting?.value as string | null)?.trim();
  const adjust =
    (chosen ? buy.all.find((a) => !a.isGroup && (a.number === chosen || String(a.id) === chosen)) : null) ??
    buy.all.find((a) => !a.isGroup && a.number === STOCKTAKE_ACCOUNT_NUMBER) ??
    null;
  if (!adjust) {
    return {
      ok: false,
      error: chosen
        ? `The stock-take account is set to "${chosen}", and there is no postable account with that number.`
        : `No account numbered ${STOCKTAKE_ACCOUNT_NUMBER} (Stock gains and losses) to put the difference in. Re-run the chart template to add it, or set "${STOCKTAKE_SETTING}".`,
    };
  }
  return { ok: true, all: buy.all, accounts: { adjust: adjust.id, stock: buy.accounts.stock } };
}

/**
 * Put a month's stock-take differences in the books.
 *
 * ⚠️ THIS IS THE GAP STAGE 7 LEFT ON PURPOSE. A count that finds twelve missing
 * is a real change in what the company owns, but it is not the cost of selling
 * anything — so cost of sales reports it and refuses to swallow it, and this is
 * where it lands instead.
 *
 * **Short: Dr 6940 · Cr 1150. Over: Dr 1150 · Cr 6940.** A stock-take can find
 * MORE than the book said, and that is a gain, not an error.
 *
 * ⚠️ IT REFUSES A DIFFERENCE IT CANNOT VALUE, by name — the same rule as the
 * write-off and the cost of sales. Posting the part it knows would make the
 * shortfall look smaller than it is.
 */
export async function postStocktake(
  year: number, month: number, by = "web-ui",
): Promise<{ ok: boolean; error?: string }> {
  const company = await cocozuriCompany();
  if (!company) return { ok: false, error: "Cocozuri is not in the company list." };

  const run = await stocktakeValueFor(year, month);
  if (run.lines.length === 0) {
    return { ok: false, error: `No stock-take moved anything in ${run.from.slice(0, 7)}.` };
  }
  if (!run.complete) {
    return {
      ok: false,
      error: `The difference cannot be valued in full — nothing has ever been bought or made at a known cost for ${run.unknown.slice(0, 3).join(", ")}. Posting the rest would make the shortfall look smaller than it is.`,
    };
  }
  if (run.value === 0) {
    return { ok: false, error: `The stock-take differences in ${run.from.slice(0, 7)} come to nothing on the books.` };
  }

  const res = await resolveStocktakeAccounts(company.id);
  if (!res.ok) return { ok: false, error: res.error };

  const amount = Math.abs(run.value);
  const found = run.value > 0;   // more on the shelf than the book said
  return postVoucher({
    companyId: company.id,
    voucherType: CZ_VOUCHER.stocktake,
    voucherId: periodVoucherId(year, month),
    voucherNo: `STK-${run.from.slice(0, 7)}`,
    postingDate: run.to,
    lines: found
      ? [
          { accountId: res.accounts.stock, debit: amount, credit: 0 },
          { accountId: res.accounts.adjust, debit: 0, credit: amount },
        ]
      : [
          { accountId: res.accounts.adjust, debit: amount, credit: 0 },
          { accountId: res.accounts.stock, debit: 0, credit: amount },
        ],
    remarks: `Stock-take ${found ? "found more than" : "came up short against"} the book in ${run.from.slice(0, 7)}`,
    createdBy: by,
    accounts: res.all,
  });
}

export async function unpostStocktake(
  year: number, month: number, reason?: string | null, by = "web-ui",
): Promise<{ ok: boolean; error?: string }> {
  const company = await cocozuriCompany();
  if (!company) return { ok: false, error: "Cocozuri is not in the company list." };
  return unpostVoucher({
    companyId: company.id,
    voucherType: CZ_VOUCHER.stocktake,
    voucherId: periodVoucherId(year, month),
    reason: reason ?? null,
    createdBy: by,
  });
}

export async function stocktakeState(year: number, month: number): Promise<BooksState> {
  const company = await cocozuriCompany();
  if (!company) return "unposted";
  return voucherStateOf(company.id, CZ_VOUCHER.stocktake, periodVoucherId(year, month));
}

/* --------------------- over the counter (Stage 5b) --------------------- */

/**
 * Put a counter sale in the books: **Dr cash or bank · Cr sales · Cr VAT.**
 *
 * ⚠️ NO DEBTOR, and that is the whole difference from an invoice. A counter sale
 * was paid there and then; putting it through trade debtors would leave a
 * balance nobody is ever going to collect and a statement nobody can explain.
 *
 * ⚠️ NOTHING IS TAKEN IN PAYMENT HERE EITHER. The owner asked for the reports to
 * go digital, not the money — `paidBy` only decides whether the debit is the
 * cash box or the bank.
 *
 * ⚠️ AND VAT IS NEVER INCOME. The sales line is the NET; `net = gross − vat`, so
 * it balances to the cent.
 */
export async function postCounterSale(saleId: number, by = "web-ui"): Promise<{ ok: boolean; error?: string }> {
  const company = await cocozuriCompany();
  if (!company) return { ok: false, error: "Cocozuri is not in the company list." };

  const sale = await getCounterSale(saleId);
  if (!sale) return { ok: false, error: "That sale does not exist." };
  if (sale.status === "cancelled") return { ok: false, error: `${sale.reference} was cancelled.` };

  const res = await resolveAccounts(company.id);
  if (!res.ok) return { ok: false, error: res.error };

  // ⚠️ Cash in the drawer needs a cash account. Refused by name rather than
  // quietly banked — money in a drawer is not money in the bank.
  if (sale.paidBy !== "online" && res.accounts.cash == null) {
    return { ok: false, error: `${sale.reference} was paid in cash and no account is marked as the cash box. Add one before posting takings.` };
  }
  const lines = counterVoucherLines(sale, {
    cash: res.accounts.cash ?? res.accounts.bank,
    bank: res.accounts.bank,
    sales: res.accounts.sales,
    vatOutput: res.accounts.vatOutput,
  });
  if (lines.some((l) => l.accountId === -1)) {
    return {
      ok: false,
      error: `${sale.reference} carries VAT at ${sale.vatRate}% and no account is marked as VAT payable (the 'vat_output' role).`,
    };
  }

  return postVoucher({
    companyId: company.id,
    voucherType: CZ_VOUCHER.counterSale,
    voucherId: sale.id,
    voucherNo: sale.reference,
    postingDate: sale.onDate,
    lines,
    remarks: [sale.locationName, sale.customerName, sale.paymentRef].filter(Boolean).join(" · ") || null,
    createdBy: by,
    accounts: res.all,
  });
}

/** Take a counter sale back out — a reversal, never an erasure. */
export async function unpostCounterSale(
  saleId: number, reason?: string | null, by = "web-ui",
): Promise<{ ok: boolean; error?: string }> {
  const company = await cocozuriCompany();
  if (!company) return { ok: false, error: "Cocozuri is not in the company list." };
  return unpostVoucher({
    companyId: company.id,
    voucherType: CZ_VOUCHER.counterSale,
    voucherId: saleId,
    reason: reason ?? null,
    createdBy: by,
  });
}

/** ⚠️ Used by `cancelCounterSale` to refuse taking the chocolate back while the
 *  takings still stand in the books. */
export async function counterSaleIsPosted(saleId: number): Promise<boolean> {
  const company = await cocozuriCompany();
  if (!company) return false;
  const entries = await entriesForVoucher(company.id, CZ_VOUCHER.counterSale, saleId);
  return entries.some((e) => !e.isReversal) && !entries.some((e) => e.isReversal);
}

/* ------------------------------- invoices ------------------------------- */

/**
 * Put an invoice or a credit note in the books.
 *
 * ⚠️ ONLY AN ISSUED DOCUMENT POSTS. A draft has not been sent to anybody, and
 * the books are a record of what happened, not of what somebody is thinking
 * about. The same rule the Owed page follows.
 */
export async function postInvoice(invoiceId: number, by = "web-ui"): Promise<{ ok: boolean; error?: string }> {
  const company = await cocozuriCompany();
  if (!company) return { ok: false, error: "Cocozuri is not in the company list." };

  const invoice = await invoiceById(invoiceId);
  if (!invoice) return { ok: false, error: "That invoice does not exist." };
  if (invoice.status !== "issued") {
    return { ok: false, error: `${invoice.number} is a ${invoice.status}. Only an issued document goes in the books.` };
  }

  const res = await resolveAccounts(company.id);
  if (!res.ok) return { ok: false, error: res.error };

  const lines = invoiceVoucherLines(invoice, res.accounts);
  // ⚠️ Caught HERE with a sentence somebody can act on, rather than as a
  // foreign-key error from `postVoucher` three layers down.
  if (lines.some((l) => l.accountId === -1)) {
    return {
      ok: false,
      error: `${invoice.number} carries VAT at ${invoice.vatRate}% and no account is marked as VAT payable (the 'vat_output' role).`,
    };
  }

  return postVoucher({
    companyId: company.id,
    voucherType: invoice.docType === "credit_note" ? CZ_VOUCHER.creditNote : CZ_VOUCHER.invoice,
    voucherId: invoice.id,
    voucherNo: invoice.number,
    postingDate: invoice.issueDate,
    lines,
    // ⚠️ Handed over as it stands. Every invoice in the master is TZS, but the
    // airport has a USD price list and nobody has said which it is billed in
    // (plan §4.5) — so if a USD invoice ever appears, `postVoucher` refuses it
    // for want of a rate instead of quietly recording dollars as shillings.
    currency: invoice.currency,
    remarks: `${invoice.customerName}${invoice.branchName ? ` — ${invoice.branchName}` : ""}`,
    createdBy: by,
    accounts: res.all,
  });
}

/**
 * Take an invoice back out — by writing a reversal, never by erasing.
 *
 * The original entries and their mirrors both stay in the general ledger for
 * ever and net to nothing. That is the ledger's second rule, and it is the
 * whole reason `unpostVoucher` exists.
 */
export async function unpostInvoice(
  invoiceId: number, reason?: string | null, by = "web-ui",
): Promise<{ ok: boolean; error?: string }> {
  const company = await cocozuriCompany();
  if (!company) return { ok: false, error: "Cocozuri is not in the company list." };
  const invoice = await invoiceById(invoiceId);
  if (!invoice) return { ok: false, error: "That invoice does not exist." };
  return unpostVoucher({
    companyId: company.id,
    voucherType: invoice.docType === "credit_note" ? CZ_VOUCHER.creditNote : CZ_VOUCHER.invoice,
    voucherId: invoice.id,
    reason: reason ?? null,
    createdBy: by,
  });
}

/* ------------------------------- receipts ------------------------------- */

/**
 * Put a payment in the books.
 *
 * ⚠️ A PAYMENT RECEIVED INTO ANOTHER COMPANY IS REFUSED, ON PURPOSE.
 *
 * The master ledger's remarks keep saying "Cheque received in DSC", "Bank
 * Transfer to DSC" — Cocozuri raises the invoice and the money lands in DSC
 * Ltd. In Cocozuri's own books that is NOT its bank going up; it is an amount
 * owed to it by a sister company, and whether COS should carry that as an
 * inter-company balance is question §4.4, which nobody has answered.
 *
 * Posting it to Cocozuri's bank would be a lie in the accounts. Inventing an
 * inter-company account would be answering the owner's question on his behalf.
 * So the receipt is recorded, it still reduces what the customer owes — that is
 * worked out from `cz_receipts`, not from the ledger — and the posting waits
 * for an answer, with the reason on screen.
 */
export async function postReceipt(receiptId: number, by = "web-ui"): Promise<{ ok: boolean; error?: string }> {
  const company = await cocozuriCompany();
  if (!company) return { ok: false, error: "Cocozuri is not in the company list." };

  const receipt = await receiptById(receiptId);
  if (!receipt) return { ok: false, error: "That payment does not exist." };

  if (receipt.receivedIntoCompanyId != null && receipt.receivedIntoCompanyId !== company.id) {
    return {
      ok: false,
      error: `That payment was received into ${receipt.receivedIntoName ?? "another company"}, not into Cocozuri. Whether COS should carry that as an inter-company balance has not been settled — until it is, the payment stays recorded but out of the books.`,
    };
  }

  const res = await resolveAccounts(company.id);
  if (!res.ok) return { ok: false, error: res.error };

  // Cash in hand is not the bank. Everything else — cheque, transfer, mobile —
  // reaches the bank account.
  const isCash = (receipt.method ?? "").trim().toLowerCase() === "cash";
  const debit = isCash ? (res.accounts.cash ?? res.accounts.bank) : res.accounts.bank;

  const { data: cust } = await sb.from("cz_customers").select("name").eq("id", receipt.customerId).maybeSingle();

  return postVoucher({
    companyId: company.id,
    voucherType: CZ_VOUCHER.receipt,
    voucherId: receipt.id,
    voucherNo: receipt.reference || `Payment #${receipt.id}`,
    postingDate: receipt.receivedOn,
    lines: receiptVoucherLines(receipt, { debit, receivable: res.accounts.receivable }, (cust?.name as string) ?? ""),
    currency: receipt.currency,
    createdBy: by,
    accounts: res.all,
  });
}

export async function unpostReceipt(
  receiptId: number, reason?: string | null, by = "web-ui",
): Promise<{ ok: boolean; error?: string }> {
  const company = await cocozuriCompany();
  if (!company) return { ok: false, error: "Cocozuri is not in the company list." };
  return unpostVoucher({
    companyId: company.id,
    voucherType: CZ_VOUCHER.receipt,
    voucherId: receiptId,
    reason: reason ?? null,
    createdBy: by,
  });
}

/* ------------------------- what is in the books ------------------------- */

export type BooksState = "unposted" | "posted" | "reversed";

/** One document's state. */
export async function invoiceBooksState(invoice: CzInvoice): Promise<BooksState> {
  const company = await cocozuriCompany();
  if (!company) return "unposted";
  return voucherStateOf(
    company.id,
    invoice.docType === "credit_note" ? CZ_VOUCHER.creditNote : CZ_VOUCHER.invoice,
    invoice.id,
  ) as Promise<BooksState>;
}

/**
 * Which documents are in the books, for a whole list.
 *
 * ⚠️ ONE QUERY, NOT ONE PER ROW. A list of 140 invoices asking the ledger 140
 * times is how a page that felt instant becomes a page somebody complains
 * about — and the entries are already indexed by company and voucher.
 */
export async function booksStateFor(
  kinds: { invoices?: number[]; creditNotes?: number[]; receipts?: number[]; purchases?: number[]; writeOffs?: number[]; payments?: number[]; counterSales?: number[] },
): Promise<{
  invoices: Map<number, BooksState>;
  creditNotes: Map<number, BooksState>;
  receipts: Map<number, BooksState>;
  purchases: Map<number, BooksState>;
  writeOffs: Map<number, BooksState>;
  payments: Map<number, BooksState>;
  counterSales: Map<number, BooksState>;
}> {
  const empty = { invoices: new Map(), creditNotes: new Map(), receipts: new Map(), purchases: new Map(), writeOffs: new Map(), payments: new Map(), counterSales: new Map() };
  const company = await cocozuriCompany();
  if (!company) return empty;

  const { data } = await sb
    .from("gl_entries")
    .select("voucher_type,voucher_id,is_reversal")
    .eq("company_id", company.id)
    .in("voucher_type", [CZ_VOUCHER.invoice, CZ_VOUCHER.creditNote, CZ_VOUCHER.receipt, CZ_VOUCHER.purchase, CZ_VOUCHER.writeOff, CZ_VOUCHER.payment, CZ_VOUCHER.counterSale]);

  const seen = new Map<string, { live: boolean; reversed: boolean }>();
  for (const r of data ?? []) {
    const key = `${r.voucher_type}#${r.voucher_id}`;
    const cur = seen.get(key) ?? { live: false, reversed: false };
    if (r.is_reversal) cur.reversed = true; else cur.live = true;
    seen.set(key, cur);
  }
  const stateOf = (type: string, id: number): BooksState => {
    const s = seen.get(`${type}#${id}`);
    if (!s) return "unposted";
    return s.reversed ? "reversed" : "posted";
  };

  return {
    invoices: new Map((kinds.invoices ?? []).map((id) => [id, stateOf(CZ_VOUCHER.invoice, id)])),
    creditNotes: new Map((kinds.creditNotes ?? []).map((id) => [id, stateOf(CZ_VOUCHER.creditNote, id)])),
    receipts: new Map((kinds.receipts ?? []).map((id) => [id, stateOf(CZ_VOUCHER.receipt, id)])),
    purchases: new Map((kinds.purchases ?? []).map((id) => [id, stateOf(CZ_VOUCHER.purchase, id)])),
    writeOffs: new Map((kinds.writeOffs ?? []).map((id) => [id, stateOf(CZ_VOUCHER.writeOff, id)])),
    payments: new Map((kinds.payments ?? []).map((id) => [id, stateOf(CZ_VOUCHER.payment, id)])),
    counterSales: new Map((kinds.counterSales ?? []).map((id) => [id, stateOf(CZ_VOUCHER.counterSale, id)])),
  };
}

/**
 * The state of the whole module's posting: what is in, what is waiting, and
 * whether it can post at all.
 *
 * This is what the desk shows. ⚠️ It says WHY when it cannot post, because
 * "0 posted" with no explanation sends somebody looking for a bug that is
 * really an empty chart of accounts.
 */
export async function postingOverview(): Promise<{
  ready: boolean;
  reason: string | null;
  needsChart: boolean;
  posted: number;
  waiting: number;
  blocked: { number: string; why: string }[];
}> {
  const company = await cocozuriCompany();
  if (!company) return { ready: false, reason: "Cocozuri is not in the company list.", needsChart: false, posted: 0, waiting: 0, blocked: [] };

  const [res, buyRes] = await Promise.all([resolveAccounts(company.id), resolveBuyAccounts(company.id)]);
  const [invoices, receipts, purchases, returns] = await Promise.all([
    listInvoices(), listReceipts(), listPurchases(), listReturns(),
  ]);
  const issued = invoices.filter((i) => i.status === "issued");
  // ⚠️ Only APPROVED purchases are countable here. A draft has moved no stock
  // and is not waiting for anything — counting it would put a job on the desk
  // that nobody can do.
  const approved = purchases.filter((p: CzPurchase) => p.status === "approved");
  /* ⚠️ Only a SETTLED return is countable, and only one that threw something
     away. A return still on the bench might yet be repacked and sold, so its
     loss is not final — the same reasoning as a draft purchase. */
  const written = returns.filter(
    (r: CzReturn) => r.status === "settled" && r.lines.some((l) => Number(l.scrapQty) > 0),
  );
  const state = await booksStateFor({
    invoices: issued.filter((i) => i.docType === "invoice").map((i) => i.id),
    creditNotes: issued.filter((i) => i.docType === "credit_note").map((i) => i.id),
    receipts: receipts.map((r) => r.id),
    purchases: approved.map((p: CzPurchase) => p.id),
    writeOffs: written.map((r: CzReturn) => r.id),
  });

  const stateOfDoc = (i: CzInvoice) =>
    (i.docType === "credit_note" ? state.creditNotes : state.invoices).get(i.id) ?? "unposted";

  const posted =
    issued.filter((i) => stateOfDoc(i) === "posted").length +
    receipts.filter((r) => state.receipts.get(r.id) === "posted").length +
    approved.filter((p: CzPurchase) => state.purchases.get(p.id) === "posted").length +
    written.filter((r: CzReturn) => state.writeOffs.get(r.id) === "posted").length;
  const waiting =
    issued.filter((i) => stateOfDoc(i) === "unposted").length +
    receipts.filter((r) => state.receipts.get(r.id) === "unposted").length +
    approved.filter((p: CzPurchase) => state.purchases.get(p.id) === "unposted").length +
    written.filter((r: CzReturn) => state.writeOffs.get(r.id) === "unposted").length;

  // The ones that will not post even when the chart is ready, and why.
  const blocked = [
    ...receipts
      .filter((r) => r.receivedIntoCompanyId != null && r.receivedIntoCompanyId !== company.id)
      .filter((r) => state.receipts.get(r.id) !== "posted")
      .map((r) => ({
        number: r.reference || `Payment #${r.id}`,
        why: `received into ${r.receivedIntoName ?? "another company"}`,
      })),
    // ⚠️ A rated purchase where nobody has said whether the prices include the
    // VAT. Reported as blocked rather than posted at a guess — the same figure
    // is either +VAT or includes-VAT and the difference is real money.
    ...approved
      .filter((p: CzPurchase) => state.purchases.get(p.id) !== "posted")
      .filter((p: CzPurchase) => !purchaseTotals(p.lines, p.vatRate, p.taxInclusive, p.freightAmount).vatKnown)
      .map((p: CzPurchase) => ({
        number: p.reference,
        why: `nobody has said whether the ${p.vatRate}% VAT is included`,
      })),
  ];

  return {
    // ⚠️ BOTH SIDES OF THE CHART. Selling can be ready while buying is not —
    // 4100 Sales exists in the template and the stock account carries no role
    // at all — and saying "ready" on the strength of one of them would leave
    // somebody pressing a button that cannot work.
    ready: res.ok && buyRes.ok,
    reason: res.ok ? (buyRes.ok ? null : buyRes.error) : res.error,
    needsChart: (!res.ok && !!res.needsChart) || (!buyRes.ok && !!buyRes.needsChart),
    posted, waiting, blocked,
  };
}

/* ------------------------------- helpers -------------------------------- */

async function invoiceById(id: number): Promise<CzInvoice | null> {
  const { data } = await sb.from("cz_invoices").select("number").eq("id", id).maybeSingle();
  const number = data?.number as string | undefined;
  return number ? getInvoiceByNumber(number) : null;
}

async function receiptById(id: number): Promise<CzReceipt | null> {
  const all = await listReceipts();
  return all.find((r) => r.id === id) ?? null;
}

/** Whether a document has anything at all in the books — used by
 *  `deleteReceipt` to refuse a delete that would orphan a posting. */
export async function receiptIsPosted(receiptId: number): Promise<boolean> {
  const company = await cocozuriCompany();
  if (!company) return false;
  const entries = await entriesForVoucher(company.id, CZ_VOUCHER.receipt, receiptId);
  return entries.some((e) => !e.isReversal) && !entries.some((e) => e.isReversal);
}

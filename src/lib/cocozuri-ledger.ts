import { sb } from "@/db/supabase";
import { cocozuriCompany, getInvoiceByNumber, listInvoices, listReceipts } from "@/lib/cocozuri";
import { listAccounts, defaultAccount, hasChart } from "@/lib/ledger-accounts";
import { postVoucher, unpostVoucher, voucherStateOf, entriesForVoucher } from "@/lib/ledger-post";
import {
  invoiceVoucherLines, receiptVoucherLines,
  type CzInvoice, type CzPostingAccounts, type CzReceipt,
} from "@/lib/cocozuri-shared";
import { getPurchase, listPurchases } from "@/lib/cocozuri-buy";
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
  kinds: { invoices?: number[]; creditNotes?: number[]; receipts?: number[]; purchases?: number[] },
): Promise<{
  invoices: Map<number, BooksState>;
  creditNotes: Map<number, BooksState>;
  receipts: Map<number, BooksState>;
  purchases: Map<number, BooksState>;
}> {
  const empty = { invoices: new Map(), creditNotes: new Map(), receipts: new Map(), purchases: new Map() };
  const company = await cocozuriCompany();
  if (!company) return empty;

  const { data } = await sb
    .from("gl_entries")
    .select("voucher_type,voucher_id,is_reversal")
    .eq("company_id", company.id)
    .in("voucher_type", [CZ_VOUCHER.invoice, CZ_VOUCHER.creditNote, CZ_VOUCHER.receipt, CZ_VOUCHER.purchase]);

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
  const [invoices, receipts, purchases] = await Promise.all([listInvoices(), listReceipts(), listPurchases()]);
  const issued = invoices.filter((i) => i.status === "issued");
  // ⚠️ Only APPROVED purchases are countable here. A draft has moved no stock
  // and is not waiting for anything — counting it would put a job on the desk
  // that nobody can do.
  const approved = purchases.filter((p: CzPurchase) => p.status === "approved");
  const state = await booksStateFor({
    invoices: issued.filter((i) => i.docType === "invoice").map((i) => i.id),
    creditNotes: issued.filter((i) => i.docType === "credit_note").map((i) => i.id),
    receipts: receipts.map((r) => r.id),
    purchases: approved.map((p: CzPurchase) => p.id),
  });

  const stateOfDoc = (i: CzInvoice) =>
    (i.docType === "credit_note" ? state.creditNotes : state.invoices).get(i.id) ?? "unposted";

  const posted =
    issued.filter((i) => stateOfDoc(i) === "posted").length +
    receipts.filter((r) => state.receipts.get(r.id) === "posted").length +
    approved.filter((p: CzPurchase) => state.purchases.get(p.id) === "posted").length;
  const waiting =
    issued.filter((i) => stateOfDoc(i) === "unposted").length +
    receipts.filter((r) => state.receipts.get(r.id) === "unposted").length +
    approved.filter((p: CzPurchase) => state.purchases.get(p.id) === "unposted").length;

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

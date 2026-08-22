"use server";

import { revalidatePath } from "next/cache";
import {
  archiveCustomer, archiveProduct, createCustomer, createProduct,
  cancelInvoice, createInvoice, deletePrice, issueInvoice, mergeProducts, setBranches,
  setDefaultVatRate, setPrice, updateCustomer, updateProduct,
  applyCreditNote, createReceipt, createReceipts, deleteReceipt, updateReceipt,
  type CustomerInput, type ProductInput, type ReceiptInput,
} from "@/lib/cocozuri";
import {
  archiveItem, createItem, createLocation, deleteCount, recordCount, saveDay,
  updateItem, updateLocation, type StockItemInput,
} from "@/lib/cocozuri-stock";
import {
  postCostOfSales, postInvoice, postPayment, postPurchase, postReceipt, postStocktake,
  postWriteOff, purchaseIsPosted, paymentIsPosted, unpostCostOfSales, unpostInvoice,
  unpostPayment, unpostPurchase, unpostReceipt, unpostStocktake, unpostWriteOff,
  writeOffIsPosted, postCounterSale, unpostCounterSale, counterSaleIsPosted,
} from "@/lib/cocozuri-ledger";
import {
  createPayments, deletePayment, updatePayment, type PaymentInput,
} from "@/lib/cocozuri-pay";
import {
  cancelCounterSale, recordCounterSale, type CounterSaleInput,
} from "@/lib/cocozuri-counter";
import {
  approvePurchase, cancelPurchase, closeBudget, createBudget, createPurchase,
  decideBudget, deleteBudget, deletePurchase, reopenBudget, updateBudget, updatePurchase,
  type BudgetInput, type PurchaseInput,
} from "@/lib/cocozuri-buy";
import {
  createRecipe, deleteRecipe, setRecipeDefault, setRecipeStatus, updateRecipe,
  type RecipeInput,
} from "@/lib/cocozuri-recipe";
import type { CzRecipeStatus } from "@/lib/cocozuri-recipe-shared";
import {
  cancelBatch, closeBatch, openBatch, reopenBatch, updateBatch,
  type CloseBatchInput, type OpenBatchInput,
} from "@/lib/cocozuri-batch";
import {
  cancelTransfer, receiveTransfer, sendTransfer,
  type ReceiveTransferInput, type SendTransferInput,
} from "@/lib/cocozuri-transfer";
import {
  bookReturn, cancelReturn, raiseCreditNote, settleReturn,
  type BookReturnInput, type SettleReturnInput,
} from "@/lib/cocozuri-return";

/**
 * CocoZuri's write actions — thin wrappers over `lib/cocozuri.ts`.
 *
 * ⚠️ THE WRAPPERS DO NO WORK. Every rule lives in the library, which is the one
 * door: the same discipline as `createTaskCore`, `postVoucher()` and the
 * recruitment desk. An action that started making its own decisions would be a
 * second set of rules for the same tables.
 *
 * Owner-only, like the rest of the admin side — these sit behind the gate in
 * `src/proxy.ts` because `/cocozuri` is not in its exclusion list.
 */

function refresh() {
  revalidatePath("/cocozuri");
  revalidatePath("/cocozuri/products");
  revalidatePath("/cocozuri/customers");
  revalidatePath("/cocozuri/invoices");
  revalidatePath("/cocozuri/receipts");
  revalidatePath("/cocozuri/owed");
  revalidatePath("/cocozuri/statements", "layout");
  revalidatePath("/cocozuri/stock");
  revalidatePath("/cocozuri/stock/month");
  revalidatePath("/cocozuri/order");
  revalidatePath("/cocozuri/purchases");
  revalidatePath("/cocozuri/budgets");
  revalidatePath("/cocozuri/recipes", "layout");
  revalidatePath("/cocozuri/batches", "layout");
  revalidatePath("/cocozuri/transfers", "layout");
  revalidatePath("/cocozuri/returns", "layout");
  revalidatePath("/cocozuri/profit");
  revalidatePath("/cocozuri/payments");
  revalidatePath("/cocozuri/counter");
  revalidatePath("/cocozuri/trace", "layout");
  // A posting shows in the ledger too — the entries list and every report.
  revalidatePath("/ledger", "layout");
}

export async function createProductAction(input: ProductInput) {
  const res = await createProduct(input);
  if (res.ok) refresh();
  return res;
}

export async function updateProductAction(id: number, input: Partial<ProductInput>) {
  const res = await updateProduct(id, input);
  if (res.ok) refresh();
  return res;
}

export async function archiveProductAction(id: number, archived: boolean) {
  const res = await archiveProduct(id, archived);
  if (res.ok) refresh();
  return res;
}

/** ⚠️ Archives the losers, never deletes — see `mergeProducts`. */
export async function mergeProductsAction(keepId: number, mergeIds: number[]) {
  const res = await mergeProducts(keepId, mergeIds);
  if (res.ok) refresh();
  return res;
}

export async function createCustomerAction(input: CustomerInput) {
  const res = await createCustomer(input);
  if (res.ok) refresh();
  return res;
}

export async function updateCustomerAction(id: number, input: Partial<CustomerInput>) {
  const res = await updateCustomer(id, input);
  if (res.ok) refresh();
  return res;
}

export async function archiveCustomerAction(id: number, archived: boolean) {
  const res = await archiveCustomer(id, archived);
  if (res.ok) refresh();
  return res;
}

export async function setBranchesAction(customerId: number, names: string[]) {
  const res = await setBranches(customerId, names);
  if (res.ok) refresh();
  return res;
}

/** ⚠️ Always adds a row. A price is a row with a date — see `setPrice`. */
export async function setPriceAction(input: {
  productId: number;
  customerId?: number | null;
  price: number;
  currency?: string;
  effectiveFrom?: string;
  note?: string | null;
}) {
  const res = await setPrice(input);
  if (res.ok) refresh();
  return res;
}

export async function deletePriceAction(id: number) {
  const res = await deletePrice(id);
  if (res.ok) refresh();
  return res;
}

/** The fallback VAT rate. ⚠️ A setting, not a constant — nobody has yet confirmed
 *  whether 7 is right when the standard Tanzanian rate is 18. */
export async function setDefaultVatRateAction(rate: number) {
  await setDefaultVatRate(rate);
  refresh();
  return { ok: true };
}


/* ----------------------------- invoices ----------------------------- */

/** ⚠️ Freezes the customer, the VAT rate and the terms onto the invoice, and
 *  allocates its number against a unique index — see `createInvoice`. */
export async function createInvoiceAction(input: Parameters<typeof createInvoice>[0]) {
  const res = await createInvoice(input);
  if (res.ok) refresh();
  return res;
}

/** ⚠️ After this it is somebody else paperwork: an issued invoice is never
 *  edited, only answered with a credit note. */
export async function issueInvoiceAction(id: number) {
  const res = await issueInvoice(id);
  if (res.ok) refresh();
  return res;
}

export async function cancelInvoiceAction(id: number) {
  const res = await cancelInvoice(id);
  if (res.ok) refresh();
  return res;
}


/* ---------------------- money in (Phase 3) ---------------------- */

/** ⚠️ The customer comes off the INVOICE, never the form, and a draft cannot be
 *  paid — see `createReceipt`. */
export async function createReceiptAction(input: ReceiptInput) {
  const res = await createReceipt(input);
  if (res.ok) refresh();
  return res;
}

/** One cheque settling several invoices: one row each, sharing a reference.
 *  ⚠️ All or nothing — see `createReceipts`. */
export async function createReceiptsAction(rows: ReceiptInput[]) {
  const res = await createReceipts(rows);
  if (res.ok) refresh();
  return res;
}

export async function updateReceiptAction(id: number, input: Partial<ReceiptInput>) {
  const res = await updateReceipt(id, input);
  if (res.ok) refresh();
  return res;
}

/** ⚠️ A real delete, deliberately — and it must become a reversal when Phase 5
 *  starts posting receipts to the general ledger. */
export async function deleteReceiptAction(id: number) {
  const res = await deleteReceipt(id);
  if (res.ok) refresh();
  return res;
}

/** ⚠️ Only a credit note, and only at the same customer's invoice. */
export async function applyCreditNoteAction(creditNoteId: number, invoiceId: number | null) {
  const res = await applyCreditNote(creditNoteId, invoiceId);
  if (res.ok) refresh();
  return res;
}


/* -------------------- the stock book (Phase 4) -------------------- */

/** ⚠️ One row per item per day, upserted; a row of three zeros is cleared away
 *  rather than stored — see `saveDay`. */
export async function saveStockDayAction(input: Parameters<typeof saveDay>[0]) {
  const res = await saveDay(input);
  if (res.ok) refresh();
  return res;
}

/** ⚠️ Refuses a count that differs from the book without a note saying why. */
export async function recordStockCountAction(input: Parameters<typeof recordCount>[0]) {
  const res = await recordCount(input);
  if (res.ok) refresh();
  return res;
}

export async function deleteStockCountAction(id: number) {
  const res = await deleteCount(id);
  if (res.ok) refresh();
  return res;
}

export async function createStockItemAction(input: StockItemInput) {
  const res = await createItem(input);
  if (res.ok) refresh();
  return res;
}

/** ⚠️ `productId: null` deliberately UNLINKS an item from its product — which is
 *  how a wrong match made during the import gets undone. */
export async function updateStockItemAction(id: number, input: Partial<StockItemInput>) {
  const res = await updateItem(id, input);
  if (res.ok) refresh();
  return res;
}

/** ⚠️ Archived, never deleted — its movements are the history of a real shelf. */
export async function archiveStockItemAction(id: number, archived: boolean) {
  const res = await archiveItem(id, archived);
  if (res.ok) refresh();
  return res;
}

export async function createStockLocationAction(input: Parameters<typeof createLocation>[0]) {
  const res = await createLocation(input);
  if (res.ok) refresh();
  return res;
}

/** ⚠️ Includes the third column's LABEL, which is data — the shop calls it
 *  Return, the kitchen DA/SA/TA and raw materials Damage. */
export async function updateStockLocationAction(id: number, input: Parameters<typeof updateLocation>[1]) {
  const res = await updateLocation(id, input);
  if (res.ok) refresh();
  return res;
}

/* --------------------- into the books (Phase 5) --------------------- */

/**
 * ⚠️ POSTING IS EXPLICIT, and that is the ledger's fifth rule rather than an
 * oversight. Raising an invoice does not put it in the books; somebody presses
 * Post and is told what happened. Nothing lands in the accounts silently.
 */
export async function postInvoiceAction(invoiceId: number) {
  const res = await postInvoice(invoiceId);
  if (res.ok) refresh();
  return res;
}

/** ⚠️ A reversal, never an erasure — both sides stay in the general ledger. */
export async function unpostInvoiceAction(invoiceId: number, reason?: string | null) {
  const res = await unpostInvoice(invoiceId, reason);
  if (res.ok) refresh();
  return res;
}

/** ⚠️ Refuses a payment received into another company — see `postReceipt`. */
export async function postReceiptAction(receiptId: number) {
  const res = await postReceipt(receiptId);
  if (res.ok) refresh();
  return res;
}

export async function unpostReceiptAction(receiptId: number, reason?: string | null) {
  const res = await unpostReceipt(receiptId, reason);
  if (res.ok) refresh();
  return res;
}


/* ------------- buying, and the budget (manufacturing Stage 2) ------------- */

/** ⚠️ Approving is a NAMED step — see `decideBudget`. */
export async function createBudgetAction(input: BudgetInput) {
  const res = await createBudget(input);
  if (res.ok) refresh();
  return res;
}

/** ⚠️ Refuses to edit an APPROVED budget — reopen it first. */
export async function updateBudgetAction(id: number, input: Partial<BudgetInput>) {
  const res = await updateBudget(id, input);
  if (res.ok) refresh();
  return res;
}

/** ⚠️ A person and a moment, never a boolean, and a refusal must say why. */
export async function decideBudgetAction(
  id: number,
  decision: "approved" | "rejected",
  who: { personId?: number | null; name?: string | null },
  note?: string | null,
) {
  const res = await decideBudget(id, decision, who, note);
  if (res.ok) refresh();
  return res;
}

/** ⚠️ Clears the old approver's name — it was against a figure that is about to
 *  change. */
export async function reopenBudgetAction(id: number, reason?: string | null) {
  const res = await reopenBudget(id, reason);
  if (res.ok) refresh();
  return res;
}

export async function closeBudgetAction(id: number) {
  const res = await closeBudget(id);
  if (res.ok) refresh();
  return res;
}

/** ⚠️ Refuses while purchases are charged to it — close it instead. */
export async function deleteBudgetAction(id: number) {
  const res = await deleteBudget(id);
  if (res.ok) refresh();
  return res;
}

/** ⚠️ Lands as a DRAFT, which moves no stock and reaches no books — see
 *  `createPurchase`. That is what makes it safe to type the moment the flour
 *  comes through the door. */
export async function createPurchaseAction(input: PurchaseInput) {
  const res = await createPurchase(input);
  if (res.ok) refresh();
  return res;
}

/** ⚠️ Only a draft. Once approved, the stock has moved — cancel and re-record. */
export async function updatePurchaseAction(id: number, input: Partial<PurchaseInput>) {
  const res = await updatePurchase(id, input);
  if (res.ok) refresh();
  return res;
}

/**
 * ⚠️ APPROVING IS WHAT PUTS IT ON THE SHELF — it writes the `receipt`
 * movements with their landed unit cost. It refuses to overrun an approved
 * budget unless told to; the caller passes `acknowledgeOverBudget` after asking.
 */
export async function approvePurchaseAction(
  id: number,
  who: { personId?: number | null; name?: string | null },
  opts?: { note?: string | null; acknowledgeOverBudget?: boolean },
) {
  const res = await approvePurchase(id, who, opts);
  if (res.ok) refresh();
  return res;
}

/**
 * ⚠️ Cancelling an approved purchase REVERSES its stock movements rather than
 * erasing them, and refuses while the general ledger still holds it — taking
 * the stock out and leaving the creditor standing would put the two ledgers
 * out of step silently. The ledger check is done HERE because `cocozuri-buy.ts`
 * must not import `cocozuri-ledger.ts`, which imports it.
 */
export async function cancelPurchaseAction(id: number, reason: string | null) {
  const postedInBooks = await purchaseIsPosted(id);
  const res = await cancelPurchase(id, reason, { postedInBooks });
  if (res.ok) refresh();
  return res;
}

/** ⚠️ Only a draft — nothing moved, nothing posted, nobody put a name to it. */
export async function deletePurchaseAction(id: number) {
  const res = await deletePurchase(id);
  if (res.ok) refresh();
  return res;
}

/** ⚠️ Posting is explicit (the ledger's fifth rule) and only an APPROVED
 *  purchase goes in. */
export async function postPurchaseAction(purchaseId: number) {
  const res = await postPurchase(purchaseId);
  if (res.ok) refresh();
  return res;
}

/** ⚠️ A reversal, never an erasure — both sides stay in the general ledger. */
export async function unpostPurchaseAction(purchaseId: number, reason?: string | null) {
  const res = await unpostPurchase(purchaseId, reason);
  if (res.ok) refresh();
  return res;
}


/* ------------------------- recipes (Stage 3) ------------------------- */

/** ⚠️ Lands as a DRAFT — a recipe nobody has checked should not be what a
 *  kitchen follows at seven in the morning. */
export async function createRecipeAction(input: RecipeInput) {
  const res = await createRecipe(input);
  if (res.ok) refresh();
  return res;
}

/** ⚠️ An ACTIVE recipe may be edited, deliberately — it is a live instruction,
 *  not a document somebody acted on, and what a batch actually consumed will be
 *  recorded by Stage 4 rather than by this. */
export async function updateRecipeAction(id: number, input: Partial<RecipeInput>) {
  const res = await updateRecipe(id, input);
  if (res.ok) refresh();
  return res;
}

/** ⚠️ Refuses to activate a recipe that does not add up — the blockers are
 *  re-checked here, never trusted from the form. */
export async function setRecipeStatusAction(id: number, status: CzRecipeStatus) {
  const res = await setRecipeStatus(id, status);
  if (res.ok) refresh();
  return res;
}

/** ⚠️ ONE default per output, enforced in the library. */
export async function setRecipeDefaultAction(id: number) {
  const res = await setRecipeDefault(id);
  if (res.ok) refresh();
  return res;
}

/** ⚠️ Archive is the normal answer — and this must start refusing once Stage 4
 *  gives batches a recipe to point at. */
export async function deleteRecipeAction(id: number) {
  const res = await deleteRecipe(id);
  if (res.ok) refresh();
  return res;
}


/* ------------------------ production (Stage 4) ------------------------ */

/**
 * ⚠️ ONE ACTION, AND IT IS ALREADY RUNNING — plan §5a. Nobody at CocoZuri
 * writes a batch number today, so every field demanded before somebody can
 * start making chocolate is a reason to go back to the notebook. The number is
 * allocated by the system; the recipe and the expected quantity are optional.
 */
export async function openBatchAction(input: OpenBatchInput) {
  const res = await openBatch(input);
  if (res.ok) refresh();
  return res;
}

/** ⚠️ Only an OPEN batch — a closed one has already moved stock. */
export async function updateBatchAction(id: number, input: Partial<OpenBatchInput>) {
  const res = await updateBatch(id, input);
  if (res.ok) refresh();
  return res;
}

/**
 * ⚠️ CLOSING IS WHAT MOVES THE STOCK: every `consume` and the one `produce`, in
 * one voucher, all tagged with the batch. It refuses a shortfall nobody has
 * explained — note #12, and the same discipline as an unexplained stock-take.
 */
export async function closeBatchAction(id: number, input: CloseBatchInput) {
  const res = await closeBatch(id, input);
  if (res.ok) refresh();
  return res;
}

/** ⚠️ Reverses the movements rather than erasing them. */
export async function reopenBatchAction(id: number, reason: string | null) {
  const res = await reopenBatch(id, reason);
  if (res.ok) refresh();
  return res;
}

/** ⚠️ Costs nothing, deliberately — materials are not consumed until close, so
 *  nobody has a reason to avoid opening a batch "just in case". */
export async function cancelBatchAction(id: number, reason: string | null) {
  const res = await cancelBatch(id, reason);
  if (res.ok) refresh();
  return res;
}


/* ---------------------- kitchen → shop (Stage 5) ---------------------- */

/**
 * ⚠️ SENDING TAKES THE STOCK OFF THE SENDING SHELF and nothing more. It is now
 * IN TRANSIT — off one shelf and not yet on the other — which is the truth.
 * Pretending it arrived the instant it left is what stops anybody noticing a
 * crate that went missing.
 */
export async function sendTransferAction(input: SendTransferInput) {
  const res = await sendTransfer(input);
  if (res.ok) refresh();
  return res;
}

/**
 * ⚠️ WHAT ARRIVED, NOT WHAT WAS SENT. A shortfall must be explained, and more
 * arriving than was sent is refused — stock cannot appear in transit.
 */
export async function receiveTransferAction(id: number, input: ReceiveTransferInput) {
  const res = await receiveTransfer(id, input);
  if (res.ok) refresh();
  return res;
}

/** ⚠️ Puts the stock back on the sending shelf with an opposite movement. */
export async function cancelTransferAction(id: number, reason: string | null) {
  const res = await cancelTransfer(id, reason);
  if (res.ok) refresh();
  return res;
}


/* ------------- returns, repairs and damage (Stage 6) ------------- */

/**
 * ⚠️ A CUSTOMER'S RETURN COMES BACK ONTO THE SHELF; OUR OWN BREAKAGE DOES NOT
 * MOVE. What a supermarket sends back left the books the day it was sold, so it
 * has to come in again. A crushed box found in the shop never went anywhere.
 */
export async function bookReturnAction(input: BookReturnInput) {
  const res = await bookReturn(input);
  if (res.ok) refresh();
  return res;
}

/**
 * ⚠️ SETTLING IS WHAT TAKES THE SCRAP OFF THE SHELF — and only the scrap. What
 * was repacked is already there. It can be called again: the remainder is stock
 * still on the bench being repaired, which is the circled "(repairing)" in the
 * notes.
 */
export async function settleReturnAction(id: number, input: SettleReturnInput) {
  const res = await settleReturn(id, input);
  if (res.ok) refresh();
  return res;
}

/** ⚠️ Refuses while the write-off is still in the books — the check is made
 *  here so the library never has to import the ledger. */
export async function cancelReturnAction(id: number, reason: string | null) {
  const postedInBooks = await writeOffIsPosted(id);
  const res = await cancelReturn(id, reason, { postedInBooks });
  if (res.ok) refresh();
  return res;
}

/**
 * ⚠️ IT PREPARES A CREDIT NOTE — the document that already exists — priced off
 * the ORIGINAL invoice, and links it. It lands as a DRAFT: issuing it is a
 * separate act and posting it a third.
 */
export async function raiseCreditNoteAction(id: number) {
  const res = await raiseCreditNote(id);
  if (res.ok) refresh();
  return res;
}

/**
 * ⚠️ Dr stock written off · Cr stock, at what the thrown chocolate COST — never
 * at what it would have sold for. Only a settled return posts, and a loss that
 * cannot be valued in full is refused rather than understated.
 */
export async function postWriteOffAction(id: number) {
  const res = await postWriteOff(id);
  if (res.ok) refresh();
  return res;
}

/** ⚠️ A reversal, never an erasure. */
export async function unpostWriteOffAction(id: number, reason: string | null) {
  const res = await unpostWriteOff(id, reason);
  if (res.ok) refresh();
  return res;
}

/* ------------- the cost of what was sold (Stage 7) ------------- */

/**
 * ⚠️ Dr 5100 cost of goods sold · Cr 1150 stock, one voucher a month. This is
 * what makes the profit and loss real — until it runs, selling posts revenue
 * with no cost against it and the stock account grows for ever.
 *
 * ⚠️ A return needs no special case: goods coming back are a positive movement,
 * so they reduce the month's cost of sales by themselves. That is note #11's
 * "② cost value", and it is why Stage 6 left it here.
 */
export async function postCostOfSalesAction(year: number, month: number) {
  const res = await postCostOfSales(year, month);
  if (res.ok) refresh();
  return res;
}

/** ⚠️ A reversal, never an erasure. */
export async function unpostCostOfSalesAction(year: number, month: number, reason: string | null) {
  const res = await unpostCostOfSales(year, month, reason);
  if (res.ok) refresh();
  return res;
}

/* ---------------- money out, and the stock-take (Stage 8) ---------------- */

/**
 * ⚠️ ONE CHEQUE COVERING SEVERAL PURCHASES IS ONE ROW EACH, all or nothing.
 * Nothing ever sits "on account" waiting to be allocated — the same rule as on
 * the money-in side, and for the same reason.
 */
export async function createPaymentsAction(inputs: PaymentInput[]) {
  const res = await createPayments(inputs);
  if (res.ok) refresh();
  return res;
}

export async function updatePaymentAction(id: number, input: Partial<PaymentInput>) {
  const res = await updatePayment(id, input);
  if (res.ok) refresh();
  return res;
}

/** ⚠️ Refuses a payment that is in the books — the check is made here so the
 *  library never has to import the posting engine. */
export async function deletePaymentAction(id: number) {
  const postedInBooks = await paymentIsPosted(id);
  const res = await deletePayment(id, { postedInBooks });
  if (res.ok) refresh();
  return res;
}

/** ⚠️ Dr creditors · Cr bank or cash, with the party Stage 2 credited — the
 *  supplier, or the PERSON who bought it with their own money. */
export async function postPaymentAction(id: number) {
  const res = await postPayment(id);
  if (res.ok) refresh();
  return res;
}

/** ⚠️ A reversal, never an erasure. */
export async function unpostPaymentAction(id: number, reason: string | null) {
  const res = await unpostPayment(id, reason);
  if (res.ok) refresh();
  return res;
}

/**
 * ⚠️ THE GAP STAGE 7 LEFT ON PURPOSE. A stock-take difference is a real change
 * in what the company owns but not the cost of selling anything, so cost of
 * sales reports it and refuses to swallow it. This is where it lands.
 */
export async function postStocktakeAction(year: number, month: number) {
  const res = await postStocktake(year, month);
  if (res.ok) refresh();
  return res;
}

export async function unpostStocktakeAction(year: number, month: number, reason: string | null) {
  const res = await unpostStocktake(year, month, reason);
  if (res.ok) refresh();
  return res;
}

/* --------------------- over the counter (Stage 5b) --------------------- */

/**
 * ⚠️ A RECORD, NOT A TILL. Nothing here takes payment — the money changed hands
 * before anybody typed. Writing it down takes the chocolate off that counter's
 * shelf and puts the sale in the day's takings.
 */
export async function recordCounterSaleAction(input: CounterSaleInput) {
  const res = await recordCounterSale(input);
  if (res.ok) refresh();
  return res;
}

/** ⚠️ Dr cash or bank · Cr sales · Cr VAT — and NO debtor. A counter sale was
 *  paid there and then. */
export async function postCounterSaleAction(id: number) {
  const res = await postCounterSale(id);
  if (res.ok) refresh();
  return res;
}

/** ⚠️ A reversal, never an erasure. */
export async function unpostCounterSaleAction(id: number, reason: string | null) {
  const res = await unpostCounterSale(id, reason);
  if (res.ok) refresh();
  return res;
}

/** ⚠️ Refuses while the takings still stand in the books — the check is made
 *  here so the library never has to import the posting engine. */
export async function cancelCounterSaleAction(id: number, reason: string | null) {
  const postedInBooks = await counterSaleIsPosted(id);
  const res = await cancelCounterSale(id, reason, { postedInBooks });
  if (res.ok) refresh();
  return res;
}

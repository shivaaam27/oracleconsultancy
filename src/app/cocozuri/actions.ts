"use server";

import { revalidatePath } from "next/cache";
import {
  archiveCustomer, archiveProduct, createCustomer, createProduct,
  cancelInvoice, createInvoice, deletePrice, issueInvoice, mergeProducts, setBranches,
  updateDraftInvoice,
  setDefaultVatRate, setPrice, updateCustomer, updateProduct,
  applyCreditNote, createReceipt, createReceipts, deleteReceipt, updateReceipt,
  type CustomerInput, type ProductInput, type ReceiptInput,
} from "@/lib/cocozuri";
import {
  archiveItem, createItem, createLocation, deleteCount, recordCount, recordCounts, saveDay,
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
  decideBudget, deleteBudget, deletePurchase, purchaseFromOrderForm, reopenBudget, updateBudget, updatePurchase,
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
  /* ⚠️ "layout", NOT the bare path. `/cocozuri/invoices` and
     `/cocozuri/invoices/CZ-237` are DIFFERENT cache keys, so revalidating the
     list left every invoice RECORD stale — correcting which lots went out saved
     to the database and the page went on saying "no lot recorded", which on a
     recall record is the worst possible way to fail. Recipes, batches,
     transfers, returns, statements and trace all already pass "layout" for
     exactly this reason; invoices was the one that did not. */
  revalidatePath("/cocozuri/invoices", "layout");
  revalidatePath("/cocozuri/items");
  revalidatePath("/cocozuri/shelves");
  revalidatePath("/cocozuri/prices");
  revalidatePath("/cocozuri/lists");
  revalidatePath("/cocozuri/suppliers", "layout");
  revalidatePath("/cocozuri/history");
  revalidatePath("/cocozuri/receipts");
  revalidatePath("/cocozuri/owed");
  revalidatePath("/cocozuri/statements", "layout");
  revalidatePath("/cocozuri/stock");
  revalidatePath("/cocozuri/stock/month");
  revalidatePath("/cocozuri/order", "layout");
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

/** ⚠️ A typed category, brand or unit joins its list — see `ensureListValue`. */
export async function createProductAction(input: ProductInput) {
  const res = await createProduct(input);
  if (res.ok) { await noteListValues(input); refresh(); }
  return res;
}

async function noteListValues(input: Partial<ProductInput>) {
  const { ensureListValue } = await import("@/lib/cocozuri-lists");
  await Promise.all([
    ensureListValue("category", input.category),
    ensureListValue("brand", input.brand),
    ensureListValue("uom", input.uom),
    ensureListValue("pack_unit", input.packUnit),
  ]);
}

export async function updateProductAction(id: number, input: Partial<ProductInput>) {
  const res = await updateProduct(id, input);
  if (res.ok) { await noteListValues(input); refresh(); }
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

/**
 * Say which lots really went out on an invoice line.
 *
 * ⚠️ THIS IS ALLOWED ON AN ISSUED INVOICE, and it is the one place the module
 * bends its own rule. An issued invoice's MONEY is never edited — that is what
 * a credit note is for. Which lots went in the van is not money, and the person
 * who loaded it usually knows a day later than whoever pressed Issue.
 */
export async function setDespatchLotsAction(
  lineId: number, lots: { batchId: number; qty: number }[],
) {
  const { setDespatchLots } = await import("@/lib/cocozuri-despatch");
  const res = await setDespatchLots(lineId, lots);
  if (res.ok) refresh();
  return res;
}

/**
 * ⚠️ A DRAFT ONLY. An issued invoice is answered with a credit note, never
 * edited — `updateDraftInvoice` refuses one and says so by number.
 */
export async function updateDraftInvoiceAction(
  id: number, input: Parameters<typeof updateDraftInvoice>[1],
) {
  const res = await updateDraftInvoice(id, input);
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

/**
 * A whole shelf counted at once.
 *
 * ⚠️ ALL OR NOTHING, and it refuses the lot if any line differs from the book
 * with no reason given — see `recordCounts`. A half-saved stock-take leaves some
 * items carrying forward from the count and the rest from the old book, with
 * nothing on screen saying which is which.
 */
export async function recordStockCountsAction(input: Parameters<typeof recordCounts>[0]) {
  const res = await recordCounts(input);
  if (res.ok) refresh();
  return res;
}

export async function deleteStockCountAction(id: number) {
  const res = await deleteCount(id);
  if (res.ok) refresh();
  return res;
}

/**
 * ⚠️ A TYPED CATEGORY OR UNIT JOINS THE LIST. The form lets one be typed as
 * well as picked — a unit nobody has added yet must not stop somebody adding an
 * item — but a typed value that never reached the list would put every typo
 * back into the data while staying invisible on the screen built to catch it.
 */
export async function createStockItemAction(input: StockItemInput) {
  const res = await createItem(input);
  if (res.ok) {
    const { ensureListValue } = await import("@/lib/cocozuri-lists");
    await Promise.all([
      ensureListValue("category", input.category),
      ensureListValue("uom", input.uom),
    ]);
    refresh();
  }
  return res;
}

/** ⚠️ `productId: null` deliberately UNLINKS an item from its product — which is
 *  how a wrong match made during the import gets undone. */
export async function updateStockItemAction(id: number, input: Partial<StockItemInput>) {
  const res = await updateItem(id, input);
  if (res.ok) {
    const { ensureListValue } = await import("@/lib/cocozuri-lists");
    await Promise.all([
      ensureListValue("category", input.category),
      ensureListValue("uom", input.uom),
    ]);
    refresh();
  }
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

/* ------------------------------------------------------------------ *
 * Stage A — the lists you pick from, what kind of thing an item is,
 * and deleting for real.
 * ------------------------------------------------------------------ */

export async function addListValueAction(kind: string, value: string) {
  const { addListValue } = await import("@/lib/cocozuri-lists");
  const res = await addListValue(kind as never, value);
  if (res.ok) refresh();
  return res;
}

/** ⚠️ Rewrites the word on every product and item using it — that is the point. */
export async function renameListValueAction(id: number, value: string) {
  const { renameListValue } = await import("@/lib/cocozuri-lists");
  const res = await renameListValue(id, value);
  if (res.ok) refresh();
  return res;
}

/** ⚠️ Only a person can say two spellings are one thing. The screen suggests. */
export async function mergeListValuesAction(keepId: number, mergeId: number) {
  const { mergeListValues } = await import("@/lib/cocozuri-lists");
  const res = await mergeListValues(keepId, mergeId);
  if (res.ok) refresh();
  return res;
}

export async function deleteListValueAction(id: number) {
  const { deleteListValue } = await import("@/lib/cocozuri-lists");
  const res = await deleteListValue(id);
  if (res.ok) refresh();
  return res;
}

export async function setItemKindAction(id: number, kind: string | null) {
  const { setItemKind } = await import("@/lib/cocozuri-lists");
  const res = await setItemKind(id, kind);
  if (res.ok) refresh();
  return res;
}

/** The sweep for the handful nobody has classified. */
export async function setItemKindsAction(ids: number[], kind: string) {
  const { setItemKinds } = await import("@/lib/cocozuri-lists");
  const res = await setItemKinds(ids, kind);
  if (res.ok) refresh();
  return res;
}

/**
 * ⚠️ DELETING FOR REAL, and the rule is ERPNext's own: a draft goes; something
 * acted on is cancelled first; and anything still pointed at NAMES what points
 * at it rather than failing with a database error nobody can read.
 */
export async function deleteProductAction(id: number) {
  const { deleteProduct } = await import("@/lib/cocozuri-lists");
  const res = await deleteProduct(id);
  if (res.ok) refresh();
  return res;
}

export async function deleteCustomerAction(id: number) {
  const { deleteCustomer } = await import("@/lib/cocozuri-lists");
  const res = await deleteCustomer(id);
  if (res.ok) refresh();
  return res;
}

export async function deleteStockItemAction(id: number) {
  const { deleteStockItem } = await import("@/lib/cocozuri-lists");
  const res = await deleteStockItem(id);
  if (res.ok) refresh();
  return res;
}

export async function deleteStockLocationAction(id: number) {
  const { deleteStockLocation } = await import("@/lib/cocozuri-lists");
  const res = await deleteStockLocation(id);
  if (res.ok) refresh();
  return res;
}

/** What points at a record, so nothing is ever removed blind. */
export async function usageAction(
  what: "product" | "customer" | "item" | "location", id: number,
) {
  const m = await import("@/lib/cocozuri-lists");
  switch (what) {
    case "product": return m.productUsage(id);
    case "customer": return m.customerUsage(id);
    case "item": return m.stockItemUsage(id);
    case "location": return m.locationUsage(id);
  }
}

/* -------------- what happened, and notes (Stage E) -------------- */

/**
 * ⚠️ A NOTE IS AN EVENT, in the same stream as everything else — and like
 * everything else it cannot be edited or deleted afterwards. Events are
 * append-only, the same rule the general ledger follows.
 */
export async function addCommentAction(
  subjectType: string, subjectId: number | null, subjectRef: string | null, body: string,
) {
  const { addComment } = await import("@/lib/cocozuri-events");
  const res = await addComment(subjectType as never, subjectId, subjectRef, body);
  if (res.ok) refresh();
  return res;
}

/* ---------------- what to MAKE today (Stage C) ---------------- */

/**
 * ⚠️ THE ORDER FORM IS A PRODUCTION PLAN, not a purchase order (owner, 27 Aug
 * 2026). It moves no stock and creates nothing — a line becomes real only when
 * somebody starts a batch from it.
 */
export async function createPlanAction(input: Parameters<typeof import("@/lib/cocozuri-plan").createPlan>[0]) {
  const { createPlan } = await import("@/lib/cocozuri-plan");
  const res = await createPlan(input);
  if (res.ok) refresh();
  return res;
}

/** ⚠️ Lines already started as a batch are kept, whatever the caller sends. */
export async function updatePlanAction(
  id: number, input: Parameters<typeof import("@/lib/cocozuri-plan").updatePlan>[1],
) {
  const { updatePlan } = await import("@/lib/cocozuri-plan");
  const res = await updatePlan(id, input);
  if (res.ok) refresh();
  return res;
}

export async function issuePlanAction(id: number) {
  const { issuePlan } = await import("@/lib/cocozuri-plan");
  const res = await issuePlan(id);
  if (res.ok) refresh();
  return res;
}

/** ⚠️ Refused once any line has been started — that batch is real work. */
export async function cancelPlanAction(id: number, reason: string | null) {
  const { cancelPlan } = await import("@/lib/cocozuri-plan");
  const res = await cancelPlan(id, reason);
  if (res.ok) refresh();
  return res;
}

/** ⚠️ A draft only, and only while nothing has been started — the Stage A rule. */
export async function deletePlanAction(id: number) {
  const { deletePlan } = await import("@/lib/cocozuri-plan");
  const res = await deletePlan(id);
  if (res.ok) refresh();
  return res;
}

/**
 * ⚠️ IT GOES THROUGH `openBatch`, the door that already exists. A second way of
 * opening a batch would be a second set of rules about numbering and about what
 * a recipe means, and they would drift.
 */
export async function startPlanLineAction(lineId: number) {
  const { startLine } = await import("@/lib/cocozuri-plan");
  const res = await startLine(lineId);
  if (res.ok) refresh();
  return res;
}

/* ---------------------- who we buy from (Stage B) ---------------------- */

/**
 * ⚠️ WRITES TO THE SHARED VENDOR REGISTER, not a CocoZuri list. One list, two
 * doors — and the second door was needed: the register was found EMPTY across
 * the whole system while every purchase carried a typed name, which is what
 * telling somebody to go to another module actually costs.
 */
export async function saveSupplierAction(
  id: number | null, input: { name: string; contactName?: string | null; email?: string | null; phone?: string | null; notes?: string | null },
) {
  const { saveSupplier } = await import("@/lib/cocozuri-suppliers");
  const res = await saveSupplier(id, input);
  if (res.ok) refresh();
  return res;
}

/** ⚠️ Refused while a purchase names them — it says how many. */
export async function deleteSupplierAction(id: number) {
  const { deleteSupplier } = await import("@/lib/cocozuri-suppliers");
  const res = await deleteSupplier(id);
  if (res.ok) refresh();
  return res;
}

export async function setSupplierActiveAction(id: number, active: boolean) {
  const { setSupplierActive } = await import("@/lib/cocozuri-suppliers");
  const res = await setSupplierActive(id, active);
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
/**
 * The order form's lines, as a draft purchase.
 *
 * ⚠️ A DRAFT, DELIBERATELY. Nothing moves and nothing is posted until somebody
 * approves it — so carrying a suggestion across commits nothing at all.
 */
export async function purchaseFromOrderFormAction(input: Parameters<typeof purchaseFromOrderForm>[0]) {
  const res = await purchaseFromOrderForm(input);
  if (res.ok) refresh();
  return res;
}

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

/**
 * Correct a running batch — the date, who is making it, the recipe, the multiple.
 *
 * ⚠️ ONLY AN OPEN BATCH. A closed one has already moved stock; reopen it first.
 *
 * ⚠️ AND CHANGING THE RECIPE RE-FREEZES THE SNAPSHOT the batch is judged
 * against — leaving it behind would measure the batch against a recipe it is no
 * longer being made from, which is the very fault the snapshot exists to end.
 */
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

/**
 * ⚠️ FETCH MATERIALS WHILE A BATCH IS STILL RUNNING — the answer to a batch
 * that takes days. Consuming at close is right for a morning's work, but it
 * leaves the raw-material shelf reading high for the whole of a longer run, and
 * a stock-take taken in the middle of one finds a shortfall nobody can explain.
 *
 * ⚠️ WHAT IS FETCHED IS TAKEN OFF WHAT CLOSING TAKES, so nothing is counted
 * twice — and abandoning the batch puts it all back.
 */
export async function drawMaterialsAction(
  batchId: number, draws: { itemId: number; qty: number }[], onDate?: string,
) {
  const { drawMaterials } = await import("@/lib/cocozuri-batch");
  const res = await drawMaterials(batchId, draws, onDate);
  if (res.ok) refresh();
  return res;
}

/**
 * ⚠️ PUT PART OF A BATCH ON THE SHELF BEFORE IT IS FINISHED — two hundred bars
 * on Monday and the rest on Wednesday, which was one batch or two with no way to
 * say which. It is ONE batch that finished twice: what comes out early goes on
 * the shelf early carrying the same lot, and closing puts on only the rest.
 */
export async function recordOutputAction(batchId: number, producedQty: number, onDate?: string) {
  const { recordOutput } = await import("@/lib/cocozuri-batch");
  const res = await recordOutput(batchId, producedQty, onDate);
  if (res.ok) refresh();
  return res;
}

/**
 * ⚠️ PULL THE RECIPE IN AGAIN, on a RUNNING batch only. A closed one keeps the
 * recipe it was made from for ever — that is the whole point of freezing it.
 * And it is a deliberate act: the recipe may have been corrected, or changed
 * for next time, and only the chef knows which.
 */
export async function rereadRecipeAction(id: number) {
  const { rereadRecipe } = await import("@/lib/cocozuri-batch");
  const res = await rereadRecipe(id);
  if (res.ok) refresh();
  return res;
}

/** ⚠️ Reverses the movements rather than erasing them. */
export async function reopenBatchAction(id: number, reason: string | null) {
  const res = await reopenBatch(id, reason);
  if (res.ok) refresh();
  return res;
}

/** ⚠️ Costs nothing where nothing was fetched — materials are not consumed
 *  until close, so nobody has a reason to avoid opening a batch "just in case".
 *  A batch that DID fetch has its materials put back on the shelf. */
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

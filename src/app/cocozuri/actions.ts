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
import { postInvoice, postReceipt, unpostInvoice, unpostReceipt } from "@/lib/cocozuri-ledger";

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

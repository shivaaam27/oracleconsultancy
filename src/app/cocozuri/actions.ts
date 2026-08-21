"use server";

import { revalidatePath } from "next/cache";
import {
  archiveCustomer, archiveProduct, createCustomer, createProduct,
  cancelInvoice, createInvoice, deletePrice, issueInvoice, mergeProducts, setBranches,
  setDefaultVatRate, setPrice, updateCustomer, updateProduct,
  type CustomerInput, type ProductInput,
} from "@/lib/cocozuri";

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

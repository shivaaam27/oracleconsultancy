"use server";

import { revalidatePath } from "next/cache";
import {
  createStockItem,
  updateStockItem,
  setStockItemArchived,
  deleteStockItem,
  recordPurchase,
  updatePurchase,
  deletePurchase,
  recordIssue,
  updateIssue,
  deleteIssue,
  InsufficientStockError,
  type StockItemInput,
  type PurchaseInput,
  type IssueInput,
} from "@/lib/stock";

type Result = { ok: true; id?: number } | { ok: false; error: string };

function str(fd: FormData, key: string): string | null {
  const v = (fd.get(key) ?? "").toString().trim();
  return v || null;
}

function numOrNull(fd: FormData, key: string): number | null {
  const v = (fd.get(key) ?? "").toString().trim();
  if (!v) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function revalidateHrms() {
  revalidatePath("/hrms");
  revalidatePath("/hrms/supplies");
  revalidatePath("/");
}

function itemFromForm(fd: FormData): StockItemInput | { error: string } {
  const code = str(fd, "code");
  const name = str(fd, "name");
  if (!code) return { error: "An item code is required (e.g. ST-001)." };
  if (!name) return { error: "An item name is required." };
  return {
    code,
    name,
    category: str(fd, "category"),
    unit: str(fd, "unit"),
    openingStock: numOrNull(fd, "openingStock") ?? 0,
    reorderLevel: numOrNull(fd, "reorderLevel") ?? 0,
    unitCost: numOrNull(fd, "unitCost") ?? 0,
  };
}

export async function createStockItemAction(fd: FormData): Promise<Result> {
  const parsed = itemFromForm(fd);
  if ("error" in parsed) return { ok: false, error: parsed.error };
  try {
    const id = await createStockItem(parsed);
    revalidateHrms();
    return { ok: true, id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not save the item.";
    // Friendlier message for the unique-code constraint.
    if (/duplicate key|unique/i.test(msg)) {
      return { ok: false, error: `Code "${parsed.code}" is already in use. Pick a different code.` };
    }
    return { ok: false, error: msg };
  }
}

export async function updateStockItemAction(id: number, fd: FormData): Promise<Result> {
  const parsed = itemFromForm(fd);
  if ("error" in parsed) return { ok: false, error: parsed.error };
  try {
    await updateStockItem(id, parsed);
    revalidateHrms();
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save changes." };
  }
}

export async function archiveStockItemAction(id: number, archived: boolean): Promise<Result> {
  try {
    await setStockItemArchived(id, archived);
    revalidateHrms();
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not update the item." };
  }
}

export async function deleteStockItemAction(id: number): Promise<Result> {
  try {
    await deleteStockItem(id);
    revalidateHrms();
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not delete the item." };
  }
}

// "YYYY-MM-DD" → Date at UTC midnight (all-day, matching the documents convention).
function dateFromInput(fd: FormData, key: string): Date | null {
  const v = (fd.get(key) ?? "").toString().trim();
  if (!v) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return isNaN(d.getTime()) ? null : d;
}

/* ---- Purchases (stock IN) ---- */
function purchaseFromForm(fd: FormData): PurchaseInput | { error: string } {
  const itemCode = str(fd, "itemCode");
  const qty = numOrNull(fd, "qty");
  if (!itemCode) return { error: "Choose an item." };
  if (!qty || qty <= 0) return { error: "Enter a quantity greater than zero." };
  return {
    itemCode,
    qty,
    date: dateFromInput(fd, "date"),
    unitCost: numOrNull(fd, "unitCost") ?? 0,
    supplier: str(fd, "supplier"),
    ref: str(fd, "ref"),
  };
}

export async function recordPurchaseAction(fd: FormData): Promise<Result> {
  const parsed = purchaseFromForm(fd);
  if ("error" in parsed) return { ok: false, error: parsed.error };
  try {
    const id = await recordPurchase(parsed);
    revalidateHrms();
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not record the purchase." };
  }
}

export async function updatePurchaseAction(id: number, fd: FormData): Promise<Result> {
  const parsed = purchaseFromForm(fd);
  if ("error" in parsed) return { ok: false, error: parsed.error };
  try {
    await updatePurchase(id, parsed);
    revalidateHrms();
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save changes." };
  }
}

export async function deletePurchaseAction(id: number): Promise<Result> {
  try {
    await deletePurchase(id);
    revalidateHrms();
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not delete the purchase." };
  }
}

/* ---- Issues (stock OUT) ---- */
function issueFromForm(fd: FormData): IssueInput | { error: string } {
  const itemCode = str(fd, "itemCode");
  const qty = numOrNull(fd, "qty");
  if (!itemCode) return { error: "Choose an item." };
  if (!qty || qty <= 0) return { error: "Enter a quantity greater than zero." };
  return {
    itemCode,
    qty,
    date: dateFromInput(fd, "date"),
    issuedTo: str(fd, "issuedTo"),
    companyId: numOrNull(fd, "companyId"),
    notes: str(fd, "notes"),
  };
}

export async function recordIssueAction(fd: FormData): Promise<Result> {
  const parsed = issueFromForm(fd);
  if ("error" in parsed) return { ok: false, error: parsed.error };
  const allowNegative = fd.get("allowNegative") === "1";
  try {
    const id = await recordIssue(parsed, "web-ui", { allowNegative });
    revalidateHrms();
    return { ok: true, id };
  } catch (e) {
    // Surface the negative-stock guard with a distinct flag so the form can
    // offer an "issue anyway" override.
    if (e instanceof InsufficientStockError) {
      return { ok: false, error: `Only ${e.available} in stock — you're trying to issue ${e.requested}.` };
    }
    return { ok: false, error: e instanceof Error ? e.message : "Could not record the issue." };
  }
}

export async function updateIssueAction(id: number, fd: FormData): Promise<Result> {
  const parsed = issueFromForm(fd);
  if ("error" in parsed) return { ok: false, error: parsed.error };
  try {
    await updateIssue(id, parsed);
    revalidateHrms();
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save changes." };
  }
}

export async function deleteIssueAction(id: number): Promise<Result> {
  try {
    await deleteIssue(id);
    revalidateHrms();
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not delete the issue." };
  }
}

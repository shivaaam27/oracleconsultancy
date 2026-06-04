"use server";

import { revalidatePath } from "next/cache";
import {
  createStockItem,
  updateStockItem,
  setStockItemArchived,
  recordPurchase,
  recordIssue,
  InsufficientStockError,
  type StockItemInput,
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

// "YYYY-MM-DD" → Date at UTC midnight (all-day, matching the documents convention).
function dateFromInput(fd: FormData, key: string): Date | null {
  const v = (fd.get(key) ?? "").toString().trim();
  if (!v) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return isNaN(d.getTime()) ? null : d;
}

/* ---- Purchases (stock IN) ---- */
export async function recordPurchaseAction(fd: FormData): Promise<Result> {
  const itemCode = str(fd, "itemCode");
  const qty = numOrNull(fd, "qty");
  if (!itemCode) return { ok: false, error: "Choose an item." };
  if (!qty || qty <= 0) return { ok: false, error: "Enter a quantity greater than zero." };
  try {
    const id = await recordPurchase({
      itemCode,
      qty,
      date: dateFromInput(fd, "date"),
      unitCost: numOrNull(fd, "unitCost") ?? 0,
      supplier: str(fd, "supplier"),
      ref: str(fd, "ref"),
    });
    revalidateHrms();
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not record the purchase." };
  }
}

/* ---- Issues (stock OUT) ---- */
export async function recordIssueAction(fd: FormData): Promise<Result> {
  const itemCode = str(fd, "itemCode");
  const qty = numOrNull(fd, "qty");
  if (!itemCode) return { ok: false, error: "Choose an item." };
  if (!qty || qty <= 0) return { ok: false, error: "Enter a quantity greater than zero." };
  const allowNegative = fd.get("allowNegative") === "1";
  try {
    const id = await recordIssue(
      {
        itemCode,
        qty,
        date: dateFromInput(fd, "date"),
        issuedTo: str(fd, "issuedTo"),
        companyId: numOrNull(fd, "companyId"),
        notes: str(fd, "notes"),
      },
      "web-ui",
      { allowNegative }
    );
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

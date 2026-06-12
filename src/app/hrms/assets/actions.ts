"use server";

import { revalidatePath } from "next/cache";
import {
  createAsset,
  createAssetsBulk,
  updateAsset,
  assignAsset,
  assignAssetShared,
  returnAsset,
  setAssetStatus,
  archiveAsset,
  listArchivedAssets,
  listAssetHistory,
  type AssetInput,
} from "@/lib/assets";
import type { AssetStatus, AssetRow, AssetHistoryRow } from "@/lib/assets-shared";

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
function dateIso(fd: FormData, key: string): string | null {
  const v = (fd.get(key) ?? "").toString().trim();
  if (!v) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function invalidate() {
  revalidatePath("/hrms");
  revalidatePath("/hrms/assets");
  revalidatePath("/people");
}

// Tidy free-typed categories so "COMPUTER"/"computer" all store as "Computer"
// (first letter upper, rest lower) — keeps the filter and picker consistent.
function normaliseCategory(c: string | null): string | null {
  if (!c) return c;
  return c.charAt(0).toUpperCase() + c.slice(1).toLowerCase();
}

function assetFromForm(fd: FormData): AssetInput | { error: string } {
  const name = str(fd, "name");
  if (!name) return { error: "An asset name is required." };
  return {
    tag: str(fd, "tag"),
    name,
    category: normaliseCategory(str(fd, "category")),
    brand: str(fd, "brand"),
    model: str(fd, "model"),
    department: str(fd, "department"),
    serialNo: str(fd, "serialNo"),
    companyId: numOrNull(fd, "companyId"),
    vendorId: numOrNull(fd, "vendorId"),
    location: str(fd, "location"),
    purchaseDate: dateIso(fd, "purchaseDate"),
    purchaseCost: numOrNull(fd, "purchaseCost"),
    notes: str(fd, "notes"),
    handoverDate: dateIso(fd, "handoverDate"),
  };
}

// Only acts when the chosen assignee differs from the original (compared via the
// hidden `assigneeWas`). "store" frees it; a number (re)assigns to that person,
// preserving the handover date if one was entered; "shared" is left untouched.
async function reconcileAssignee(assetId: number, fd: FormData, handoverDate: string | null): Promise<void> {
  const v = (fd.get("assigneeId") ?? "").toString().trim();
  const was = (fd.get("assigneeWas") ?? "").toString().trim();
  if (!v || v === was || v === "shared") return;
  if (v === "store") { await returnAsset(assetId); return; }
  if (/^\d+$/.test(v)) await assignAsset(assetId, parseInt(v, 10), null, handoverDate);
}

export async function createAssetAction(fd: FormData): Promise<Result> {
  const parsed = assetFromForm(fd);
  if ("error" in parsed) return { ok: false, error: parsed.error };
  try {
    const id = await createAsset(parsed);
    await reconcileAssignee(id, fd, parsed.handoverDate ?? null);
    invalidate();
    return { ok: true, id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not save the asset.";
    if (/duplicate key|unique/i.test(msg)) return { ok: false, error: `Tag "${parsed.tag}" is already in use.` };
    return { ok: false, error: msg };
  }
}

// A single parsed row from the spreadsheet importer. All free-text; the client
// maps spreadsheet columns to these keys and resolves the company once.
export type AssetImportRow = {
  tag?: string | null;
  name: string;
  category?: string | null;
  brand?: string | null;
  model?: string | null;
  department?: string | null;
  serialNo?: string | null;
  location?: string | null;
  notes?: string | null;
  handoverDate?: string | null; // ISO or null
};

export async function importAssetsAction(
  rows: AssetImportRow[],
  companyId: number | null
): Promise<Result> {
  const clean = rows
    .map((r) => ({ ...r, name: (r.name ?? "").trim() }))
    .filter((r) => r.name.length > 0);
  if (clean.length === 0) return { ok: false, error: "No rows with a name to import." };
  try {
    const n = await createAssetsBulk(
      clean.map((r) => ({
        tag: r.tag?.trim() || null,
        name: r.name,
        category: normaliseCategory(r.category?.trim() || null),
        brand: r.brand?.trim() || null,
        model: r.model?.trim() || null,
        department: r.department?.trim() || null,
        serialNo: r.serialNo?.trim() || null,
        companyId,
        vendorId: null,
        location: r.location?.trim() || null,
        purchaseDate: null,
        purchaseCost: null,
        notes: r.notes?.trim() || null,
        handoverDate: r.handoverDate || null,
      }))
    );
    invalidate();
    return { ok: true, id: n };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not import assets." };
  }
}

export async function updateAssetAction(id: number, fd: FormData): Promise<Result> {
  const parsed = assetFromForm(fd);
  if ("error" in parsed) return { ok: false, error: parsed.error };
  try {
    await updateAsset(id, parsed);
    await reconcileAssignee(id, fd, parsed.handoverDate ?? null);
    invalidate();
    return { ok: true, id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not save changes.";
    if (/duplicate key|unique/i.test(msg)) return { ok: false, error: `Tag "${parsed.tag}" is already in use.` };
    return { ok: false, error: msg };
  }
}

export async function assignAssetAction(assetId: number, personId: number, notes?: string | null): Promise<Result> {
  try {
    await assignAsset(assetId, personId, notes ?? null);
    invalidate();
    return { ok: true, id: assetId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not assign the asset." };
  }
}

export async function assignAssetSharedAction(
  assetId: number,
  companyId: number | null,
  custodianPersonId: number | null
): Promise<Result> {
  try {
    await assignAssetShared(assetId, { companyId, custodianPersonId });
    invalidate();
    return { ok: true, id: assetId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not assign the asset." };
  }
}

export async function returnAssetAction(assetId: number, notes?: string | null): Promise<Result> {
  try {
    await returnAsset(assetId, notes ?? null);
    invalidate();
    return { ok: true, id: assetId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not return the asset." };
  }
}

export async function setAssetStatusAction(assetId: number, status: AssetStatus): Promise<Result> {
  try {
    await setAssetStatus(assetId, status);
    invalidate();
    return { ok: true, id: assetId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not update status." };
  }
}

export async function listArchivedAssetsAction(): Promise<
  { ok: true; rows: AssetRow[] } | { ok: false; error: string }
> {
  try {
    return { ok: true, rows: await listArchivedAssets() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not load archived assets." };
  }
}

export async function listAssetHistoryAction(assetId: number): Promise<
  { ok: true; rows: AssetHistoryRow[] } | { ok: false; error: string }
> {
  try {
    return { ok: true, rows: await listAssetHistory(assetId) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not load history." };
  }
}

export async function archiveAssetAction(assetId: number, archived: boolean): Promise<Result> {
  try {
    await archiveAsset(assetId, archived);
    invalidate();
    return { ok: true, id: assetId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not archive the asset." };
  }
}

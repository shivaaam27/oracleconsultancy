"use server";

import { revalidatePath } from "next/cache";
import {
  createAsset,
  updateAsset,
  assignAsset,
  returnAsset,
  setAssetStatus,
  archiveAsset,
  type AssetInput,
} from "@/lib/assets";
import type { AssetStatus } from "@/lib/assets-shared";

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

function assetFromForm(fd: FormData): AssetInput | { error: string } {
  const name = str(fd, "name");
  if (!name) return { error: "An asset name is required." };
  return {
    tag: str(fd, "tag"),
    name,
    category: str(fd, "category"),
    serialNo: str(fd, "serialNo"),
    companyId: numOrNull(fd, "companyId"),
    purchaseDate: dateIso(fd, "purchaseDate"),
    purchaseCost: numOrNull(fd, "purchaseCost"),
    notes: str(fd, "notes"),
  };
}

export async function createAssetAction(fd: FormData): Promise<Result> {
  const parsed = assetFromForm(fd);
  if ("error" in parsed) return { ok: false, error: parsed.error };
  try {
    const id = await createAsset(parsed);
    invalidate();
    return { ok: true, id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not save the asset.";
    if (/duplicate key|unique/i.test(msg)) return { ok: false, error: `Tag "${parsed.tag}" is already in use.` };
    return { ok: false, error: msg };
  }
}

export async function updateAssetAction(id: number, fd: FormData): Promise<Result> {
  const parsed = assetFromForm(fd);
  if ("error" in parsed) return { ok: false, error: parsed.error };
  try {
    await updateAsset(id, parsed);
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

export async function archiveAssetAction(assetId: number, archived: boolean): Promise<Result> {
  try {
    await archiveAsset(assetId, archived);
    invalidate();
    return { ok: true, id: assetId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not archive the asset." };
  }
}

"use server";

// Server actions for the ops master lists (Stage 1).

import { revalidatePath } from "next/cache";
import {
  createOpsRef, renameOpsRef, mergeOpsRefs, deleteOpsRef, restoreOpsRef,
  seedOpsStarterLists, copyOpsRefsFrom,
} from "@/lib/ops-refs";
import { saveAppSettings } from "@/lib/settings";

type Result = { ok: boolean; id?: number; name?: string; note?: string; error?: string };

function refresh() {
  revalidatePath("/ops");
}

export async function createOpsRefAction(companyId: number, kind: string, name: string): Promise<Result> {
  const res = await createOpsRef(companyId, kind, name);
  if (!res.ok) return { ok: false, error: res.error };
  refresh();
  // The stored name goes back, so a box typed in lower case shows what saved.
  return { ok: true, id: res.id, name: res.name };
}

export async function renameOpsRefAction(id: number, name: string): Promise<Result> {
  const res = await renameOpsRef(id, name);
  if (!res.ok) return { ok: false, error: res.error };
  refresh();
  return { ok: true, id: res.id, name: res.name };
}

export async function mergeOpsRefsAction(fromId: number, intoId: number): Promise<Result> {
  const res = await mergeOpsRefs(fromId, intoId);
  if (!res.ok) return { ok: false, error: res.error };
  refresh();
  return { ok: true, id: res.id };
}

export async function deleteOpsRefAction(id: number): Promise<Result> {
  const res = await deleteOpsRef(id);
  if (!res.ok) return { ok: false, error: res.error };
  refresh();
  // Say which happened. "Deleted" when it was retired would be a small lie
  // that costs somebody an hour when the name reappears on an old order.
  return {
    ok: true,
    note: res.retired
      ? "Kept and retired — orders point at it, so the old rows still read correctly."
      : undefined,
  };
}

export async function restoreOpsRefAction(id: number): Promise<Result> {
  const res = await restoreOpsRef(id);
  if (!res.ok) return { ok: false, error: res.error };
  refresh();
  return { ok: true };
}

export async function seedOpsStarterListsAction(companyId: number): Promise<Result> {
  const res = await seedOpsStarterLists(companyId);
  if (!res.ok) return { ok: false, error: res.error };
  refresh();
  return {
    ok: true,
    note: res.added === 0 ? "Everything on those lists is already here." : `Added ${res.added} entries.`,
  };
}

export async function copyOpsRefsFromAction(intoCompanyId: number, fromCompanyId: number): Promise<Result> {
  const res = await copyOpsRefsFrom(intoCompanyId, fromCompanyId);
  if (!res.ok) return { ok: false, error: res.error };
  refresh();
  return { ok: true, note: res.copied === 0 ? "Nothing new to copy." : `Copied ${res.copied} entries.` };
}

export async function setOpsExRateAction(rate: string): Promise<Result> {
  const cleaned = rate.replace(/[\s,]/g, "");
  const n = cleaned === "" ? 0 : Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return { ok: false, error: "That is not a rate." };
  await saveAppSettings({ opsDefaultExRate: n });
  refresh();
  return { ok: true, note: n === 0 ? "No rate will be offered." : `New lines will offer ${n.toLocaleString("en-GB")}.` };
}

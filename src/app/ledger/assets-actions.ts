"use server";

// The fixed asset register and depreciation (Stage 8) — thin wrappers.
//
// ⚠️ Every rule lives in `lib/ledger-assets*.ts`, which is the one door. An
// action that started making its own decisions would be a second set of rules
// for the same table.

import { revalidatePath } from "next/cache";
import {
  createAsset, disposeAsset, postDepreciation, unpostDepreciation, updateAsset,
  type AssetInput,
} from "@/lib/ledger-assets";

function refresh() {
  revalidatePath("/ledger/assets");
  // A depreciation posting shows in the entries list and every report.
  revalidatePath("/ledger", "layout");
}

export async function createAssetAction(companyId: number, input: AssetInput) {
  const res = await createAsset(companyId, input);
  if (res.ok) refresh();
  return res;
}

export async function updateAssetAction(id: number, input: Partial<AssetInput>) {
  const res = await updateAsset(id, input);
  if (res.ok) refresh();
  return res;
}

/** ⚠️ Disposing does not delete: the months it was in use really happened and
 *  the depreciation charged for them is in the books. */
export async function disposeAssetAction(id: number, on: string, proceeds: number | null) {
  const res = await disposeAsset(id, on, proceeds);
  if (res.ok) refresh();
  return res;
}

/** ⚠️ Dr depreciation · Cr accumulated, one voucher per company per month under
 *  a derived id, so the same month can never be charged twice. */
export async function postDepreciationAction(companyId: number, year: number, month: number) {
  const res = await postDepreciation(companyId, year, month);
  if (res.ok) refresh();
  return res;
}

/** ⚠️ A reversal, never an erasure. */
export async function unpostDepreciationAction(
  companyId: number, year: number, month: number, reason: string | null,
) {
  const res = await unpostDepreciation(companyId, year, month, reason);
  if (res.ok) refresh();
  return res;
}

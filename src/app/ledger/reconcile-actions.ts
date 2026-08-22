"use server";

// Bank reconciliation (Stage 8) — thin wrappers.
//
// ⚠️ NOTHING HERE, OR ANYWHERE BELOW IT, WRITES TO `gl_entries`. Ticking an
// entry off writes a row that POINTS at it, so the books stay append-only and a
// reconciliation can be undone without rewriting history.

import { revalidatePath } from "next/cache";
import {
  closeRec, createRec, deleteRec, reopenRec, setCleared,
} from "@/lib/ledger-reconcile";

function refresh() {
  revalidatePath("/ledger/reconcile", "layout");
}

export async function createRecAction(
  companyId: number,
  input: { accountId: number; statementDate: string; statementBalance: number; notes?: string | null },
) {
  const res = await createRec(companyId, input);
  if (res.ok) refresh();
  return res;
}

/** ⚠️ One entry clears ONCE, anywhere — the unique index is what stops the same
 *  payment being reconciled on two statements. */
export async function setClearedAction(recId: number, entryIds: number[], cleared: boolean, clearedOn?: string) {
  const res = await setCleared(recId, entryIds, cleared, clearedOn);
  if (res.ok) refresh();
  return res;
}

/** ⚠️ Only closes when it AGREES. A reconciliation with a difference still in it
 *  is a note saying nobody looked. */
export async function closeRecAction(id: number) {
  const res = await closeRec(id);
  if (res.ok) refresh();
  return res;
}

export async function reopenRecAction(id: number) {
  const res = await reopenRec(id);
  if (res.ok) refresh();
  return res;
}

export async function deleteRecAction(id: number) {
  const res = await deleteRec(id);
  if (res.ok) refresh();
  return res;
}

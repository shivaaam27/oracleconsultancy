"use server";

// Server actions for the Requisitions tab (Phase 3).
//
// Three separate verbs on purpose — raising, approving and receiving are three
// different people's jobs in the workbook (SHAO, HQ, KELVIN), and collapsing
// them into one "save" is how the spreadsheet lost the distinction between
// "approved" and "nobody has looked at it".

import { revalidatePath } from "next/cache";
import {
  createRequisition, approveRequisition, receiveRequisition, setRequisitionStatus,
  type RequisitionFields,
} from "@/lib/project-requisitions";

type Result = { ok: boolean; id?: number; error?: string };

function refresh(projectId: number) {
  revalidatePath(`/projects/${projectId}/requisitions`);
  revalidatePath(`/projects/${projectId}/budget`);   // balances change
  revalidatePath(`/projects/${projectId}`);
}

export async function createRequisitionAction(f: RequisitionFields): Promise<Result> {
  if (!f.itemCode?.trim()) return { ok: false, error: "Choose which budget item this is for." };
  const res = await createRequisition(f);
  if (!res.ok) return { ok: false, error: res.error };
  refresh(f.projectId);
  return { ok: true, id: res.id };
}

export async function approveRequisitionAction(id: number, projectId: number, approved: string): Promise<Result> {
  const res = await approveRequisition(id, approved);
  if (!res.ok) return { ok: false, error: res.error };
  refresh(projectId);
  return { ok: true, id };
}

export async function receiveRequisitionAction(
  id: number, projectId: number,
  f: { grnNo?: string | null; receivedDate?: string | null; qtyReceived?: string | null; amountReceived: string },
): Promise<Result> {
  const res = await receiveRequisition(id, f);
  if (!res.ok) return { ok: false, error: res.error };
  refresh(projectId);
  return { ok: true, id };
}

export async function setRequisitionStatusAction(
  id: number, projectId: number, status: "Rejected" | "Cancelled" | "Requested",
): Promise<Result> {
  const res = await setRequisitionStatus(id, status);
  if (!res.ok) return { ok: false, error: res.error };
  refresh(projectId);
  return { ok: true, id };
}

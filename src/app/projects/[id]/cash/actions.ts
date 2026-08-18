"use server";

// Server actions for the Cash tab (Phase 4) — payments released and money spent.

import { revalidatePath } from "next/cache";
import {
  createPayment, deletePayment, createExpenditure, deleteExpenditure,
  type PaymentFields, type ExpenditureFields,
} from "@/lib/project-cash";

type Result = { ok: boolean; id?: number; error?: string };

function refresh(projectId: number) {
  revalidatePath(`/projects/${projectId}/cash`);
  revalidatePath(`/projects/${projectId}/snapshot`);
  revalidatePath(`/projects/${projectId}`);
}

export async function createPaymentAction(f: PaymentFields): Promise<Result> {
  const res = await createPayment(f);
  if (!res.ok) return { ok: false, error: res.error };
  refresh(f.projectId);
  return { ok: true, id: res.id };
}

export async function deletePaymentAction(id: number, projectId: number): Promise<Result> {
  const res = await deletePayment(id);
  if (!res.ok) return { ok: false, error: res.error };
  refresh(projectId);
  return { ok: true, id };
}

export async function createExpenditureAction(f: ExpenditureFields): Promise<Result> {
  const res = await createExpenditure(f);
  if (!res.ok) return { ok: false, error: res.error };
  refresh(f.projectId);
  return { ok: true, id: res.id };
}

export async function deleteExpenditureAction(id: number, projectId: number): Promise<Result> {
  const res = await deleteExpenditure(id);
  if (!res.ok) return { ok: false, error: res.error };
  refresh(projectId);
  return { ok: true, id };
}

"use server";

// Server actions for payments and tenders (Stage 7).

import { revalidatePath } from "next/cache";
import {
  createPayment, updatePayment, archivePayment, type PaymentFields,
} from "@/lib/ops-payments";
import {
  createTender, updateTender, archiveTender, type TenderFields,
} from "@/lib/ops-tenders";

type Result = { ok: boolean; id?: number; error?: string };

function refresh() {
  revalidatePath("/ops/payments");
  // What is owed changes the report and the shipments' balances too.
  revalidatePath("/ops/report");
  revalidatePath("/ops/imports");
  revalidatePath("/ops");
}

export async function createPaymentAction(f: PaymentFields): Promise<Result> {
  const res = await createPayment(f);
  if (!res.ok) return { ok: false, error: res.error };
  refresh();
  return { ok: true, id: res.id };
}

export async function updatePaymentAction(id: number, patch: Partial<PaymentFields>): Promise<Result> {
  const res = await updatePayment(id, patch);
  if (!res.ok) return { ok: false, error: res.error };
  refresh();
  return { ok: true, id };
}

export async function archivePaymentAction(id: number, archived: boolean): Promise<Result> {
  const res = await archivePayment(id, archived);
  if (!res.ok) return { ok: false, error: res.error };
  refresh();
  return { ok: true, id };
}

/* ─────────────────────────────────────────────────────────────── tenders ─── */

function refreshTenders() {
  revalidatePath("/ops/funnel");
}

export async function createTenderAction(f: TenderFields): Promise<Result> {
  if (!f.description?.trim()) return { ok: false, error: "Say what the tender is for." };
  const res = await createTender(f);
  if (!res.ok) return { ok: false, error: res.error };
  refreshTenders();
  return { ok: true, id: res.id };
}

export async function updateTenderAction(id: number, patch: Partial<TenderFields>): Promise<Result> {
  const res = await updateTender(id, patch);
  if (!res.ok) return { ok: false, error: res.error };
  refreshTenders();
  return { ok: true, id };
}

export async function archiveTenderAction(id: number, archived: boolean): Promise<Result> {
  const res = await archiveTender(id, archived);
  if (!res.ok) return { ok: false, error: res.error };
  refreshTenders();
  return { ok: true, id };
}

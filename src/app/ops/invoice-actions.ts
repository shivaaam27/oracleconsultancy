"use server";

// Server actions for delivery and billing (Stage 5).

import { revalidatePath } from "next/cache";
import {
  createInvoice, updateInvoice, archiveInvoice, setLineInvoice,
  type InvoiceFields,
} from "@/lib/ops-invoices";

type Result = { ok: boolean; id?: number; error?: string };

function refresh() {
  revalidatePath("/ops/invoices");
  // A line reads whether it is delivered and billed off the document, so the
  // orders screen and the funnel both change when one does.
  revalidatePath("/ops");
  revalidatePath("/ops/funnel");
}

export async function createInvoiceAction(f: InvoiceFields): Promise<Result> {
  const res = await createInvoice(f);
  if (!res.ok) return { ok: false, error: res.error };
  refresh();
  return { ok: true, id: res.id };
}

export async function updateInvoiceAction(id: number, patch: Partial<InvoiceFields>): Promise<Result> {
  const res = await updateInvoice(id, patch);
  if (!res.ok) return { ok: false, error: res.error };
  refresh();
  return { ok: true, id };
}

export async function archiveInvoiceAction(id: number, archived: boolean): Promise<Result> {
  const res = await archiveInvoice(id, archived);
  if (!res.ok) return { ok: false, error: res.error };
  refresh();
  return { ok: true, id };
}

export async function setLineInvoiceAction(lineId: number, invoiceId: number | null): Promise<Result> {
  const res = await setLineInvoice(lineId, invoiceId);
  if (!res.ok) return { ok: false, error: res.error };
  refresh();
  return { ok: true, id: lineId };
}

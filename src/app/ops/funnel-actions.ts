"use server";

// Server actions for the funnel — enquiry → quote → order → invoice (Stage 4).

import { revalidatePath } from "next/cache";
import {
  createEnquiry, updateEnquiry, archiveEnquiry,
  type EnquiryFields,
} from "@/lib/ops-funnel";

type Result = { ok: boolean; id?: number; error?: string };

function refresh() {
  revalidatePath("/ops/funnel");
  // An enquiry names a PO; the orders screen shows nothing of the funnel today,
  // but the two are read together and a stale page is a wrong answer.
  revalidatePath("/ops");
}

export async function createEnquiryAction(f: EnquiryFields): Promise<Result> {
  if (!f.rfqNo?.trim()) return { ok: false, error: "Give the enquiry its RFQ number." };
  const res = await createEnquiry(f);
  if (!res.ok) return { ok: false, error: res.error };
  refresh();
  return { ok: true, id: res.id };
}

export async function updateEnquiryAction(
  id: number, patch: Partial<EnquiryFields>,
): Promise<Result> {
  const res = await updateEnquiry(id, patch);
  if (!res.ok) return { ok: false, error: res.error };
  refresh();
  return { ok: true, id };
}

export async function archiveEnquiryAction(id: number, archived: boolean): Promise<Result> {
  const res = await archiveEnquiry(id, archived);
  if (!res.ok) return { ok: false, error: res.error };
  refresh();
  return { ok: true, id };
}

"use server";

import { revalidatePath } from "next/cache";
import {
  markRequirementRequested,
  linkRequirementDocument,
  unlinkRequirementDocument,
  verifyRequirement,
  unverifyRequirement,
  waiveRequirement,
  unwaiveRequirement,
  addPersonRequirement,
  editPersonRequirement,
  removePersonRequirement,
  setRequirementReviewDate,
  syncPersonRequirements,
} from "@/lib/requirements";

type ReqInput = { label: string; category: string | null; mandatory: boolean };

type Res = { ok: true } | { ok: false; error: string };
type SyncRes = { ok: true; added: number; restored: number } | { ok: false; error: string };

async function wrap(fn: () => Promise<void>): Promise<Res> {
  try {
    await fn();
    revalidatePath("/people");
    revalidatePath("/documents");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function reqMarkRequested(id: number) {
  return wrap(() => markRequirementRequested(id));
}

/**
 * Email a person all their still-missing required documents (the branded request,
 * offering portal upload or reply-with-files) and flip those items to "requested".
 */
export async function requestDocumentsByEmail(
  personId: number,
): Promise<{ ok: boolean; reason?: string; error?: string; count?: number }> {
  const { sendDocumentRequestEmail } = await import("@/lib/doc-requests");
  const res = await sendDocumentRequestEmail({ personId, sender: { office: "admin", sourceTag: "doc-request:admin" } });
  if (res.ok) {
    revalidatePath("/people");
    revalidatePath("/documents");
  }
  return res;
}

/**
 * Draft (never send) a "documents needed" chase covering what's MISSING and what's
 * EXPIRED, with the reason for each. Lands in the Outbox as a Draft for the owner to
 * review and send — honouring the never-auto-send rule.
 */
export async function draftComplianceChaseAction(
  personId: number,
): Promise<{ ok: boolean; count: number; reason?: string }> {
  const { sb } = await import("@/db/supabase");
  const { data: person } = await sb.from("people").select("id,name,email").eq("id", personId).maybeSingle();
  if (!person) return { ok: false, count: 0, reason: "not-found" };
  const { data: reqs } = await sb
    .from("person_requirements")
    .select("label,status,review_date,mandatory")
    .eq("person_id", personId);
  const now = Date.now();
  const gaps = (reqs ?? [])
    .map((r) => {
      const label = ((r.label as string | null) ?? "").trim();
      if (!label) return null;
      const status = r.status as string;
      if (status === "missing" || status === "requested") return { label, why: "not yet provided" };
      const rd = r.review_date ? new Date(r.review_date as string).getTime() : null;
      if ((status === "received" || status === "verified") && rd && rd < now) return { label, why: "expired — please send an updated copy" };
      return null;
    })
    .filter((x): x is { label: string; why: string } => !!x);
  if (gaps.length === 0) return { ok: true, count: 0, reason: "no-items" };

  const name = person.name as string;
  const first = name.split(" ")[0];
  const body =
    `Hi ${first},\n\nTo keep your file complete and compliant, please send us the following:\n` +
    gaps.map((g) => `• ${g.label} (${g.why})`).join("\n") +
    `\n\nUpload them in the staff portal or simply reply with the files attached. Thank you.`;

  await sb.from("outbox").insert({
    channel: "EMAIL",
    recipient_name: name,
    recipient_contact: ((person.email as string | null) ?? "").trim() || null,
    subject: "Documents needed",
    body,
    message_type: "DOCUMENT REQUEST",
    status: "Draft",
    source: "compliance-chase:draft",
    person_id: personId,
    created_at: new Date().toISOString(),
  });
  revalidatePath("/outbox");
  return { ok: true, count: gaps.length };
}

export async function reqLinkDocument(id: number, documentId: number) {
  return wrap(() => linkRequirementDocument(id, documentId));
}
export async function reqUnlinkDocument(id: number) {
  return wrap(() => unlinkRequirementDocument(id));
}
export async function reqVerify(id: number) {
  return wrap(() => verifyRequirement(id));
}
export async function reqUnverify(id: number) {
  return wrap(() => unverifyRequirement(id));
}
export async function reqWaive(id: number, reason: string | null) {
  return wrap(() => waiveRequirement(id, reason));
}
export async function reqUnwaive(id: number) {
  return wrap(() => unwaiveRequirement(id));
}
export async function reqAdd(personId: number, input: ReqInput) {
  return wrap(() => addPersonRequirement(personId, input));
}
export async function reqEdit(id: number, input: ReqInput) {
  return wrap(() => editPersonRequirement(id, input));
}
export async function reqRemove(id: number) {
  return wrap(() => removePersonRequirement(id));
}
export async function reqSetReviewDate(id: number, reviewDate: string | null) {
  return wrap(() => setRequirementReviewDate(id, reviewDate));
}
export async function reqSync(personId: number): Promise<SyncRes> {
  try {
    const result = await syncPersonRequirements(personId);
    revalidatePath("/people");
    revalidatePath("/documents");
    return { ok: true, ...result };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

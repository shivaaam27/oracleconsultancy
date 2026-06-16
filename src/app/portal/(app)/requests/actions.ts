"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sb } from "@/db/supabase";
import { getPortalPerson, type PortalPerson } from "@/lib/portal-auth";
import { personRecipient } from "@/lib/notifications";
import { createDocument, uploadDocumentFile } from "@/lib/documents";
import {
  addRequestMessage,
  advanceRequest,
  canAddress,
  cancelRequest,
  decideRequest,
  raiseRequest,
} from "@/lib/requests";

/* Staff-portal Request Desk actions. Every mutation re-verifies the session
 * AND that the signed-in person is actually a participant — never trust the
 * URL or form. The owner-side equivalents live in src/app/requests/actions.ts. */

function stampFor(me: PortalPerson): string {
  const prefix =
    me.portalRole === "director"
      ? "portal-dir"
      : me.portalRole === "hr"
        ? "portal-hr"
        : me.portalRole === "manager"
          ? "portal-mgr"
          : "portal";
  return `${prefix}:${me.name}`;
}

export async function portalRaiseRequest(
  _prev: { error: string } | null,
  formData: FormData
): Promise<{ error: string } | null> {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");

  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim() || null;
  const category = String(formData.get("category") ?? "").trim() || null;
  const toRaw = String(formData.get("addresseeId") ?? "").trim();
  if (!title) return { error: "Say what you need in a few words." };
  if (!toRaw) return { error: "Choose who this request is for." };

  let toOwner = false;
  let addresseeId: number | null = null;
  if (toRaw === "owner") {
    toOwner = true;
  } else {
    addresseeId = Number(toRaw);
    if (!Number.isFinite(addresseeId) || !(await canAddress(me.id, addresseeId))) {
      return { error: "You can't address a request to that person." };
    }
  }

  const fileEntry = formData.get("attachment");
  const file = fileEntry instanceof File && fileEntry.size > 0 ? fileEntry : null;

  let newId: number;
  try {
    // Store any photo/file as a Document first, then attach it to the request.
    let attachmentDocumentId: number | null = null;
    let attachmentName: string | null = null;
    if (file) {
      attachmentDocumentId = await createDocument(
        { title: file.name, companyId: me.companyId ?? null, category: "Attachment" },
        stampFor(me)
      );
      await uploadDocumentFile(attachmentDocumentId, file);
      attachmentName = file.name;
    }
    const r = await raiseRequest({
      requesterId: me.id,
      addresseeId,
      toOwner,
      companyId: me.companyId,
      category,
      title,
      body,
      createdBy: stampFor(me),
      actorName: me.name,
      attachmentDocumentId,
      attachmentName,
    });
    newId = r.id;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not raise the request." };
  }

  revalidatePath("/portal/requests");
  revalidatePath("/requests");
  redirect(`/portal/requests/${newId}`);
}

async function loadParticipantRole(
  me: PortalPerson,
  requestId: number
): Promise<{ requester: boolean; addressee: boolean } | null> {
  const { data: req } = await sb
    .from("requests")
    .select("requester_id,addressee_id")
    .eq("id", requestId)
    .maybeSingle();
  if (!req) return null;
  return {
    requester: (req.requester_id as number) === me.id,
    addressee: (req.addressee_id as number | null) === me.id,
  };
}

export async function portalReplyRequest(
  requestId: number,
  body: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");
  const text = body.trim();
  if (!text) return { ok: false, error: "Write a message first." };
  const role = await loadParticipantRole(me, requestId);
  if (!role) return { ok: false, error: "Request not found." };
  if (!role.requester && !role.addressee) return { ok: false, error: "You're not on this request." };

  await addRequestMessage(requestId, text, stampFor(me), personRecipient(me.id), me.name);
  revalidatePath(`/portal/requests/${requestId}`);
  revalidatePath("/portal/requests");
  return { ok: true };
}

export async function portalDecideRequest(
  requestId: number,
  verdict: "approved" | "declined" | "noted",
  reason: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");
  const role = await loadParticipantRole(me, requestId);
  if (!role) return { ok: false, error: "Request not found." };
  if (!role.addressee) return { ok: false, error: "Only the person it's addressed to can decide this." };

  await decideRequest(requestId, verdict, reason?.trim() || null, stampFor(me), me.name);
  revalidatePath(`/portal/requests/${requestId}`);
  revalidatePath("/portal/requests");
  revalidatePath("/requests");
  return { ok: true };
}

export async function portalAdvanceRequest(
  requestId: number,
  status: "in_progress" | "done" | "needs_info" | "open"
): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");
  const role = await loadParticipantRole(me, requestId);
  if (!role) return { ok: false, error: "Request not found." };
  if (!role.addressee) return { ok: false, error: "Only the person it's addressed to can change this." };

  await advanceRequest(requestId, status, stampFor(me), me.name);
  revalidatePath(`/portal/requests/${requestId}`);
  revalidatePath("/portal/requests");
  revalidatePath("/requests");
  return { ok: true };
}

export async function portalCancelRequest(
  requestId: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");
  const role = await loadParticipantRole(me, requestId);
  if (!role) return { ok: false, error: "Request not found." };
  if (!role.requester) return { ok: false, error: "Only the person who raised it can withdraw it." };

  await cancelRequest(requestId, stampFor(me));
  revalidatePath(`/portal/requests/${requestId}`);
  revalidatePath("/portal/requests");
  revalidatePath("/requests");
  return { ok: true };
}

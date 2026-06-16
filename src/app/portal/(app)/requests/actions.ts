"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sb } from "@/db/supabase";
import { directReportIds, getPortalPerson, type PortalPerson } from "@/lib/portal-auth";
import { personRecipient } from "@/lib/notifications";
import { createDocument, uploadDocumentFile } from "@/lib/documents";
import {
  addRequestMessage,
  advanceRequest,
  canAddress,
  cancelRequest,
  convertRequestToTask,
  decideRequest,
  isRecipient,
  raiseRequest,
  type RaiseRecipient,
} from "@/lib/requests";

/* Staff-portal Request Desk actions. Every mutation re-verifies the session AND
 * that the signed-in person is actually a participant — never trust the URL or
 * form. The owner-side equivalents live in src/app/requests/actions.ts. */

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

async function uploadAttachment(me: PortalPerson, formData: FormData): Promise<{ id: number; name: string } | null> {
  const entry = formData.get("attachment");
  const file = entry instanceof File && entry.size > 0 ? entry : null;
  if (!file) return null;
  const id = await createDocument(
    { title: file.name, companyId: me.companyId ?? null, category: "Attachment" },
    stampFor(me)
  );
  await uploadDocumentFile(id, file);
  return { id, name: file.name };
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
  const toOwner = String(formData.get("toOwner") ?? "") === "1";
  const recipientIds = String(formData.get("recipientIds") ?? "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);

  if (!title) return { error: "Say what you need in a few words." };

  for (const id of recipientIds) {
    if (!(await canAddress(me.id, id))) return { error: "You can't address a request to one of those people." };
  }
  const recipients: RaiseRecipient[] = recipientIds.map((id) => ({ personId: id, isOwner: false }));
  if (toOwner) recipients.push({ personId: null, isOwner: true });
  if (recipients.length === 0) return { error: "Choose at least one person to send this to." };

  let newId: number;
  try {
    const att = await uploadAttachment(me, formData);
    const r = await raiseRequest({
      requesterId: me.id,
      fromOwner: false,
      recipients,
      companyId: me.companyId,
      category,
      title,
      body,
      createdBy: stampFor(me),
      actorName: me.name,
      attachmentDocumentId: att?.id ?? null,
      attachmentName: att?.name ?? null,
    });
    newId = r.id;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not raise the request." };
  }

  revalidatePath("/portal/requests");
  revalidatePath("/requests");
  redirect(`/portal/requests/${newId}`);
}

async function participantRole(
  me: PortalPerson,
  requestId: number
): Promise<{ requester: boolean; recipient: boolean } | null> {
  const { data: req } = await sb.from("requests").select("requester_id").eq("id", requestId).maybeSingle();
  if (!req) return null;
  return {
    requester: (req.requester_id as number | null) === me.id,
    recipient: await isRecipient(requestId, me.id),
  };
}

export async function portalReplyRequest(formData: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");
  const requestId = Number(formData.get("requestId"));
  const text = String(formData.get("body") ?? "").trim();
  if (!Number.isFinite(requestId)) return { ok: false, error: "Missing request." };
  const role = await participantRole(me, requestId);
  if (!role) return { ok: false, error: "Request not found." };
  if (!role.requester && !role.recipient) return { ok: false, error: "You're not on this request." };
  const att = await uploadAttachment(me, formData);
  if (!text && !att) return { ok: false, error: "Write a message or attach a file." };
  await addRequestMessage(requestId, text, stampFor(me), personRecipient(me.id), me.name, att?.id ?? null, att?.name ?? null);
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
  if (!(await isRecipient(requestId, me.id))) return { ok: false, error: "Only a recipient can decide this." };
  await decideRequest(requestId, verdict, reason?.trim() || null, stampFor(me), me.name, personRecipient(me.id));
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
  if (!(await isRecipient(requestId, me.id))) return { ok: false, error: "Only a recipient can change this." };
  await advanceRequest(requestId, status, stampFor(me), me.name, personRecipient(me.id));
  revalidatePath(`/portal/requests/${requestId}`);
  revalidatePath("/portal/requests");
  revalidatePath("/requests");
  return { ok: true };
}

export async function portalCancelRequest(requestId: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");
  const role = await participantRole(me, requestId);
  if (!role) return { ok: false, error: "Request not found." };
  if (!role.requester) return { ok: false, error: "Only the person who raised it can withdraw it." };
  await cancelRequest(requestId, stampFor(me));
  revalidatePath(`/portal/requests/${requestId}`);
  revalidatePath("/portal/requests");
  revalidatePath("/requests");
  return { ok: true };
}

export async function portalConvertRequest(formData: FormData): Promise<{ ok: true; taskCode: string } | { ok: false; error: string }> {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");
  if (me.portalRole !== "manager" && me.portalRole !== "hr" && me.portalRole !== "director") {
    return { ok: false, error: "Only managers, HR or directors can create tasks." };
  }
  const requestId = Number(formData.get("requestId"));
  const companyId = Number(formData.get("companyId"));
  const accountableId = Number(formData.get("accountableId"));
  const priority = String(formData.get("priority") ?? "Medium");
  const deadlineRaw = String(formData.get("deadline") ?? "").trim();
  if (!Number.isFinite(requestId)) return { ok: false, error: "Missing request." };
  if (!Number.isFinite(companyId)) return { ok: false, error: "Choose a company." };
  if (!Number.isFinite(accountableId)) return { ok: false, error: "Choose who's responsible." };
  if (!(await isRecipient(requestId, me.id))) return { ok: false, error: "Only a recipient can action this request." };

  // Managers can only assign within their team + own company; HR/directors anywhere.
  if (me.portalRole === "manager") {
    const allowedPeople = new Set([me.id, ...(await directReportIds(me.id))]);
    if (!allowedPeople.has(accountableId)) return { ok: false, error: "You can only assign to yourself or your team." };
    const { data: peopleRows } = await sb.from("people").select("company_id").in("id", [...allowedPeople]);
    const allowedCompanies = new Set((peopleRows ?? []).map((p) => p.company_id as number).filter(Boolean));
    if (!allowedCompanies.has(companyId)) return { ok: false, error: "You can't create tasks for that company." };
  } else {
    const { data: ok } = await sb.from("people").select("id").eq("id", accountableId).eq("active", true).maybeSingle();
    if (!ok) return { ok: false, error: "That person isn't available." };
  }

  const deadline = deadlineRaw ? new Date(deadlineRaw) : null;
  let taskCode: string;
  try {
    const r = await convertRequestToTask({
      requestId,
      companyId,
      accountableId,
      workingIds: [],
      priority,
      deadline,
      by: stampFor(me),
      actorName: me.name,
      actorRecipient: personRecipient(me.id),
    });
    taskCode = r.taskCode;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not create the task." };
  }
  revalidatePath(`/portal/requests/${requestId}`);
  revalidatePath("/portal/requests");
  revalidatePath("/requests");
  return { ok: true, taskCode };
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isAdminSession } from "@/lib/admin-auth";
import { createDocument, uploadDocumentFile } from "@/lib/documents";
import {
  addRequestMessage,
  advanceRequest,
  cancelRequest,
  convertRequestToTask,
  decideRequest,
  raiseRequest,
  type RaiseRecipient,
} from "@/lib/requests";

/* Owner-side Request Desk actions. The admin edge gate (src/proxy.ts) protects
 * the /requests routes; we also re-check the admin session here as defence in
 * depth. The owner acts as "admin" (recipient), stamps updates "web-ui", and
 * can address/decide/convert anything. */

const OWNER = "Oracle Consultancy";

async function uploadAttachment(formData: FormData): Promise<{ id: number; name: string } | null> {
  const entry = formData.get("attachment");
  const file = entry instanceof File && entry.size > 0 ? entry : null;
  if (!file) return null;
  const id = await createDocument({ title: file.name, companyId: null, category: "Attachment" }, "web-ui");
  await uploadDocumentFile(id, file);
  return { id, name: file.name };
}

export async function adminRaiseRequest(
  _prev: { error: string } | null,
  formData: FormData
): Promise<{ error: string } | null> {
  if (!(await isAdminSession())) return { error: "Not signed in." };
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim() || null;
  const category = String(formData.get("category") ?? "").trim() || null;
  const recipientIds = String(formData.get("recipientIds") ?? "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!title) return { error: "Say what the request is in a few words." };
  if (recipientIds.length === 0) return { error: "Choose who this is for." };
  const recipients: RaiseRecipient[] = recipientIds.map((id) => ({ personId: id, isOwner: false }));

  let newId: number;
  try {
    const att = await uploadAttachment(formData);
    const r = await raiseRequest({
      requesterId: null,
      fromOwner: true,
      recipients,
      companyId: null,
      category,
      title,
      body,
      createdBy: "web-ui",
      actorName: OWNER,
      attachmentDocumentId: att?.id ?? null,
      attachmentName: att?.name ?? null,
    });
    newId = r.id;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not raise the request." };
  }
  revalidatePath("/requests");
  revalidatePath("/portal/requests");
  redirect(`/requests/${newId}`);
}

export async function adminReplyRequest(formData: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await isAdminSession())) return { ok: false, error: "Not signed in." };
  const requestId = Number(formData.get("requestId"));
  const text = String(formData.get("body") ?? "").trim();
  if (!Number.isFinite(requestId)) return { ok: false, error: "Missing request." };
  const att = await uploadAttachment(formData);
  if (!text && !att) return { ok: false, error: "Write a message or attach a file." };
  await addRequestMessage(requestId, text, "web-ui", "admin", OWNER, att?.id ?? null, att?.name ?? null);
  revalidatePath(`/requests/${requestId}`);
  revalidatePath("/requests");
  return { ok: true };
}

export async function adminDecideRequest(
  requestId: number,
  verdict: "approved" | "declined" | "noted",
  reason: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await isAdminSession())) return { ok: false, error: "Not signed in." };
  await decideRequest(requestId, verdict, reason?.trim() || null, "web-ui", OWNER, "admin");
  revalidatePath(`/requests/${requestId}`);
  revalidatePath("/requests");
  return { ok: true };
}

export async function adminAdvanceRequest(
  requestId: number,
  status: "in_progress" | "done" | "needs_info" | "open"
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await isAdminSession())) return { ok: false, error: "Not signed in." };
  await advanceRequest(requestId, status, "web-ui", OWNER, "admin");
  revalidatePath(`/requests/${requestId}`);
  revalidatePath("/requests");
  return { ok: true };
}

export async function adminCancelRequest(requestId: number): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await isAdminSession())) return { ok: false, error: "Not signed in." };
  await cancelRequest(requestId, "web-ui");
  revalidatePath(`/requests/${requestId}`);
  revalidatePath("/requests");
  return { ok: true };
}

export async function adminConvertRequest(formData: FormData): Promise<{ ok: true; taskCode: string } | { ok: false; error: string }> {
  if (!(await isAdminSession())) return { ok: false, error: "Not signed in." };
  const requestId = Number(formData.get("requestId"));
  const companyId = Number(formData.get("companyId"));
  const accountableId = Number(formData.get("accountableId"));
  const priority = String(formData.get("priority") ?? "Medium");
  const deadlineRaw = String(formData.get("deadline") ?? "").trim();
  if (!Number.isFinite(requestId)) return { ok: false, error: "Missing request." };
  if (!Number.isFinite(companyId)) return { ok: false, error: "Choose a company." };
  if (!Number.isFinite(accountableId)) return { ok: false, error: "Choose who's responsible." };
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
      by: "web-ui",
      actorName: OWNER,
      actorRecipient: "admin",
    });
    taskCode = r.taskCode;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not create the task." };
  }
  revalidatePath(`/requests/${requestId}`);
  revalidatePath("/requests");
  return { ok: true, taskCode };
}

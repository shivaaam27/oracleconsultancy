"use server";

import { revalidatePath } from "next/cache";
import { isAdminSession } from "@/lib/admin-auth";
import { addRequestMessage, advanceRequest, decideRequest } from "@/lib/requests";

/* Owner-side Request Desk actions. The admin edge gate (src/proxy.ts) protects
 * the /requests routes; we also re-check the admin session here as defence in
 * depth, since a server action can be invoked by id from anywhere. The owner
 * acts as "admin" (recipient) and stamps updates as "web-ui". */

const OWNER_NAME = "Oracle Consultancy";

export async function adminReplyRequest(
  requestId: number,
  body: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await isAdminSession())) return { ok: false, error: "Not signed in." };
  const text = body.trim();
  if (!text) return { ok: false, error: "Write a message first." };
  await addRequestMessage(requestId, text, "web-ui", "admin", OWNER_NAME);
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
  await decideRequest(requestId, verdict, reason?.trim() || null, "web-ui", OWNER_NAME);
  revalidatePath(`/requests/${requestId}`);
  revalidatePath("/requests");
  return { ok: true };
}

export async function adminAdvanceRequest(
  requestId: number,
  status: "in_progress" | "done" | "needs_info" | "open"
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await isAdminSession())) return { ok: false, error: "Not signed in." };
  await advanceRequest(requestId, status, "web-ui", OWNER_NAME);
  revalidatePath(`/requests/${requestId}`);
  revalidatePath("/requests");
  return { ok: true };
}

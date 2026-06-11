"use server";

import { revalidatePath } from "next/cache";
import { sb } from "@/db/supabase";
import { DOCUMENTS_BUCKET, signDocumentFile } from "@/lib/documents";
import { parseMentionIds, type MentionCandidate } from "@/lib/mentions";
import {
  ADMIN,
  type Attachment,
  createGroup,
  editMessage,
  getOrCreateDm,
  getThreadDetail,
  listThreadsFor,
  markRead,
  personParticipant,
  sendMessage,
  setMuted,
  softDeleteMessage,
  threadMessages,
  viewerInThread,
} from "@/lib/chat";

/* Admin (owner) chat actions. Admin routes are gated by middleware, so the
 * actor here is always ADMIN. Every thread touch still re-checks membership. */

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/_+/g, "_").slice(0, 120) || "file";
}

export async function listMyThreads() {
  return listThreadsFor(ADMIN);
}

export async function listPeople(): Promise<MentionCandidate[]> {
  const { data } = await sb.from("people").select("id,name").eq("active", true).order("name");
  return (data ?? []).map((p) => ({ id: p.id as number, name: p.name as string }));
}

export async function openThread(threadId: number) {
  if (!(await viewerInThread(threadId, ADMIN))) return { ok: false as const, error: "Not found" };
  const [detail, messages] = await Promise.all([getThreadDetail(threadId, ADMIN), threadMessages(threadId)]);
  await markRead(threadId, ADMIN);
  return { ok: true as const, detail, messages };
}

export async function startDm(personId: number): Promise<{ ok: true; threadId: number }> {
  const threadId = await getOrCreateDm(ADMIN, personParticipant(personId), ADMIN);
  revalidatePath("/chat");
  return { ok: true, threadId };
}

export async function newGroup(input: {
  title: string;
  personIds: number[];
  companyId?: number | null;
}): Promise<{ ok: true; threadId: number } | { ok: false; error: string }> {
  if (!input.title.trim()) return { ok: false, error: "Give the group a name." };
  if (input.personIds.length === 0) return { ok: false, error: "Add at least one person." };
  const threadId = await createGroup({
    title: input.title,
    companyId: input.companyId ?? null,
    createdBy: ADMIN,
    participants: input.personIds.map(personParticipant),
  });
  revalidatePath("/chat");
  return { ok: true, threadId };
}

export async function postMessage(
  fd: FormData
): Promise<{ ok: true; messageId: number } | { ok: false; error: string }> {
  const threadId = Number(fd.get("threadId"));
  if (!threadId || !(await viewerInThread(threadId, ADMIN))) return { ok: false, error: "Not allowed." };
  const body = (fd.get("body")?.toString() ?? "").trim();
  const taskCode = (fd.get("taskCode")?.toString() ?? "").trim() || null;
  const files = fd.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (!body && files.length === 0) return { ok: false, error: "Type a message or attach a file." };

  const attachments: Attachment[] = [];
  for (const file of files) {
    const path = `chat/${threadId}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${safeName(file.name)}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error } = await sb.storage
      .from(DOCUMENTS_BUCKET)
      .upload(path, buffer, { contentType: file.type || "application/octet-stream", upsert: true });
    if (error) return { ok: false, error: error.message };
    attachments.push({ name: file.name, path, type: file.type || "", size: file.size });
  }

  const candidates = await listPeople();
  const mentionPersonIds = parseMentionIds(body, candidates);

  const messageId = await sendMessage({
    threadId,
    sender: ADMIN,
    body,
    attachments,
    taskCode,
    mentionPersonIds,
  });
  revalidatePath(`/chat/${threadId}`);
  revalidatePath("/chat");
  return { ok: true, messageId };
}

export async function editChatMessage(messageId: number, body: string) {
  const ok = await editMessage(messageId, ADMIN, body.trim());
  return { ok };
}

export async function deleteChatMessage(messageId: number) {
  const ok = await softDeleteMessage(messageId, ADMIN);
  return { ok };
}

export async function muteThread(threadId: number, muted: boolean) {
  await setMuted(threadId, ADMIN, muted);
  revalidatePath("/chat");
  return { ok: true };
}

export async function signChatAttachment(path: string): Promise<{ url: string | null }> {
  return { url: await signDocumentFile(path) };
}

"use server";

import { revalidatePath } from "next/cache";
import { sb } from "@/db/supabase";
import { DOCUMENTS_BUCKET, signDocumentFile } from "@/lib/documents";
import { safeFileName, MAX_UPLOAD_BYTES } from "@/lib/documents-shared";
import { ingestAttachmentDocument } from "@/app/documents/actions";
import { parseMentionIds, type MentionCandidate } from "@/lib/mentions";
import {
  ADMIN,
  type Attachment,
  archiveThreadForEveryone,
  createGroup,
  editMessage,
  getOrCreateDm,
  getThreadDetail,
  hardDeleteMessage,
  hideMessageForViewer,
  hideThreadForViewer,
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


export async function listMyThreads() {
  return listThreadsFor(ADMIN);
}

export async function listPeople(): Promise<MentionCandidate[]> {
  const { data } = await sb.from("people").select("id,name").eq("active", true).order("name");
  return (data ?? []).map((p) => ({ id: p.id as number, name: p.name as string }));
}

export async function openThread(threadId: number) {
  if (!(await viewerInThread(threadId, ADMIN))) return { ok: false as const, error: "Not found" };
  const [detail, messages] = await Promise.all([getThreadDetail(threadId, ADMIN, "owner"), threadMessages(threadId, ADMIN)]);
  await markRead(threadId, ADMIN);
  return { ok: true as const, detail, messages };
}

/** Read-only refetch — NO markRead (so realtime/poll refreshes can't feed a
 *  read-receipt loop). Used by the live channel + polling. */
export async function refreshThread(threadId: number) {
  if (!(await viewerInThread(threadId, ADMIN))) return { ok: false as const, error: "Not found" };
  const [detail, messages] = await Promise.all([getThreadDetail(threadId, ADMIN, "owner"), threadMessages(threadId, ADMIN)]);
  return { ok: true as const, detail, messages };
}

/** Mark a thread read for the owner (clears the badge; broadcasts a "read"
 *  event for the other side's seen-ticks). Fire-and-forget from the client. */
export async function markThreadRead(threadId: number) {
  if (!(await viewerInThread(threadId, ADMIN))) return { ok: false };
  await markRead(threadId, ADMIN);
  return { ok: true };
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
  if (files.some((f) => f.size > MAX_UPLOAD_BYTES)) return { ok: false, error: "That file is too large (max 20 MB)." };

  // A task thread carries a company; scope any filed attachment to it.
  const { data: thr } = await sb.from("chat_threads").select("company_id").eq("id", threadId).maybeSingle();
  const threadCompanyId = (thr?.company_id as number | null) ?? null;

  const attachments: Attachment[] = [];
  for (const file of files) {
    const path = `chat/${threadId}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${safeFileName(file.name)}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error } = await sb.storage
      .from(DOCUMENTS_BUCKET)
      .upload(path, buffer, { contentType: file.type || "application/octet-stream", upsert: true });
    if (error) return { ok: false, error: error.message };
    // Also make it a first-class Command-Centre document (points at the SAME
    // stored object), so a file shared in chat is classified, owned, deduped and
    // searchable like any other. Best-effort — a hiccup never blocks the message.
    let documentId: number | undefined;
    try {
      const r = await ingestAttachmentDocument({ file, createdBy: ADMIN, contextCompanyId: threadCompanyId, existingStoragePath: path });
      documentId = r.documentId;
    } catch { /* keep the chat message even if the document copy fails */ }
    attachments.push({ name: file.name, path, type: file.type || "", size: file.size, documentId });
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
  // Command Centre (owner) has full edit/delete access (bar system channels).
  const ok = await editMessage(messageId, { participant: ADMIN, role: "owner" }, body.trim());
  return { ok };
}

export async function deleteChatMessage(messageId: number) {
  const ok = await softDeleteMessage(messageId, { participant: ADMIN, role: "owner" });
  return { ok };
}

/** "Delete for me" — hide one message for the owner only. */
export async function hideChatMessage(messageId: number) {
  return { ok: await hideMessageForViewer(messageId, ADMIN) };
}

/** Owner-only hard purge — permanently removes a message. */
export async function purgeChatMessage(messageId: number) {
  return { ok: await hardDeleteMessage(messageId, { participant: ADMIN, role: "owner" }) };
}

/** "Delete conversation for me" — hide a whole thread from the owner's list. */
export async function hideThread(threadId: number) {
  const ok = await hideThreadForViewer(threadId, ADMIN);
  if (ok) revalidatePath("/chat");
  return { ok };
}

/** "Delete conversation for everyone" — owner archives the whole thread. */
export async function deleteThreadForEveryone(threadId: number) {
  const ok = await archiveThreadForEveryone(threadId, { participant: ADMIN, role: "owner" });
  if (ok) revalidatePath("/chat");
  return { ok };
}

export async function muteThread(threadId: number, muted: boolean) {
  await setMuted(threadId, ADMIN, muted);
  revalidatePath("/chat");
  return { ok: true };
}

export async function signChatAttachment(path: string): Promise<{ url: string | null }> {
  // Defence-in-depth (admin is already gated by middleware): only sign files that
  // live under a chat thread the owner belongs to, never an arbitrary bucket path.
  const match = /^chat\/(\d+)\//.exec(path);
  if (!match) return { url: null };
  const threadId = Number(match[1]);
  if (!(await viewerInThread(threadId, ADMIN))) return { url: null };
  return { url: await signDocumentFile(path) };
}

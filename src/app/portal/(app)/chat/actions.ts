"use server";

import { revalidatePath } from "next/cache";
import { sb } from "@/db/supabase";
import { DOCUMENTS_BUCKET, signDocumentFile } from "@/lib/documents";
import { parseMentionIds, type MentionCandidate } from "@/lib/mentions";
import { getPortalPerson, personCanSeeTask } from "@/lib/portal-auth";
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
  threadFromTask,
  threadMessages,
  viewerInThread,
} from "@/lib/chat";

/* Staff-portal chat actions. The actor is always the signed-in portal person;
 * every thread touch re-checks membership so URLs can't be guessed. */

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/_+/g, "_").slice(0, 120) || "file";
}

async function me(): Promise<{ id: number; participant: string; isManager: boolean } | null> {
  const p = await getPortalPerson();
  if (!p) return null;
  return { id: p.id, participant: personParticipant(p.id), isManager: p.portalRole === "manager" };
}

export async function listMyThreads() {
  const m = await me();
  if (!m) return [];
  return listThreadsFor(m.participant);
}

/** People a staff member can start a chat with: every other active person
 *  (everyone ↔ everyone) plus the owner, surfaced as the "Owner" pseudo-person. */
export async function listPeople(): Promise<MentionCandidate[]> {
  const { data } = await sb.from("people").select("id,name").eq("active", true).order("name");
  return (data ?? []).map((p) => ({ id: p.id as number, name: p.name as string }));
}

export async function openThread(threadId: number) {
  const m = await me();
  if (!m) return { ok: false as const, error: "Signed out" };
  if (!(await viewerInThread(threadId, m.participant))) return { ok: false as const, error: "Not found" };
  const [detail, messages] = await Promise.all([getThreadDetail(threadId, m.participant), threadMessages(threadId)]);
  await markRead(threadId, m.participant);
  return { ok: true as const, detail, messages, me: m.participant };
}

/** Read-only refetch — NO markRead (so realtime/poll refreshes can't feed a
 *  read-receipt loop). Used by the live channel + polling. */
export async function refreshThread(threadId: number) {
  const m = await me();
  if (!m) return { ok: false as const, error: "Signed out" };
  if (!(await viewerInThread(threadId, m.participant))) return { ok: false as const, error: "Not found" };
  const [detail, messages] = await Promise.all([getThreadDetail(threadId, m.participant), threadMessages(threadId)]);
  return { ok: true as const, detail, messages };
}

/** Mark a thread read for the signed-in person (clears the badge; broadcasts a
 *  "read" event for the other side's seen-ticks). Fire-and-forget. */
export async function markThreadRead(threadId: number) {
  const m = await me();
  if (!m) return { ok: false };
  if (!(await viewerInThread(threadId, m.participant))) return { ok: false };
  await markRead(threadId, m.participant);
  return { ok: true };
}

/** Start a DM with another person, or with the owner (personId === 0 → admin). */
export async function startDm(personId: number): Promise<{ ok: true; threadId: number } | { ok: false; error: string }> {
  const m = await me();
  if (!m) return { ok: false, error: "Signed out" };
  const other = personId === 0 ? ADMIN : personParticipant(personId);
  if (other === m.participant) return { ok: false, error: "You can't message yourself." };
  const threadId = await getOrCreateDm(m.participant, other, m.participant);
  revalidatePath("/portal/chat");
  return { ok: true, threadId };
}

/** Ad-hoc groups: managers only (everyone else gets added by a manager or via
 *  a task thread). */
export async function newGroup(input: {
  title: string;
  personIds: number[];
}): Promise<{ ok: true; threadId: number } | { ok: false; error: string }> {
  const m = await me();
  if (!m) return { ok: false, error: "Signed out" };
  if (!m.isManager) return { ok: false, error: "Only managers can create groups." };
  if (!input.title.trim()) return { ok: false, error: "Give the group a name." };
  if (input.personIds.length === 0) return { ok: false, error: "Add at least one person." };
  const threadId = await createGroup({
    title: input.title,
    createdBy: m.participant,
    participants: input.personIds.map(personParticipant),
  });
  revalidatePath("/portal/chat");
  return { ok: true, threadId };
}

/** Open (or create) the group chat for a task the staff member is on. */
export async function openTaskThread(
  taskId: number,
  code: string
): Promise<{ ok: true; threadId: number } | { ok: false; error: string }> {
  const p = await getPortalPerson();
  if (!p) return { ok: false, error: "Signed out" };
  if (!(await personCanSeeTask(p, taskId))) return { ok: false, error: "Not allowed." };
  const threadId = await threadFromTask(taskId, code, personParticipant(p.id));
  revalidatePath("/portal/chat");
  return { ok: true, threadId };
}

export async function postMessage(
  fd: FormData
): Promise<{ ok: true; messageId: number } | { ok: false; error: string }> {
  const m = await me();
  if (!m) return { ok: false, error: "Signed out" };
  const threadId = Number(fd.get("threadId"));
  if (!threadId || !(await viewerInThread(threadId, m.participant))) return { ok: false, error: "Not allowed." };
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
    sender: m.participant,
    body,
    attachments,
    taskCode,
    mentionPersonIds,
  });
  revalidatePath(`/portal/chat/${threadId}`);
  revalidatePath("/portal/chat");
  return { ok: true, messageId };
}

export async function editChatMessage(messageId: number, body: string) {
  const m = await me();
  if (!m) return { ok: false };
  return { ok: await editMessage(messageId, m.participant, body.trim()) };
}

export async function deleteChatMessage(messageId: number) {
  const m = await me();
  if (!m) return { ok: false };
  return { ok: await softDeleteMessage(messageId, m.participant) };
}

export async function muteThread(threadId: number, muted: boolean) {
  const m = await me();
  if (!m) return { ok: false };
  await setMuted(threadId, m.participant, muted);
  revalidatePath("/portal/chat");
  return { ok: true };
}

export async function signChatAttachment(path: string): Promise<{ url: string | null }> {
  return { url: await signDocumentFile(path) };
}

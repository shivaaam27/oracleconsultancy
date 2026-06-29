import "server-only";
import { after } from "next/server";
import { sb } from "@/db/supabase";

/* ------------------------------------------------------------------ *
 * Chat — free-standing messaging, separate from task `task_updates`.
 *
 * Participants use the same string convention as notifications/task_views:
 * "admin" (the owner) or "person:<id>" (a portal user). Threads are either
 * 1:1 DMs (deduped via dmKey) or ad-hoc groups. Messages are kept forever
 * (soft-delete only). See memory/chat_system.md.
 * ------------------------------------------------------------------ */

export const ADMIN = "admin";
// One-way "system" senders for the per-person Task reminders / Announcements
// threads. They are message SENDERS only, never participants, so the recipient
// (the only participant) always gets the push.
export const SYSTEM_REMINDERS = "system:reminders";
export const SYSTEM_ANNOUNCE = "system:announce";
export function personParticipant(personId: number): string {
  return `person:${personId}`;
}
export function participantPersonId(p: string): number | null {
  return p.startsWith("person:") ? Number(p.slice(7)) || null : null;
}

/** Stable dedup key for a DM pair (sorted), e.g. "admin|person:5". */
function dmKeyFor(a: string, b: string): string {
  return [a, b].sort().join("|");
}

export type Attachment = { name: string; path: string; type?: string; size?: number };

export type ChatMessage = {
  id: number;
  threadId: number;
  sender: string;
  senderName: string;
  body: string;
  attachments: Attachment[];
  taskCode: string | null;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
};

export type ChatKind = "dm" | "group" | "system";

export type ThreadSummary = {
  id: number;
  kind: ChatKind;
  title: string; // resolved display title (other person for DMs)
  companyId: number | null;
  lastMessageAt: string | null;
  preview: string | null;
  unread: number;
  muted: boolean;
};

export type ThreadDetail = {
  id: number;
  kind: ChatKind;
  title: string;
  companyId: number | null;
  participants: { participant: string; name: string; lastReadAt: string | null }[];
};

/* --------------------------- name resolution --------------------------- */

/** Display name for a participant string. */
export async function participantName(p: string): Promise<string> {
  if (p === ADMIN) return "Owner";
  if (p === SYSTEM_REMINDERS) return "Task reminders";
  if (p === SYSTEM_ANNOUNCE) return "Announcements";
  const id = participantPersonId(p);
  if (id == null) return p;
  const { data } = await sb.from("people").select("name").eq("id", id).maybeSingle();
  return (data?.name as string) ?? p;
}

/** Resolve several participants to names in one round-trip. */
async function nameMap(participants: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const ids: number[] = [];
  for (const p of participants) {
    if (p === ADMIN) map.set(p, "Owner");
    else if (p === SYSTEM_REMINDERS) map.set(p, "Task reminders");
    else if (p === SYSTEM_ANNOUNCE) map.set(p, "Announcements");
    else {
      const id = participantPersonId(p);
      if (id != null) ids.push(id);
    }
  }
  if (ids.length) {
    const { data } = await sb.from("people").select("id,name").in("id", ids);
    for (const r of data ?? []) map.set(personParticipant(r.id as number), r.name as string);
  }
  return map;
}

/* --------------------------- access gate --------------------------- */

/** True if the viewer is a participant of the thread. Every read/write
 *  re-checks this so thread URLs cannot be guessed. */
export async function viewerInThread(threadId: number, viewer: string): Promise<boolean> {
  const { data } = await sb
    .from("chat_participants")
    .select("participant")
    .eq("thread_id", threadId)
    .eq("participant", viewer)
    .maybeSingle();
  return Boolean(data);
}

/** True if the thread is a one-way SYSTEM channel (Task reminders / Announcements),
 *  which are read-only — nobody posts into them from the UI. */
export async function isSystemThread(threadId: number): Promise<boolean> {
  const { data } = await sb.from("chat_threads").select("kind").eq("id", threadId).maybeSingle();
  return (data?.kind as string | null) === "system";
}

/* --------------------------- create / find --------------------------- */

/** Find or create the 1:1 DM thread between two participants. */
export async function getOrCreateDm(a: string, b: string, createdBy: string): Promise<number> {
  const key = dmKeyFor(a, b);
  const { data: existing } = await sb.from("chat_threads").select("id").eq("dm_key", key).maybeSingle();
  if (existing) return existing.id as number;
  const now = new Date().toISOString();
  const { data: thread } = await sb
    .from("chat_threads")
    .insert({ kind: "dm", dm_key: key, created_by: createdBy, created_at: now })
    .select("id")
    .single();
  const threadId = thread!.id as number;
  await sb.from("chat_participants").insert([
    { thread_id: threadId, participant: a, role: "member", joined_at: now },
    { thread_id: threadId, participant: b, role: "member", joined_at: now },
  ]);
  return threadId;
}

/** Create an ad-hoc group thread. `createdBy` becomes its owner. */
export async function createGroup(input: {
  title: string;
  companyId?: number | null;
  createdBy: string;
  participants: string[]; // should include createdBy
}): Promise<number> {
  const now = new Date().toISOString();
  const { data: thread } = await sb
    .from("chat_threads")
    .insert({
      kind: "group",
      title: input.title.trim() || "Group",
      company_id: input.companyId ?? null,
      created_by: input.createdBy,
      created_at: now,
    })
    .select("id")
    .single();
  const threadId = thread!.id as number;
  const members = Array.from(new Set([input.createdBy, ...input.participants]));
  await sb.from("chat_participants").insert(
    members.map((p) => ({
      thread_id: threadId,
      participant: p,
      role: p === input.createdBy ? "owner" : "member",
      joined_at: now,
    }))
  );
  return threadId;
}

/** Find or create a group seeded from a task's people (owner + assignees +
 *  the admin owner). Deduped per task via the dmKey column ("task:<id>"). */
export async function threadFromTask(taskId: number, code: string, createdBy: string): Promise<number> {
  const key = `task:${taskId}`;
  const { data: existing } = await sb.from("chat_threads").select("id").eq("dm_key", key).maybeSingle();
  if (existing) return existing.id as number;
  const [{ data: task }, { data: assignees }] = await Promise.all([
    sb.from("tasks").select("owner_id,company_id").eq("id", taskId).maybeSingle(),
    sb.from("task_assignees").select("person_id").eq("task_id", taskId),
  ]);
  const personIds = new Set<number>();
  if (task?.owner_id != null) personIds.add(task.owner_id as number);
  for (const a of assignees ?? []) personIds.add(a.person_id as number);
  // ALWAYS include the sender (createdBy) — a director/manager messaging a task's
  // group isn't necessarily an assignee, and if they're not a participant the
  // thread never shows in THEIR chat list (the recipients still see it). Dedupe
  // so admin/an assignee who also created it isn't added twice.
  const participants = Array.from(
    new Set([ADMIN, createdBy, ...[...personIds].map(personParticipant)]),
  );
  const now = new Date().toISOString();
  const { data: thread } = await sb
    .from("chat_threads")
    .insert({
      kind: "group",
      title: `Task ${code}`,
      company_id: (task?.company_id as number | null) ?? null,
      dm_key: key,
      created_by: createdBy,
      created_at: now,
    })
    .select("id")
    .single();
  const threadId = thread!.id as number;
  await sb.from("chat_participants").insert(
    participants.map((p) => ({ thread_id: threadId, participant: p, role: "member", joined_at: now }))
  );
  return threadId;
}

/** Find or create a person's one-way SYSTEM thread (Task reminders / Announcements).
 *  Deduped per person via dm_key "sys:<kind>:person:<id>". The person is the ONLY
 *  participant; messages are posted by a system sender, so the person always gets
 *  the push and these threads never clutter anyone else's chat list. */
export async function getOrCreateSystemThread(
  personId: number,
  kind: "reminders" | "announce",
  title: string,
): Promise<number> {
  const key = `sys:${kind}:person:${personId}`;
  const { data: existing } = await sb.from("chat_threads").select("id").eq("dm_key", key).maybeSingle();
  if (existing) return existing.id as number;
  const now = new Date().toISOString();
  const sender = kind === "reminders" ? SYSTEM_REMINDERS : SYSTEM_ANNOUNCE;
  const { data: thread } = await sb
    .from("chat_threads")
    .insert({ kind: "system", title, dm_key: key, created_by: sender, created_at: now })
    .select("id")
    .single();
  const threadId = thread!.id as number;
  await sb
    .from("chat_participants")
    .insert([{ thread_id: threadId, participant: personParticipant(personId), role: "member", joined_at: now }]);
  return threadId;
}

/** Post a one-way system message to a person (auto-creates their system thread).
 *  Reuses sendMessage, so notifications + push fire exactly like a normal chat. */
export async function postSystemMessage(input: {
  personId: number;
  kind: "reminders" | "announce";
  title: string;
  body: string;
  taskCode?: string | null;
  /** Skip the chat push (e.g. announcements that already pushed via the bell). */
  silent?: boolean;
}): Promise<number> {
  const threadId = await getOrCreateSystemThread(input.personId, input.kind, input.title);
  const sender = input.kind === "reminders" ? SYSTEM_REMINDERS : SYSTEM_ANNOUNCE;
  return sendMessage({ threadId, sender, body: input.body, taskCode: input.taskCode ?? null, silent: input.silent });
}

/* --------------------------- read --------------------------- */

/** All threads a participant belongs to, newest activity first, with unread
 *  counts and a one-line preview. */
export async function listThreadsFor(viewer: string): Promise<ThreadSummary[]> {
  const { data: memberships } = await sb
    .from("chat_participants")
    .select("thread_id,last_read_at,muted_at")
    .eq("participant", viewer);
  const rows = memberships ?? [];
  if (rows.length === 0) return [];
  const threadIds = rows.map((r) => r.thread_id as number);
  const readBy = new Map(rows.map((r) => [r.thread_id as number, r]));

  const { data: threads } = await sb
    .from("chat_threads")
    .select("id,kind,title,company_id,last_message_at")
    .in("id", threadIds)
    .is("archived_at", null)
    .order("last_message_at", { ascending: false, nullsFirst: false });

  // Resolve DM titles from the other participant.
  const { data: allParts } = await sb
    .from("chat_participants")
    .select("thread_id,participant")
    .in("thread_id", threadIds);
  const otherByThread = new Map<number, string>();
  for (const p of allParts ?? []) {
    const tid = p.thread_id as number;
    if (p.participant !== viewer && !otherByThread.has(tid)) otherByThread.set(tid, p.participant as string);
  }
  const names = await nameMap([...otherByThread.values()]);

  const summaries: ThreadSummary[] = [];
  for (const t of threads ?? []) {
    const id = t.id as number;
    const r = readBy.get(id);
    const lastRead = r?.last_read_at as string | null;
    // Unread = messages newer than lastRead, not sent by the viewer, not deleted.
    let unreadQuery = sb
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("thread_id", id)
      .neq("sender", viewer)
      .is("deleted_at", null);
    if (lastRead) unreadQuery = unreadQuery.gt("created_at", lastRead);
    const { count } = await unreadQuery;

    const { data: last } = await sb
      .from("chat_messages")
      .select("body,attachments,deleted_at")
      .eq("thread_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const preview = last
      ? last.deleted_at
        ? "Message deleted"
        : (last.body as string) || (last.attachments ? "📎 Attachment" : null)
      : null;

    const title =
      t.kind === "dm"
        ? names.get(otherByThread.get(id) ?? "") ?? "Direct message"
        : (t.title as string) ?? "Group";

    summaries.push({
      id,
      kind: t.kind as ChatKind,
      title,
      companyId: (t.company_id as number | null) ?? null,
      lastMessageAt: (t.last_message_at as string | null) ?? null,
      preview,
      unread: count ?? 0,
      muted: Boolean(r?.muted_at),
    });
  }
  return summaries;
}

/** Total unread across all of a participant's threads — for the pill badge. */
export async function unreadTotalFor(viewer: string): Promise<number> {
  const threads = await listThreadsFor(viewer);
  return threads.filter((t) => !t.muted).reduce((sum, t) => sum + t.unread, 0);
}

export async function getThreadDetail(threadId: number, viewer?: string): Promise<ThreadDetail | null> {
  const { data: t } = await sb
    .from("chat_threads")
    .select("id,kind,title,company_id")
    .eq("id", threadId)
    .maybeSingle();
  if (!t) return null;
  const { data: parts } = await sb
    .from("chat_participants")
    .select("participant,last_read_at")
    .eq("thread_id", threadId);
  const rows = parts ?? [];
  const ps = rows.map((p) => p.participant as string);
  const names = await nameMap(ps);
  const kind = t.kind as ChatKind;
  // DMs store no title — show the *other* person's name (from the viewer's seat).
  let title = (t.title as string) ?? "";
  if (kind === "dm") {
    const other = ps.find((p) => p !== viewer) ?? ps[0];
    title = (other && names.get(other)) || "Direct message";
  }
  return {
    id: t.id as number,
    kind,
    title,
    companyId: (t.company_id as number | null) ?? null,
    participants: rows.map((p) => ({
      participant: p.participant as string,
      name: names.get(p.participant as string) ?? (p.participant as string),
      lastReadAt: (p.last_read_at as string | null) ?? null,
    })),
  };
}

export async function threadMessages(threadId: number, limit = 200): Promise<ChatMessage[]> {
  const { data } = await sb
    .from("chat_messages")
    .select("id,thread_id,sender,body,attachments,task_code,created_at,edited_at,deleted_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(limit);
  const rows = data ?? [];
  const names = await nameMap([...new Set(rows.map((r) => r.sender as string))]);
  return rows.map((r) => ({
    id: r.id as number,
    threadId: r.thread_id as number,
    sender: r.sender as string,
    senderName: names.get(r.sender as string) ?? (r.sender as string),
    body: (r.body as string) ?? "",
    attachments: parseAttachments(r.attachments as string | null),
    taskCode: (r.task_code as string | null) ?? null,
    createdAt: r.created_at as string,
    editedAt: (r.edited_at as string | null) ?? null,
    deletedAt: (r.deleted_at as string | null) ?? null,
  }));
}

function parseAttachments(raw: string | null): Attachment[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/* --------------------------- write --------------------------- */

export async function sendMessage(input: {
  threadId: number;
  sender: string;
  body: string;
  attachments?: Attachment[];
  taskCode?: string | null;
  mentionPersonIds?: number[];
  /** Skip the notify/push fan-out (the caller already notified — e.g. an
   *  announcement that pushed via the notification bell). The message still
   *  lands in the thread + bumps unread. */
  silent?: boolean;
}): Promise<number> {
  const now = new Date().toISOString();
  const { data: msg } = await sb
    .from("chat_messages")
    .insert({
      thread_id: input.threadId,
      sender: input.sender,
      body: input.body,
      attachments: input.attachments && input.attachments.length ? JSON.stringify(input.attachments) : null,
      task_code: input.taskCode ?? null,
      created_at: now,
    })
    .select("id")
    .single();
  const messageId = msg!.id as number;

  // Bump thread activity + mark the sender's own read pointer.
  await Promise.all([
    sb.from("chat_threads").update({ last_message_at: now }).eq("id", input.threadId),
    sb
      .from("chat_participants")
      .update({ last_read_at: now })
      .eq("thread_id", input.threadId)
      .eq("participant", input.sender),
  ]);

  const mentionIds = input.mentionPersonIds ?? [];
  if (mentionIds.length) {
    await sb
      .from("chat_message_mentions")
      .insert(mentionIds.map((personId) => ({ message_id: messageId, person_id: personId })));
  }

  // Notifications + push are NOT on the critical path — defer them so the
  // composer gets its response immediately. Live delivery to open clients is
  // handled by a peer broadcast from the sender's browser (no server echo).
  if (!input.silent) after(() => notifyParticipants(input.threadId, input.sender, input.body, mentionIds));
  return messageId;
}

async function notifyParticipants(
  threadId: number,
  sender: string,
  body: string,
  mentionIds: number[]
): Promise<void> {
  try {
    const [{ data: parts }, detail] = await Promise.all([
      sb.from("chat_participants").select("participant,muted_at").eq("thread_id", threadId),
      getThreadDetail(threadId),
    ]);
    const senderName = await participantName(sender);
    const title = detail?.kind === "group" ? `${senderName} in ${detail.title}` : senderName;
    const mentioned = new Set(mentionIds.map(personParticipant));
    for (const p of parts ?? []) {
      const recipient = p.participant as string;
      if (recipient === sender) continue;
      if (p.muted_at) continue;
      await createChatNotification({
        recipient,
        threadId,
        kind: mentioned.has(recipient) ? "chat_mention" : "chat",
        title,
        body: body.slice(0, 140),
        actor: senderName,
      });
    }
  } catch {
    /* best effort */
  }
}

/** Chat notification (own insert because the shared createNotification is
 *  task-shaped). Pushes to the recipient's phone via the same channel. */
async function createChatNotification(input: {
  recipient: string;
  threadId: number;
  kind: "chat" | "chat_mention";
  title: string;
  body: string;
  actor: string;
}): Promise<void> {
  try {
    await sb.from("notifications").insert({
      recipient: input.recipient,
      kind: input.kind,
      thread_id: input.threadId,
      title: input.title,
      body: input.body || null,
      actor: input.actor,
      created_at: new Date().toISOString(),
    });
    const { sendToRecipient } = await import("./push");
    const base = input.recipient === ADMIN ? "/chat" : "/portal/chat";
    await sendToRecipient(input.recipient, {
      title: input.title,
      body: input.body,
      url: `${base}/${input.threadId}`,
      tag: `chat-${input.threadId}`,
    });
  } catch {
    /* best effort */
  }
}

export async function markRead(threadId: number, viewer: string): Promise<void> {
  await sb
    .from("chat_participants")
    .update({ last_read_at: new Date().toISOString() })
    .eq("thread_id", threadId)
    .eq("participant", viewer);
  // Live "seen" nudge to the other side is sent as a peer broadcast from the
  // client (chat-surface) after this returns — keeps it off the server path.
}

export async function editMessage(messageId: number, sender: string, body: string): Promise<boolean> {
  const { data: msg } = await sb
    .from("chat_messages")
    .select("sender,body,original_body")
    .eq("id", messageId)
    .maybeSingle();
  if (!msg || msg.sender !== sender) return false;
  await sb
    .from("chat_messages")
    .update({
      body,
      edited_at: new Date().toISOString(),
      original_body: (msg.original_body as string | null) ?? (msg.body as string),
    })
    .eq("id", messageId);
  return true;
}

export async function softDeleteMessage(messageId: number, sender: string): Promise<boolean> {
  const { data: msg } = await sb.from("chat_messages").select("sender,thread_id").eq("id", messageId).maybeSingle();
  if (!msg || msg.sender !== sender) return false;
  await sb.from("chat_messages").update({ deleted_at: new Date().toISOString() }).eq("id", messageId);
  return true;
}

export async function setMuted(threadId: number, viewer: string, muted: boolean): Promise<void> {
  await sb
    .from("chat_participants")
    .update({ muted_at: muted ? new Date().toISOString() : null })
    .eq("thread_id", threadId)
    .eq("participant", viewer);
}

/** A tiny stamp of a thread's state — drives the polling fallback in
 *  chat-realtime.tsx (mirrors /api/portal/sync). */
export async function threadStamp(threadId: number): Promise<string> {
  const { data } = await sb
    .from("chat_messages")
    .select("id,edited_at,deleted_at")
    .eq("thread_id", threadId)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { count } = await sb
    .from("chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("thread_id", threadId);
  // CONTENT only — deliberately excludes read pointers. markRead updates a
  // read pointer on every refetch; if that fed back into the stamp, polling
  // would re-trigger itself forever. Read-receipt ("seen") refreshes ride the
  // realtime "read" event instead (detail-only, never re-marks).
  return `${count ?? 0}:${data?.id ?? 0}:${data?.edited_at ?? ""}:${data?.deleted_at ?? ""}`;
}

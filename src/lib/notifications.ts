import "server-only";
import { sb } from "@/db/supabase";
import { sendToRecipient, queueDigestItem, isCritical } from "./push";
import { isQuietHoursNow, getAppSettings } from "./settings";

/* ------------------------------------------------------------------ *
 * In-app notifications (T4). Recipient is "admin" (the owner) or
 * "person:<id>" (a portal user). Created by the conversation actions on
 * @mention / reply / pinned instruction / task assignment, surfaced by
 * the bell in each pill.
 * ------------------------------------------------------------------ */

export type NotifKind = "mention" | "reply" | "pinned" | "assigned" | "chat" | "chat_mention" | "leave" | "announcement" | "request";

export type Notification = {
  id: number;
  kind: NotifKind;
  taskCode: string | null;
  threadId: number | null;
  requestId: number | null;
  title: string;
  body: string | null;
  actor: string | null;
  createdAt: string;
  readAt: string | null;
};

export function personRecipient(personId: number): string {
  return `person:${personId}`;
}

/** Resolve a task_update.created_by stamp to a notification recipient
 *  ("admin" or "person:<id>"), or null if it can't be resolved. */
export async function recipientForCreatedBy(by: string | null): Promise<string | null> {
  if (!by) return null;
  if (by === "web-ui" || by === "ai-command" || by === "meeting-mode") return "admin";
  const name = by.startsWith("portal-dir:")
    ? by.slice(11)
    : by.startsWith("portal-mgr:")
      ? by.slice(11)
      : by.startsWith("portal:")
        ? by.slice(7)
        : null;
  if (!name) return null;
  const { data } = await sb.from("people").select("id").ilike("name", name).maybeSingle();
  return data ? personRecipient(data.id as number) : null;
}

/** Notify a task's assignees (+ the admin owner) that an instruction was
 *  pinned. `exceptPersonId` skips the person who pinned it. */
export async function notifyPinned(taskId: number, code: string, actor: string, exceptPersonId: number | null): Promise<void> {
  const { data: people } = await sb.from("task_assignees").select("person_id").eq("task_id", taskId);
  const recipients = (people ?? [])
    .map((p) => p.person_id as number)
    .filter((id) => id !== exceptPersonId)
    .map(personRecipient);
  recipients.push("admin");
  await notifyMany(recipients, {
    kind: "pinned",
    taskId,
    taskCode: code,
    title: `${actor} pinned an instruction`,
    body: "Tap to read the current instruction.",
    actor,
  });
}

/** Create one notification. Never throws into the caller — notifications are
 *  best-effort and must not break the action that triggered them. */
export async function createNotification(input: {
  recipient: string;
  kind: NotifKind;
  // Task notifications carry a task; task-less ones (e.g. a leave request)
  // leave these null and deep-link to the surface below.
  taskId?: number | null;
  taskCode?: string | null;
  // Request deep-link target (kind "request").
  requestId?: number | null;
  title: string;
  body?: string | null;
  actor?: string | null;
}): Promise<void> {
  try {
    await sb.from("notifications").insert({
      recipient: input.recipient,
      kind: input.kind,
      task_id: input.taskId ?? null,
      task_code: input.taskCode ?? null,
      request_id: input.requestId ?? null,
      title: input.title,
      body: (input.body ?? "").slice(0, 200) || null,
      actor: input.actor ?? null,
      created_at: new Date().toISOString(),
    });
    // Push to the recipient's phone(s) too (T4b). Best-effort, no-op if push
    // isn't configured or they have no devices registered. Task-less notifs
    // open the relevant surface (the owner's leave page / the staff portal).
    const isAdmin = input.recipient === "admin";
    const url = input.taskCode
      ? isAdmin
        ? `/task/${input.taskCode}`
        : `/portal/task/${input.taskCode}`
      : input.requestId
        ? isAdmin
          ? `/requests/${input.requestId}`
          : `/portal/requests/${input.requestId}`
        : isAdmin
          ? `/hrms/leave`
          : `/portal/profile`;
    const tag = input.taskCode
      ? `task-${input.taskCode}`
      : input.requestId
        ? `request-${input.requestId}`
        : `notif-${input.kind}`;

    // Smart, calm delivery (the in-app row above is already written — the bell
    // never misses anything; here we only shape the DEVICE BUZZ):
    //  - critical kinds always push immediately;
    //  - else, during quiet hours OR when the digest is on, HOLD the buzz and
    //    let the consolidated cron flush it as one batched push.
    // Default (no quiet hours, digest off) → push immediately as before.
    const critical = isCritical(input.kind);
    let deferred = false;
    if (!critical) {
      const { notifyDigest } = await getAppSettings();
      const quiet = await isQuietHoursNow();
      if (notifyDigest || quiet) {
        await queueDigestItem(input.recipient, {
          kind: input.kind,
          title: input.title,
          body: input.body ?? "",
          url,
          tag,
          at: new Date().toISOString(),
        });
        deferred = true;
      }
    }

    if (!deferred) {
      await sendToRecipient(input.recipient, {
        title: input.title,
        body: input.body ?? "",
        url,
        tag,
        count: await unreadCount(input.recipient),
      });
    }
  } catch {
    /* swallow — best effort */
  }
}

/** Create the same notification for several recipients (deduped). */
export async function notifyMany(
  recipients: string[],
  input: Omit<Parameters<typeof createNotification>[0], "recipient">
): Promise<void> {
  const seen = new Set<string>();
  for (const r of recipients) {
    if (!r || seen.has(r)) continue;
    seen.add(r);
    await createNotification({ ...input, recipient: r });
  }
}

export async function listNotifications(recipient: string, limit = 30): Promise<Notification[]> {
  const { data } = await sb
    .from("notifications")
    .select("id,kind,task_code,thread_id,request_id,title,body,actor,created_at,read_at")
    .eq("recipient", recipient)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((n) => ({
    id: n.id as number,
    kind: n.kind as NotifKind,
    taskCode: (n.task_code as string | null) ?? null,
    threadId: (n.thread_id as number | null) ?? null,
    requestId: (n.request_id as number | null) ?? null,
    title: n.title as string,
    body: (n.body as string | null) ?? null,
    actor: (n.actor as string | null) ?? null,
    createdAt: n.created_at as string,
    readAt: (n.read_at as string | null) ?? null,
  }));
}

export async function unreadCount(recipient: string): Promise<number> {
  const { count } = await sb
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient", recipient)
    .is("read_at", null);
  return count ?? 0;
}

export async function markAllRead(recipient: string): Promise<void> {
  await sb
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient", recipient)
    .is("read_at", null);
}

/** Remove a single notification (scoped to its recipient so one user can
 *  never clear another's). Notifications are ephemeral signals — the durable
 *  record lives on the task/chat/request itself — so a hard delete is fine. */
export async function deleteNotification(recipient: string, id: number): Promise<void> {
  await sb.from("notifications").delete().eq("recipient", recipient).eq("id", id);
}

/** Clear every notification for a recipient ("Clear all"). */
export async function deleteAllNotifications(recipient: string): Promise<void> {
  await sb.from("notifications").delete().eq("recipient", recipient);
}

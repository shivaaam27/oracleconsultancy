import "server-only";
import { sb } from "@/db/supabase";
import { sendToRecipient, queueDigestItem, isCritical } from "./push";
import { isQuietHoursNow, getAppSettings } from "./settings";
import { NOTIF_RETENTION_DAYS, recurringKey, recurringTitleMatch } from "./notification-view";

/* ------------------------------------------------------------------ *
 * In-app notifications (T4). Recipient is "admin" (the owner) or
 * "person:<id>" (a portal user). Created by the conversation actions on
 * @mention / reply / pinned instruction / task assignment, surfaced by
 * the bell in each pill.
 * ------------------------------------------------------------------ */

export type NotifKind = "mention" | "reply" | "pinned" | "assigned" | "update" | "chat" | "chat_mention" | "leave" | "announcement" | "meeting";

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
      : by.startsWith("portal-hr:")
        ? by.slice(10)
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
  // Retained for the legacy `request_id` column; no current kind deep-links here.
  requestId?: number | null;
  title: string;
  body?: string | null;
  actor?: string | null;
}): Promise<void> {
  try {
    // Recurring items (the daily task reminder, ORI's daily digests) replace
    // yesterday's rather than stacking on top of it. Today's is the only one
    // that means anything, and left alone they became 90%+ of a portal bell.
    const supersedes = recurringTitleMatch({
      kind: input.kind,
      title: input.title,
      actor: input.actor ?? null,
      taskCode: input.taskCode ?? null,
    });
    if (supersedes) {
      const q = sb.from("notifications").delete().eq("recipient", input.recipient);
      // A LIKE when the title carries a varying count ("4 staff quiet…").
      await (supersedes.op === "like" ? q.like("title", supersedes.value) : q.eq("title", supersedes.value));
    }
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
      : input.kind === "meeting"
        ? isAdmin
          ? `/calendar`
          : `/portal/meetings`
        : isAdmin
          ? `/hrms/leave`
          : `/portal/profile`;
    const tag = input.taskCode
      ? `task-${input.taskCode}`
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

// 30 was too short: the owner holds 136 rows, so the badge counted everything
// while the panel silently showed a sixth of it. Repeats now collapse in the UI,
// so a bigger window still reads as a short list.
export async function listNotifications(recipient: string, limit = 80): Promise<Notification[]> {
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

/** Mark SPECIFIC notifications read. Opening the bell used to mark everything
 *  read at once, which destroyed the unread signal on a single glance — now
 *  only what you actually open is marked. */
export async function markRead(recipient: string, ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  await sb
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient", recipient)
    .in("id", ids)
    .is("read_at", null);
}

/** Nightly tidy: drop notifications already READ and older than the retention
 *  window. Unread ones are always kept — they still owe you a look. Half the
 *  owner's bell was over a fortnight old with nothing ever expiring it. */
export async function purgeOldRead(days: number = NOTIF_RETENTION_DAYS): Promise<number> {
  const cutoff = new Date(Date.now() - days * 86400_000).toISOString();
  const { data } = await sb
    .from("notifications")
    .delete()
    .not("read_at", "is", null)
    .lt("created_at", cutoff)
    .select("id");
  return (data ?? []).length;
}

/**
 * Nightly: keep only the NEWEST of each recurring item per person. New arrivals
 * already supersede their predecessor, but this clears the backlog that built
 * up before that existed — 355 daily reminders for one staff member, 94 digests
 * for one manager — and self-heals if a write ever slips through.
 */
export async function purgeSupersededRecurring(): Promise<number> {
  const { data } = await sb
    .from("notifications")
    .select("id,recipient,kind,title,actor,task_code,created_at")
    .order("created_at", { ascending: false });

  const newestSeen = new Set<string>();
  const stale: number[] = [];
  for (const r of data ?? []) {
    const row = {
      kind: r.kind as string,
      title: r.title as string,
      actor: (r.actor as string | null) ?? null,
      taskCode: (r.task_code as string | null) ?? null,
    };
    const key = recurringKey(row);
    if (!key) continue;
    const scoped = `${r.recipient}|${key}`;
    // Rows arrive newest-first, so the first of each key is the keeper.
    if (newestSeen.has(scoped)) stale.push(r.id as number);
    else newestSeen.add(scoped);
  }

  // Chunked so a large backlog can't blow the URL length on the REST filter.
  for (let i = 0; i < stale.length; i += 200) {
    await sb.from("notifications").delete().in("id", stale.slice(i, i + 200));
  }
  return stale.length;
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

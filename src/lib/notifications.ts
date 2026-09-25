import "server-only";
import { sb } from "@/db/supabase";
import { isDirectorRecipient } from "@/lib/push-links";
import { escapeLike } from "@/lib/db-helpers";
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
  // Escaped (a name with % or _ matched other people) and active-only (a
  // leaver's old stamp must not notify a newcomer with the same name).
  const { data } = await sb.from("people").select("id").ilike("name", escapeLike(name)).eq("active", true).limit(1).maybeSingle();
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
  /** Buzz now even in quiet hours / digest mode. The kind list below never
   *  matched a real kind (they are "assigned", "update"…), so NOTHING was ever
   *  urgent — an ORI escalation waited until morning (audit 24 Sept 2026). */
  urgent?: boolean;
}): Promise<void> {
  try {
    // A director has no Announcements page (blocked until it is rebuilt), so an
    // announcement neither lands in their bell nor buzzes their phone.
    const director = input.recipient.startsWith("person:") ? await isDirectorRecipient(input.recipient) : false;
    if (director && input.kind === "announcement") return;
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
    const { data: row } = await sb.from("notifications").insert({
      recipient: input.recipient,
      kind: input.kind,
      task_id: input.taskId ?? null,
      task_code: input.taskCode ?? null,
      request_id: input.requestId ?? null,
      title: input.title,
      body: (input.body ?? "").slice(0, 200) || null,
      actor: input.actor ?? null,
      created_at: new Date().toISOString(),
    }).select("id").maybeSingle();
    // Push to the recipient's phone(s) too (T4b). Best-effort, no-op if push
    // isn't configured or they have no devices registered. Task-less notifs
    // open the relevant surface (the owner's leave page / the staff portal).
    const url = notificationUrl(input.recipient, director, input.kind, input.taskCode ?? null);
    const tag = input.taskCode
      ? `task-${input.taskCode}`
      : `notif-${input.kind}`;

    // Smart, calm delivery (the in-app row above is already written — the bell
    // never misses anything; here we only shape the DEVICE BUZZ):
    //  - critical kinds always push immediately;
    //  - else, during quiet hours OR when the digest is on, HOLD the buzz and
    //    let the consolidated cron flush it as one batched push.
    // Default (no quiet hours, digest off) → push immediately as before.
    const critical = input.urgent === true || isCritical(input.kind);
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
        // The alert's buttons (push audit, 25 Sept 2026: they were built in the
        // service worker and never sent): mark it read, or again in an hour.
        id: typeof row?.id === "number" ? row.id : undefined,
        taskCode: input.taskCode ?? null,
        actions: typeof row?.id === "number" ? ["done", "snooze"] : undefined,
      });
    }
  } catch {
    /* swallow — best effort */
  }
}

/** Where tapping an alert goes. Owner and directors are on the Studio screens;
 *  staff on the portal. Shared by the first push and a snoozed one's return. */
export function notificationUrl(recipient: string, director: boolean, kind: string, taskCode: string | null): string {
  const isAdmin = recipient === "admin";
  const studio = isAdmin || director;
  return taskCode
    ? studio ? `/task/${taskCode}` : `/portal/task/${taskCode}`
    : kind === "meeting"
      ? studio ? `/calendar` : `/portal/meetings`
      : kind === "announcement"
        ? isAdmin ? `/announcements` : `/portal/announcements`
        : studio ? `/` : `/portal`;
}

/** Snoozed alerts ("In an hour") whose hour is up: push them again if still
 *  unread. The act route records them; the 15-minute tick calls this. */
export async function resendSnoozedNotifications(): Promise<number> {
  const KEY = "notifications.snoozed";
  const { data } = await sb.from("settings").select("value").eq("key", KEY).maybeSingle();
  let list: { recipient: string; id: number; until: string }[] = [];
  try { list = JSON.parse((data?.value as string | null) ?? "[]"); } catch { list = []; }
  if (!Array.isArray(list) || !list.length) return 0;
  const now = Date.now();
  const due = list.filter((e) => e && new Date(e.until).getTime() <= now);
  if (!due.length) return 0;
  // Take them off the list first, so an overlapping run cannot send twice.
  await sb.from("settings").upsert({ key: KEY, value: JSON.stringify(list.filter((e) => !due.includes(e))) }, { onConflict: "key" });
  const { data: rows } = await sb.from("notifications").select("id,recipient,kind,title,body,task_code,read_at").in("id", due.map((e) => e.id));
  const { sendToRecipient } = await import("./push");
  const { isDirectorRecipient } = await import("./push-links");
  let sent = 0;
  for (const r of rows ?? []) {
    if (r.read_at) continue;
    const director = await isDirectorRecipient(r.recipient as string);
    sent += await sendToRecipient(r.recipient as string, {
      title: r.title as string,
      body: (r.body as string | null) ?? "",
      url: notificationUrl(r.recipient as string, director, r.kind as string, (r.task_code as string | null) ?? null),
      tag: r.task_code ? `task-${r.task_code}` : `notif-${r.kind}`,
      id: r.id as number,
      taskCode: (r.task_code as string | null) ?? null,
      actions: ["done", "snooze"],
    });
  }
  return sent;
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
  // PAGED: one unbounded select comes back silently capped at 1,000 rows by
  // PostgREST, so everything older was never considered (audit 26 Sept 2026).
  const data: Array<Record<string, unknown>> = [];
  for (let from = 0; from < 50_000; from += 1000) {
    const { data: page, error } = await sb
      .from("notifications")
      .select("id,recipient,kind,title,actor,task_code,created_at")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + 999);
    if (error || !page?.length) break;
    data.push(...page);
    if (page.length < 1000) break;
  }

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

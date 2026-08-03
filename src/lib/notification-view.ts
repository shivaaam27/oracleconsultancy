// How a stored notification becomes a row you can read at a glance.
//
// Pure + client-safe on purpose: the corrections below are applied at READ time,
// so the ~1,000 rows already in the table are filed correctly without a
// migration and without touching the ~17 cron call sites that write them.

import { getGivenName } from "@/lib/names";

export type NotifRow = {
  id: number;
  kind: string;
  taskCode: string | null;
  threadId: number | null;
  requestId: number | null;
  title: string;
  body: string | null;
  actor: string | null;
  createdAt: string;
  readAt: string | null;
};

/** Two lanes, not five dead categories. "Needs you" is anything asking
 *  something of you; "Activity" is everything you're merely being kept
 *  informed of. */
export type NotifLane = "needs-you" | "activity";

/**
 * ORI's daily summaries ("11 staff quiet with open work", "2 decisions still
 * open") are WRITTEN with kind "assigned" but carry no task. Left alone they
 * appear under Tasks with an "assigned you" icon, as though a person handed you
 * a job — 41% of the owner's bell. They're system digests, so detect them here.
 */
export function isSystemDigest(n: Pick<NotifRow, "actor" | "taskCode">): boolean {
  return n.actor === "ORI" && !n.taskCode;
}

/** The daily 9am "Your tasks · <Company>" reminder mirrored from its chat
 *  channel. Kept in the bell (owner's call) but filed as a reminder, not as a
 *  message from a colleague — it repeats ~30× per person otherwise. */
export function isDailyReminder(n: Pick<NotifRow, "kind" | "title">): boolean {
  return n.kind === "chat" && /^your tasks\b/i.test(n.title ?? "");
}

/**
 * Recurring by nature: a fresh one arrives every day carrying the same meaning,
 * so only the LATEST is worth keeping. Older copies are superseded on write and
 * swept nightly — otherwise they pile up (355 daily reminders for one staff
 * member, 94 digests for one manager).
 */
export function isRecurring(n: Pick<NotifRow, "kind" | "title" | "actor" | "taskCode">): boolean {
  return isSystemDigest(n) || isDailyReminder(n);
}

/**
 * What makes two recurring notifications "the same one, a day later".
 *
 * The leading count is stripped: "4 staff quiet with open work" and "3 staff
 * quiet with open work" are the same daily digest with a different number, and
 * must supersede each other — otherwise every day's variant survives and the
 * pile grows back.
 */
export function recurringKey(n: Pick<NotifRow, "kind" | "title" | "actor" | "taskCode">): string | null {
  if (!isRecurring(n)) return null;
  return n.title.replace(/^\d+\s+/, "");
}

/**
 * How to FIND the rows a new recurring notification supersedes. Returns an
 * exact title, or a `%`-prefixed pattern when the count was stripped (the
 * caller uses a LIKE for those).
 */
export function recurringTitleMatch(
  n: Pick<NotifRow, "kind" | "title" | "actor" | "taskCode">
): { op: "eq" | "like"; value: string } | null {
  const key = recurringKey(n);
  if (key == null) return null;
  return key === n.title ? { op: "eq", value: n.title } : { op: "like", value: `%${key}` };
}

export function notifLane(n: NotifRow): NotifLane {
  if (isSystemDigest(n) || isDailyReminder(n)) return "activity";
  if (n.kind === "assigned" || n.kind === "mention" || n.kind === "chat_mention" || n.kind === "reply" || n.kind === "pinned") {
    return "needs-you";
  }
  return "activity";
}

/** What the actor DID, for the quiet meta line. */
const VERB: Record<string, string> = {
  assigned: "assigned you",
  update: "updated",
  mention: "mentioned you",
  chat_mention: "mentioned you",
  reply: "replied",
  pinned: "pinned",
  chat: "messaged",
  announcement: "announced",
  meeting: "scheduled",
  leave: "leave request",
};

/** Compact relative time. `now` is injectable so this is testable. */
export function notifAgo(iso: string, now: number = Date.now()): string {
  const s = Math.floor((now - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  const d = Math.floor(s / 86400);
  if (d < 7) return `${d}d`;
  return `${Math.floor(d / 7)}w`;
}

/**
 * Fix the hierarchy. Stored rows put the boilerplate in `title` ("Mr Pulin
 * Manek assigned you a task") and the ONE thing that differs — the task name —
 * in `body`. So every row opened with the same sentence. Promote the body to
 * the headline and demote who-did-what to the meta line.
 */
export function notifSubject(n: NotifRow, now: number = Date.now()): { headline: string; meta: string } {
  const when = notifAgo(n.createdAt, now);
  // Digests and reminders carry their meaning in the title; body is the detail.
  if (isSystemDigest(n)) return { headline: n.title, meta: `Daily check · ${when}` };
  if (isDailyReminder(n)) return { headline: n.title, meta: `Daily reminder · ${when}` };

  const who = n.actor ? getGivenName(n.actor) : null;
  const verb = VERB[n.kind] ?? "updated";
  const body = n.body?.trim();
  return {
    headline: body || n.title,
    meta: [who ? `${who} ${verb}` : verb, n.taskCode, when].filter(Boolean).join(" · "),
  };
}

export type NotifGroup = {
  key: string;
  lead: NotifRow;
  items: NotifRow[];
  count: number;
  unread: number;
};

/** Rows this close together are one event, not several. */
const COLLAPSE_WINDOW_MS = 12 * 60 * 60 * 1000;

/** Recurring items repeat BY DESIGN — the daily reminder lands ~30 times per
 *  person, a day apart each. A 12-hour window would never fold them, so they
 *  collapse regardless of age; everything else keeps the tight window so two
 *  genuinely separate updates a week apart stay separate. */
function collapseWindowFor(n: NotifRow): number {
  return isSystemDigest(n) || isDailyReminder(n) ? Number.POSITIVE_INFINITY : COLLAPSE_WINDOW_MS;
}

function groupKey(n: NotifRow): string {
  if (isSystemDigest(n)) return `digest|${n.title}`;
  if (isDailyReminder(n)) return `reminder|${n.title}`;
  return `${n.kind}|${n.taskCode ?? ""}|${n.threadId ?? ""}|${n.actor ?? ""}`;
}

/**
 * Collapse repeats into one expandable row. The same DS-012 update was stored
 * FOUR times in one minute, and the daily reminder ~30 times per person; both
 * should read as a single line with a count.
 *
 * Expects `items` newest-first and preserves that order.
 */
export function groupNotifications(items: NotifRow[]): NotifGroup[] {
  const groups: NotifGroup[] = [];
  const open = new Map<string, NotifGroup>();

  for (const n of items) {
    const key = groupKey(n);
    const existing = open.get(key);
    const withinWindow =
      existing &&
      new Date(existing.lead.createdAt).getTime() - new Date(n.createdAt).getTime() <= collapseWindowFor(existing.lead);
    if (existing && withinWindow) {
      existing.items.push(n);
      existing.count++;
      if (!n.readAt) existing.unread++;
      continue;
    }
    const group: NotifGroup = { key: `${key}|${n.id}`, lead: n, items: [n], count: 1, unread: n.readAt ? 0 : 1 };
    groups.push(group);
    open.set(key, group);
  }
  return groups;
}

/** Day bucket for the section headers. */
export function notifBucket(iso: string, now: number = Date.now()): "Today" | "Earlier" {
  const d = new Date(iso);
  const today = new Date(now);
  const sameDay =
    d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
  return sameDay ? "Today" : "Earlier";
}

/** Read notifications older than this are cleared by the nightly job. */
export const NOTIF_RETENTION_DAYS = 14;

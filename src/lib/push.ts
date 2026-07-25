import "server-only";
import webpush from "web-push";
import { sb } from "@/db/supabase";

// Stored as JSON in the settings table — single operator, only a handful of devices.
const KEY = "push.subscriptions";

export type StoredSub = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  addedAt: string;
};

let vapidReady = false;

/** Configure web-push once. Returns false if keys are missing (feature disabled). */
export function configurePush(): boolean {
  if (vapidReady) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@cos.local", pub, priv);
  vapidReady = true;
  return true;
}

export async function getSubscriptions(): Promise<StoredSub[]> {
  const { data } = await sb.from("settings").select("value").eq("key", KEY).maybeSingle();
  const raw = (data?.value as string | null) ?? null;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredSub[]) : [];
  } catch {
    return [];
  }
}

async function saveSubscriptions(subs: StoredSub[]): Promise<void> {
  await sb.from("settings").upsert({ key: KEY, value: JSON.stringify(subs) }, { onConflict: "key" });
}

export async function addSubscription(sub: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}): Promise<void> {
  const subs = await getSubscriptions();
  if (subs.some((s) => s.endpoint === sub.endpoint)) return; // already registered
  subs.push({ endpoint: sub.endpoint, keys: sub.keys, addedAt: new Date().toISOString() });
  await saveSubscriptions(subs);
}

export async function removeSubscription(endpoint: string): Promise<void> {
  const subs = await getSubscriptions();
  await saveSubscriptions(subs.filter((s) => s.endpoint !== endpoint));
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  /** Unread total, used by the SW to badge the installed-app icon accurately. */
  count?: number;
};

function endpointHost(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return endpoint.slice(0, 40);
  }
}

/** Send a notification to every registered device. Prunes dead subscriptions (410/404). */
export async function sendToAll(
  payload: PushPayload
): Promise<{ sent: number; pruned: number; total: number; errors: { host: string; code?: number; message: string }[] }> {
  if (!configurePush()) return { sent: 0, pruned: 0, total: 0, errors: [] };
  const subs = await getSubscriptions();
  if (subs.length === 0) return { sent: 0, pruned: 0, total: 0, errors: [] };

  const body = JSON.stringify(payload);
  const dead: string[] = [];
  const errors: { host: string; code?: number; message: string }[] = [];
  let sent = 0;

  await Promise.all(
    subs.map(async (s) => {
      try {
        // urgency:high asks Apple/Google to deliver promptly rather than batch;
        // TTL keeps it deliverable for 10 min if the device is briefly offline.
        await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, body, {
          urgency: "high",
          TTL: 600,
        });
        sent += 1;
      } catch (err: unknown) {
        const code = (err as { statusCode?: number })?.statusCode;
        const message = (err as { body?: string; message?: string })?.body
          || (err as { message?: string })?.message
          || "unknown error";
        errors.push({ host: endpointHost(s.endpoint), code, message: String(message).slice(0, 200) });
        if (code === 404 || code === 410) dead.push(s.endpoint);
      }
    })
  );

  if (dead.length > 0) {
    await saveSubscriptions(subs.filter((s) => !dead.includes(s.endpoint)));
  }
  return { sent, pruned: dead.length, total: subs.length, errors };
}

/* ------------------------------------------------------------------ *
 * Per-recipient subscriptions (T4b) — push to a specific person OR the
 * owner, keyed like notifications ("admin" | "person:<id>"). Stored in the
 * push_subscriptions table. Powers the notification-bell push to phones.
 * ------------------------------------------------------------------ */

export async function addRecipientSubscription(
  recipient: string,
  sub: { endpoint: string; keys: { p256dh: string; auth: string } }
): Promise<void> {
  await sb.from("push_subscriptions").upsert(
    {
      endpoint: sub.endpoint,
      recipient,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      created_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" }
  );
}

export async function removeRecipientSubscription(endpoint: string): Promise<void> {
  await sb.from("push_subscriptions").delete().eq("endpoint", endpoint);
}

/** Send a push to every device registered for one recipient. Best-effort;
 *  prunes dead endpoints. No-op if push isn't configured. */
export async function sendToRecipient(recipient: string, payload: PushPayload): Promise<number> {
  if (!configurePush()) return 0;
  const { data } = await sb
    .from("push_subscriptions")
    .select("endpoint,p256dh,auth")
    .eq("recipient", recipient);
  const subs = data ?? [];
  if (subs.length === 0) return 0;

  const body = JSON.stringify(payload);
  const dead: string[] = [];
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint as string, keys: { p256dh: s.p256dh as string, auth: s.auth as string } },
          body,
          { urgency: "high", TTL: 600 }
        );
        sent += 1;
      } catch (err: unknown) {
        const code = (err as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) dead.push(s.endpoint as string);
      }
    })
  );
  if (dead.length > 0) await sb.from("push_subscriptions").delete().in("endpoint", dead);
  return sent;
}

/* ------------------------------------------------------------------ *
 * Smart, calm notifications — criticality + quiet hours + digest.
 *
 * The in-app notification row is ALWAYS written (the bell never misses
 * anything); only the DEVICE BUZZ is shaped here:
 *  - quiet hours  → hold routine pushes, let critical through;
 *  - digest on    → defer routine pushes to one batched cron push;
 *  - critical     → always pushes immediately, regardless of either.
 *
 * Default (no quiet hours, digest off) = every notification pushes
 * immediately, byte-identical to today's behaviour.
 * ------------------------------------------------------------------ */

/**
 * Is this notification kind urgent enough to interrupt (buzz the device
 * during quiet hours / skip the digest)? Operations alerts that demand the
 * owner's attention are critical; routine social/HR signals are not.
 *
 * The cron consolidated alert (`cron.notify`) uses tag "cos-attention" and is
 * an operations summary — it is always treated as critical at its call site.
 */
export function isCritical(kind: string): boolean {
  switch (kind) {
    // Operations alerts that the owner should not miss.
    case "escalation":
    case "escalated":
    case "overdue":
    case "overdue-critical":
    case "attention":
    case "approval":
      return true;
    // Routine social / HR / informational signals — safe to hold or batch.
    case "mention":
    case "chat":
    case "chat_mention":
    case "reply":
    case "pinned":
    case "assigned":
    case "leave":
    case "announcement":
      return false;
    // Unknown kinds: treat as routine (calmer default — never over-buzz).
    default:
      return false;
  }
}

/** One routine notification held back for the next digest push. */
export type DigestItem = {
  kind: string;
  title: string;
  body: string;
  url: string;
  tag: string;
  at: string;
};

function digestKey(recipient: string): string {
  return `push.digest.${recipient}`;
}

/** Recipients that currently have at least one held digest item. */
const DIGEST_INDEX_KEY = "push.digest._recipients";

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const { data } = await sb.from("settings").select("value").eq("key", key).maybeSingle();
    const raw = (data?.value as string | null) ?? null;
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed as T;
  } catch {
    return fallback;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  await sb.from("settings").upsert({ key, value: JSON.stringify(value) }, { onConflict: "key" });
}

/** Hold a routine push for the next digest flush. Best-effort; caps the queue
 *  so a runaway producer can't bloat the settings row. */
export async function queueDigestItem(recipient: string, item: DigestItem): Promise<void> {
  try {
    const items = await readJson<DigestItem[]>(digestKey(recipient), []);
    items.push(item);
    // Keep the most recent 50 — the digest only ever summarises counts + a
    // couple of headlines, so older overflow is no loss.
    const trimmed = items.slice(-50);
    await writeJson(digestKey(recipient), trimmed);
    // Track which recipients have a pending digest so the cron can find them
    // without scanning every settings row.
    const index = await readJson<string[]>(DIGEST_INDEX_KEY, []);
    if (!index.includes(recipient)) {
      index.push(recipient);
      await writeJson(DIGEST_INDEX_KEY, index);
    }
  } catch {
    /* best effort — a held push is never worth breaking the caller */
  }
}

/** Recipients with at least one queued digest item (drives the cron flush). */
export async function pendingDigestRecipients(): Promise<string[]> {
  return readJson<string[]>(DIGEST_INDEX_KEY, []);
}

/** Take (and clear) all held digest items for a recipient. */
export async function drainDigest(recipient: string): Promise<DigestItem[]> {
  const items = await readJson<DigestItem[]>(digestKey(recipient), []);
  // Clear the queue and drop the recipient from the index.
  try {
    await sb.from("settings").delete().eq("key", digestKey(recipient));
    const index = await readJson<string[]>(DIGEST_INDEX_KEY, []);
    const next = index.filter((r) => r !== recipient);
    await writeJson(DIGEST_INDEX_KEY, next);
  } catch {
    /* best effort */
  }
  return items;
}

/**
 * Summarise held digest items into one push line, grouping by kind:
 * "3 updates · 1 new document · 2 messages". Returns null if nothing held.
 */
export function summariseDigest(items: DigestItem[]): { title: string; body: string; count: number } | null {
  if (items.length === 0) return null;
  const label: Record<string, [string, string]> = {
    mention: ["mention", "mentions"],
    chat: ["message", "messages"],
    chat_mention: ["message", "messages"],
    reply: ["reply", "replies"],
    pinned: ["pinned instruction", "pinned instructions"],
    assigned: ["task assigned", "tasks assigned"],
    leave: ["leave update", "leave updates"],
    announcement: ["announcement", "announcements"],
  };
  const counts = new Map<string, number>();
  for (const it of items) counts.set(it.kind, (counts.get(it.kind) ?? 0) + 1);
  const parts: string[] = [];
  for (const [kind, n] of counts) {
    const [one, many] = label[kind] ?? [kind, `${kind}s`];
    parts.push(`${n} ${n === 1 ? one : many}`);
  }
  return {
    title: "Oracle Consultancy — while you were away",
    body: parts.join(" · "),
    count: items.length,
  };
}

/**
 * Flush the smart-notification digest: for every recipient with routine pushes
 * held back (by quiet hours or the digest setting), drain their queue and send
 * ONE summary push ("3 updates · 1 new document"). Urgent items were never held,
 * so they've already gone out.
 *
 * Single source of truth, called by BOTH scheduled crons that fire each morning:
 *  - the consolidated morning-run (the one actually in vercel.json), AND
 *  - the standalone /api/cron/notify (kept for manual/legacy triggers).
 * Without this in the scheduled job, an enabled digest would queue routine
 * pushes that never drain — the device buzz would be silently lost (the in-app
 * bell still has every row, so it degrades rather than breaks).
 *
 * Best-effort: never throws. Returns how many digest pushes were sent.
 *
 * Lazy-imports isQuietHoursNow + unreadCount at call time so this module (push)
 * doesn't form a load-time cycle with notifications/settings (which import push).
 */
export async function flushRoutineDigests(): Promise<{ recipients: number; pushed: number; held?: true }> {
  let recipients = 0;
  let pushed = 0;
  try {
    const { isQuietHoursNow } = await import("./settings");
    // Don't buzz during quiet hours — leave the queue intact and flush it on the
    // next run once the window has passed. (If quiet hours aren't set this is
    // always false, so the digest flushes whenever the cron runs.)
    if (await isQuietHoursNow()) {
      return { recipients: 0, pushed: 0, held: true };
    }
    const { unreadCount } = await import("./notifications");
    const targets = await pendingDigestRecipients();
    for (const recipient of targets) {
      const items = await drainDigest(recipient);
      const summary = summariseDigest(items);
      if (!summary) continue;
      recipients += 1;
      // Deep-link to the first held item if they all share one target, else a
      // sensible inbox: the bell surface on the relevant side.
      const urls = new Set(items.map((i) => i.url));
      const url = urls.size === 1 ? items[0].url : recipient === "admin" ? "/" : "/portal";
      const sent = await sendToRecipient(recipient, {
        title: summary.title,
        body: summary.body,
        url,
        tag: "cos-digest",
        count: await unreadCount(recipient),
      });
      if (sent > 0) pushed += 1;
    }
  } catch {
    /* best effort — a stuck digest must never break the consolidated alert */
  }
  return { recipients, pushed };
}

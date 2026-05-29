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

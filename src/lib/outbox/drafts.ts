import { sb } from "@/db/supabase";
import type { Channel } from "./links";

export type OutboxDraftRow = {
  id: number;
  channel: Channel;
  recipientName: string | null;
  recipientContact: string | null;
  company: string | null;
  subject: string | null;
  body: string;
  source: string | null;
  personId: number | null;
  todoId: number | null;
  createdAt: string;
  /** When the draft is meant to go (a scheduled reminder). Drafts are never
   *  sent on their own; the Outbox floats it to the top when the time comes. */
  scheduledFor: string | null;
};

/** Persisted, unsent drafts (status = "Draft"), newest first. */
export async function listOutboxDrafts(): Promise<OutboxDraftRow[]> {
  const { data, error } = await sb
    .from("outbox")
    .select("id,channel,recipient_name,recipient_contact,company,subject,body,source,person_id,todo_id,created_at,scheduled_for")
    .eq("status", "Draft")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: any) => ({
    id: r.id, channel: r.channel as Channel, recipientName: r.recipient_name, recipientContact: r.recipient_contact,
    company: r.company, subject: r.subject, body: r.body, source: r.source,
    personId: r.person_id, todoId: r.todo_id, createdAt: r.created_at, scheduledFor: r.scheduled_for ?? null,
  }));
}

const NUDGED_KEY = "outbox.scheduledNudged";

/**
 * Scheduled drafts whose moment has come: ONE push to the owner, then never
 * again for that draft (a small ledger in settings). Nothing is sent to anyone
 * else — a draft waits for the owner to press Send (audit 26 Sept 2026: the
 * scheduled time was written and never read).
 */
export async function nudgeDueScheduledDrafts(now = new Date()): Promise<number> {
  const { data } = await sb.from("outbox").select("id,recipient_name,subject,channel")
    .eq("status", "Draft").not("scheduled_for", "is", null).lte("scheduled_for", now.toISOString()).limit(50);
  if (!data?.length) return 0;
  const { data: led } = await sb.from("settings").select("value").eq("key", NUDGED_KEY).maybeSingle();
  let done: number[] = [];
  try { done = JSON.parse((led?.value as string) ?? "[]"); } catch { done = []; }
  const fresh = data.filter((r) => !done.includes(r.id as number));
  if (!fresh.length) return 0;
  const { sendToRecipient } = await import("@/lib/push");
  const first = fresh[0];
  await sendToRecipient("admin", {
    title: fresh.length === 1 ? "A scheduled message is ready to send" : `${fresh.length} scheduled messages are ready to send`,
    body: fresh.length === 1 ? `${first.subject || "Message"} → ${first.recipient_name ?? "recipient"}` : fresh.map((r) => r.recipient_name).filter(Boolean).slice(0, 4).join(", "),
    url: "/outbox",
    tag: "cos-outbox-scheduled",
  });
  const keep = [...done, ...fresh.map((r) => r.id as number)].slice(-300);
  await sb.from("settings").upsert({ key: NUDGED_KEY, value: JSON.stringify(keep) }, { onConflict: "key" });
  return fresh.length;
}

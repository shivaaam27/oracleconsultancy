import { sb } from "@/db/supabase";

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

// Returns set of dedupe keys for today on a specific channel (legacy helper,
// still used by markSent tests).
export async function todaysSentKeys(channel: string): Promise<Set<string>> {
  const start = startOfDay(new Date()).toISOString();
  const end = endOfDay(new Date()).toISOString();
  const { data, error } = await sb
    .from("reminders")
    .select("dedupe_key")
    .eq("channel", channel)
    .gte("created_at", start)
    .lte("created_at", end);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((r) => r.dedupe_key as string));
}

// JSON-safe: Record<name, channel[]> across all channels.
export type SentTodayPlain = Record<string, string[]>;

export async function todaysSentChannelsByName(): Promise<SentTodayPlain> {
  const start = startOfDay(new Date()).toISOString();
  const end = endOfDay(new Date()).toISOString();
  const { data, error } = await sb
    .from("reminders")
    .select("dedupe_key,channel")
    .gte("created_at", start)
    .lte("created_at", end);
  if (error) throw new Error(error.message);
  const out: SentTodayPlain = {};
  for (const r of data ?? []) {
    const parts = (r.dedupe_key as string).split("|");
    const name = parts[2];
    const ch = ((r.channel as string) || "WHATSAPP").toUpperCase();
    if (!name) continue;
    const list = out[name] || [];
    if (!list.includes(ch)) list.push(ch);
    out[name] = list;
  }
  return out;
}

export type HistoryEntry = {
  id: number;
  channel: string;
  recipientName: string | null;
  recipientContact: string | null;
  body: string;
  sentAt: string | null; // ISO
  status: string;
};

export async function historyByDay(days: number): Promise<Record<string, HistoryEntry[]>> {
  const start = startOfDay(new Date());
  start.setDate(start.getDate() - days);
  const yesterdayEnd = endOfDay(new Date());
  yesterdayEnd.setDate(yesterdayEnd.getDate() - 1);

  const { data, error } = await sb
    .from("outbox")
    .select("id,channel,recipient_name,recipient_contact,body,sent_at,status")
    .gte("created_at", start.toISOString())
    .lte("created_at", yesterdayEnd.toISOString())
    .order("sent_at", { ascending: false });
  if (error) throw new Error(error.message);

  const byDay: Record<string, HistoryEntry[]> = {};
  for (const r of data ?? []) {
    const sentAtIso = (r.sent_at as string | null) ?? null;
    const d = sentAtIso ? new Date(sentAtIso) : new Date();
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const entry: HistoryEntry = {
      id: r.id as number,
      channel: r.channel as string,
      recipientName: (r.recipient_name as string | null) ?? null,
      recipientContact: (r.recipient_contact as string | null) ?? null,
      body: r.body as string,
      sentAt: sentAtIso,
      status: r.status as string,
    };
    const list = byDay[key] || [];
    list.push(entry);
    byDay[key] = list;
  }
  return byDay;
}

/**
 * Today's actually-sent records (real `sent_at` timestamps), newest first.
 * `historyByDay` intentionally stops at end-of-yesterday, so the Sent-log
 * drawer uses this for its "Done today" section instead of synthetic times.
 */
export async function todaysSentRecords(): Promise<HistoryEntry[]> {
  const start = startOfDay(new Date()).toISOString();
  const end = endOfDay(new Date()).toISOString();
  const { data, error } = await sb
    .from("outbox")
    .select("id,channel,recipient_name,recipient_contact,body,sent_at,status")
    .eq("status", "Sent")
    .gte("sent_at", start)
    .lte("sent_at", end)
    .order("sent_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id as number,
    channel: r.channel as string,
    recipientName: (r.recipient_name as string | null) ?? null,
    recipientContact: (r.recipient_contact as string | null) ?? null,
    body: r.body as string,
    sentAt: (r.sent_at as string | null) ?? null,
    status: r.status as string,
  }));
}

export type SnoozedPerson = {
  id: number;
  name: string;
  snoozedUntil: string; // ISO
};

export async function snoozedToday(): Promise<SnoozedPerson[]> {
  const nowIso = new Date().toISOString();
  const { data, error } = await sb
    .from("people")
    .select("id,name,snoozed_until")
    .not("snoozed_until", "is", null)
    .gte("snoozed_until", nowIso);
  if (error) throw new Error(error.message);
  return (data ?? [])
    .filter((r) => r.snoozed_until !== null)
    .map((r) => ({
      id: r.id as number,
      name: r.name as string,
      snoozedUntil: r.snoozed_until as string,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function formatDayLabel(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const today = startOfDay(new Date());
  const diffDays = Math.round((today.getTime() - date.getTime()) / 86400000);
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) {
    return date.toLocaleDateString("en-GB", { weekday: "long" });
  }
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

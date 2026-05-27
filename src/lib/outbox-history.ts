import { db, schema } from "@/db";
import { and, eq, gte, lte, desc, isNotNull } from "drizzle-orm";
import { unstable_cache } from "next/cache";

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

// Returns the set of dedupe keys that already exist for today on this channel.
// (Kept for callers that still want a per-channel key set.)
export async function todaysSentKeys(channel: string): Promise<Set<string>> {
  const start = startOfDay(new Date());
  const end = endOfDay(new Date());
  const rows = await db
    .select({ key: schema.reminders.dedupeKey })
    .from(schema.reminders)
    .where(
      and(
        eq(schema.reminders.channel, channel),
        gte(schema.reminders.createdAt, start),
        lte(schema.reminders.createdAt, end)
      )
    );
  return new Set(rows.map((r) => r.key));
}

// JSON-safe: returns Record<name, channel[]> so it's cacheable across requests.
export type SentTodayPlain = Record<string, string[]>;

async function todaysSentChannelsByNameRaw(): Promise<SentTodayPlain> {
  const start = startOfDay(new Date());
  const end = endOfDay(new Date());
  const rows = await db
    .select({ key: schema.reminders.dedupeKey, channel: schema.reminders.channel })
    .from(schema.reminders)
    .where(and(gte(schema.reminders.createdAt, start), lte(schema.reminders.createdAt, end)));
  const out: SentTodayPlain = {};
  for (const r of rows) {
    const parts = r.key.split("|");
    const name = parts[2];
    const ch = r.channel?.toUpperCase() || "WHATSAPP";
    if (!name) continue;
    const list = out[name] || [];
    if (!list.includes(ch)) list.push(ch);
    out[name] = list;
  }
  return out;
}

export const todaysSentChannelsByName = unstable_cache(
  todaysSentChannelsByNameRaw,
  ["outbox-sent-today-v1"],
  { tags: ["outbox"], revalidate: 60 }
);

export type HistoryEntry = {
  id: number;
  channel: string;
  recipientName: string | null;
  recipientContact: string | null;
  body: string;
  sentAt: string | null; // ISO
  status: string;
};

// JSON-safe: dates as ISO strings; map keyed by day key.
async function historyByDayRaw(days: number): Promise<Record<string, HistoryEntry[]>> {
  const start = startOfDay(new Date());
  start.setDate(start.getDate() - days);
  const yesterdayEnd = endOfDay(new Date());
  yesterdayEnd.setDate(yesterdayEnd.getDate() - 1);

  const rows = await db
    .select({
      id: schema.outbox.id,
      channel: schema.outbox.channel,
      recipientName: schema.outbox.recipientName,
      recipientContact: schema.outbox.recipientContact,
      body: schema.outbox.body,
      sentAt: schema.outbox.sentAt,
      status: schema.outbox.status,
    })
    .from(schema.outbox)
    .where(
      and(
        gte(schema.outbox.createdAt, start),
        lte(schema.outbox.createdAt, yesterdayEnd)
      )
    )
    .orderBy(desc(schema.outbox.sentAt));

  const byDay: Record<string, HistoryEntry[]> = {};
  for (const r of rows) {
    const d = r.sentAt ?? new Date();
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const entry: HistoryEntry = {
      id: r.id,
      channel: r.channel,
      recipientName: r.recipientName,
      recipientContact: r.recipientContact,
      body: r.body,
      sentAt: r.sentAt ? r.sentAt.toISOString() : null,
      status: r.status,
    };
    const list = byDay[key] || [];
    list.push(entry);
    byDay[key] = list;
  }
  return byDay;
}

export const historyByDay = unstable_cache(
  historyByDayRaw,
  ["outbox-history-v1"],
  { tags: ["outbox"], revalidate: 60 }
);

export type SnoozedPerson = {
  id: number;
  name: string;
  snoozedUntil: string; // ISO
};

async function snoozedTodayRaw(): Promise<SnoozedPerson[]> {
  const now = new Date();
  const rows = await db
    .select({ id: schema.people.id, name: schema.people.name, snoozedUntil: schema.people.snoozedUntil })
    .from(schema.people)
    .where(and(isNotNull(schema.people.snoozedUntil), gte(schema.people.snoozedUntil, now)));
  return rows
    .filter((r) => r.snoozedUntil !== null)
    .map((r) => ({ id: r.id, name: r.name, snoozedUntil: r.snoozedUntil!.toISOString() }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export const snoozedToday = unstable_cache(
  snoozedTodayRaw,
  ["snoozed-today-v1"],
  { tags: ["people"], revalidate: 60 }
);

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

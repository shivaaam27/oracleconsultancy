import { db, schema } from "@/db";
import { and, eq, gte, lte, desc, isNotNull } from "drizzle-orm";

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
// Used to pre-mark drafts as "already sent today" without an extra round-trip.
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

export type HistoryEntry = {
  id: number;
  recipientName: string | null;
  recipientContact: string | null;
  body: string;
  sentAt: Date | null;
  status: string;
};

// Past sent messages for the given channel, grouped by local date (yyyy-mm-dd).
// Returns most-recent first; today's entries are excluded (UI handles today separately).
export async function historyByDay(
  channel: string,
  days: number = 14
): Promise<Map<string, HistoryEntry[]>> {
  const start = startOfDay(new Date());
  start.setDate(start.getDate() - days);
  const yesterdayEnd = endOfDay(new Date());
  yesterdayEnd.setDate(yesterdayEnd.getDate() - 1);

  const rows = await db
    .select({
      id: schema.outbox.id,
      recipientName: schema.outbox.recipientName,
      recipientContact: schema.outbox.recipientContact,
      body: schema.outbox.body,
      sentAt: schema.outbox.sentAt,
      status: schema.outbox.status,
    })
    .from(schema.outbox)
    .where(
      and(
        eq(schema.outbox.channel, channel),
        gte(schema.outbox.createdAt, start),
        lte(schema.outbox.createdAt, yesterdayEnd)
      )
    )
    .orderBy(desc(schema.outbox.sentAt));

  const byDay = new Map<string, HistoryEntry[]>();
  for (const r of rows) {
    const d = r.sentAt ?? new Date();
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const list = byDay.get(key) || [];
    list.push(r);
    byDay.set(key, list);
  }
  return byDay;
}

export type SnoozedPerson = {
  id: number;
  name: string;
  snoozedUntil: Date;
};

export async function snoozedToday(): Promise<SnoozedPerson[]> {
  const now = new Date();
  const rows = await db
    .select({ id: schema.people.id, name: schema.people.name, snoozedUntil: schema.people.snoozedUntil })
    .from(schema.people)
    .where(and(isNotNull(schema.people.snoozedUntil), gte(schema.people.snoozedUntil, now)));
  return rows
    .filter((r): r is SnoozedPerson => r.snoozedUntil !== null)
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

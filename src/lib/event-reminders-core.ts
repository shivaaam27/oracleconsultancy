// The rules behind "your 3 o'clock is in an hour" — pure, so they can be tested
// without a database (see event-reminders-core.test.ts). The delivery half
// (chat, push, email) lives in event-reminders.ts, which is server-only.

import { expandRecurrence } from "@/lib/ics";
import { getGivenName } from "@/lib/names";
import type { CalendarEvent } from "@/lib/calendar";

export const EAT_TZ = "Africa/Dar_es_Salaam";

/** Never look further ahead than this, however long a lead time someone types. */
export const MAX_LOOKAHEAD_DAYS = 45;
/** If the sweep hasn't run for ages, don't dump a backlog — only the last 6h. */
export const MAX_CATCHUP_MS = 6 * 60 * 60 * 1000;
/** First-ever run: treat the previous hour as the window. */
export const DEFAULT_WINDOW_MS = 60 * 60 * 1000;
/** Forget a fired reminder after this long (keeps the ledger tiny). */
export const LEDGER_TTL_MS = 3 * 24 * 60 * 60 * 1000;
/** Don't nag about something that has already started (and may be over). */
export const STARTED_GRACE_MS = 15 * 60 * 1000;

/* ------------------------------- wording ------------------------------- */

/** "in 30 minutes" · "in 1 hour" · "tomorrow" · "in 3 days" · "now". */
export function leadPhrase(minutes: number): string {
  if (minutes <= 0) return "now";
  if (minutes < 60) return `in ${minutes} minute${minutes === 1 ? "" : "s"}`;
  if (minutes < 1440) {
    const h = Math.round(minutes / 60);
    return `in ${h} hour${h === 1 ? "" : "s"}`;
  }
  const d = Math.round(minutes / 1440);
  return d === 1 ? "tomorrow" : `in ${d} days`;
}

/** The event's time in the reader's own zone (Dar es Salaam). */
export function fmtWhen(iso: string, allDay: boolean): string {
  const d = new Date(iso);
  if (allDay) {
    return d.toLocaleDateString("en-GB", { timeZone: EAT_TZ, weekday: "long", day: "numeric", month: "long" });
  }
  return d.toLocaleString("en-GB", {
    timeZone: EAT_TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** The chat message: what, when, where, how to join. Chat renders plain text. */
export function buildChatBody(
  ev: CalendarEvent,
  occurrenceIso: string,
  minutes: number,
  name: string
): string {
  const first = getGivenName(name);
  const lines = [
    `Hi ${first} — ${ev.title} starts ${leadPhrase(minutes)}.`,
    "",
    `🗓 ${fmtWhen(occurrenceIso, ev.allDay)}`,
  ];
  if (ev.location) lines.push(`📍 ${ev.location}`);
  if (ev.meetLink) lines.push(`🔗 Join: ${ev.meetLink}`);
  const guests = ev.attendees.map((a) => a.name).filter(Boolean);
  if (guests.length > 1) lines.push(`👥 ${guests.join(", ")}`);
  if (ev.description) lines.push("", ev.description);
  return lines.join("\n").trim();
}

/* ------------------------------- the rules ------------------------------- */

export type DueReminder = {
  event: CalendarEvent;
  /** The specific occurrence this reminder is for (a series has many). */
  occurrenceIso: string;
  /** Lead time in minutes before the start. */
  minutes: number;
  /** Stable identity, so the same reminder is never delivered twice. */
  key: string;
};

/**
 * Which reminders fell due in the window (windowStart, windowEnd].
 *
 * A reminder set for "1 hour before" a 15:00 meeting is due at 14:00, so it is
 * returned by the first sweep whose window covers 14:00 — and by no other, which
 * is what stops a frequent sweep from nagging.
 */
export function dueReminders(opts: {
  events: CalendarEvent[];
  windowStart: number;
  windowEnd: number;
  now: number;
  lookaheadEnd: number;
}): DueReminder[] {
  const out: DueReminder[] = [];

  for (const ev of opts.events) {
    if (ev.status === "cancelled") continue;
    const leads = [...new Set(ev.reminders.filter((m) => Number.isFinite(m) && m >= 0))];
    if (!leads.length) continue;
    const maxLead = Math.max(...leads) * 60000;

    const occurrences = expandRecurrence({
      start: new Date(ev.startAt),
      recurrence: ev.recurrence,
      until: ev.recurrenceUntil ? new Date(ev.recurrenceUntil) : null,
      windowStart: opts.windowStart,
      windowEnd: Math.min(opts.windowEnd + maxLead, opts.lookaheadEnd),
      excluded: ev.excludedDates,
    });

    for (const occ of occurrences) {
      const occMs = occ.getTime();
      // Already under way (or over) — a reminder now would just be noise.
      if (occMs < opts.now - STARTED_GRACE_MS) continue;

      for (const lead of leads) {
        const fireAt = occMs - lead * 60000;
        if (fireAt <= opts.windowStart || fireAt > opts.windowEnd) continue;
        const occurrenceIso = occ.toISOString();
        out.push({ event: ev, occurrenceIso, minutes: lead, key: `${ev.id}:${occurrenceIso}:${lead}` });
      }
    }
  }

  return out.sort((a, b) => a.occurrenceIso.localeCompare(b.occurrenceIso) || a.minutes - b.minutes);
}

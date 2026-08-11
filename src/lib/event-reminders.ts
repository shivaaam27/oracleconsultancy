// "Your 3 o'clock is in an hour" — the engine behind the Settings switch
// "Ping attendees before each meeting".
//
// That switch has existed for a while and described exactly this behaviour, but
// nothing ever read the calendar: the only ping fired the moment an event was
// CREATED. This module is the missing half. It sweeps the calendar, works out
// which reminder lead times fell due since the last sweep, and delivers them:
//
//   • a push + a line in the person's Reminders chat channel (attendees who are
//     people in the system), gated by `eventAttendeePings`;
//   • the branded "coming up" email (attendees with an address), gated by
//     `eventReminderEmail`.
//
// It is on top of — not instead of — Google's own device alarm, which only fires
// for guests whose calendar app is open and signed in.
//
// The rules (which reminders are due, and the wording) live in the pure
// event-reminders-core.ts so they can be tested; this file is the delivery.
// Driven by /api/cron/event-reminders and /api/cron/tick. Safe to run as often as
// you like: every reminder fires at most once, remembered by a small pruned
// ledger in `settings`.

import { sb } from "@/db/supabase";
import { getAppSettings } from "@/lib/settings";
import { postSystemMessage } from "@/lib/chat";
import { sendEmail } from "@/lib/email/send";
import { buildEventEmail } from "@/lib/event-email";
import { listCalendarEvents, type CalendarEvent } from "@/lib/calendar";
import {
  buildChatBody,
  dueReminders,
  fmtWhen,
  leadPhrase,
  DEFAULT_WINDOW_MS,
  LEDGER_TTL_MS,
  MAX_CATCHUP_MS,
  MAX_LOOKAHEAD_DAYS,
} from "@/lib/event-reminders-core";

const LAST_RUN_KEY = "calendar.remindersLastRun";
const SENT_KEY = "calendar.remindersSent";

export type EventReminderResult = {
  fired: number;
  pushed: number;
  emailed: number;
  windowFrom: string;
  windowTo: string;
};

/* ------------------------------- ledger ------------------------------- */

type LedgerEntry = { k: string; t: number };

async function readSetting(key: string): Promise<string | null> {
  const { data } = await sb.from("settings").select("value").eq("key", key).maybeSingle();
  return (data?.value as string | null) ?? null;
}

async function writeSetting(key: string, value: string): Promise<void> {
  await sb.from("settings").upsert({ key, value }, { onConflict: "key" });
}

async function readLedger(now: number): Promise<LedgerEntry[]> {
  const raw = await readSetting(SENT_KEY);
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v
      .filter((e): e is LedgerEntry => !!e && typeof e.k === "string" && typeof e.t === "number")
      .filter((e) => now - e.t < LEDGER_TTL_MS);
  } catch {
    return [];
  }
}

/* ------------------------------- reading ------------------------------- */

/** Minimal row→event mapping for the recurring query (mirrors lib/calendar). */
function mapEventRow(r: Record<string, unknown>): CalendarEvent {
  const parseJsonArray = <T,>(raw: unknown): T[] => {
    if (typeof raw !== "string" || !raw) return [];
    try {
      const v = JSON.parse(raw);
      return Array.isArray(v) ? (v as T[]) : [];
    } catch {
      return [];
    }
  };
  const reminders = parseJsonArray<number>(r.reminders);
  const single = (r.reminder_minutes as number) ?? null;
  return {
    id: r.id as number,
    publicToken: ((r.uid as string) ?? "").split("@")[0],
    title: r.title as string,
    description: (r.description as string) ?? null,
    location: (r.location as string) ?? null,
    meetLink: (r.meet_link as string) ?? null,
    companyId: (r.company_id as number) ?? null,
    startAt: r.start_at as string,
    endAt: (r.end_at as string) ?? null,
    allDay: !!r.all_day,
    reminderMinutes: single,
    reminders: reminders.length ? reminders : single != null ? [single] : [],
    recurrence: (r.recurrence as string) ?? null,
    recurrenceUntil: (r.recurrence_until as string) ?? null,
    attendees: parseJsonArray(r.attendees),
    source: (r.source as string) ?? "manual",
    meetingId: (r.meeting_id as number) ?? null,
    taskId: (r.task_id as number) ?? null,
    uid: r.uid as string,
    sequence: (r.sequence as number) ?? 0,
    status: (r.status as string) ?? "confirmed",
    googleEventId: (r.google_event_id as string) ?? null,
    categoryId: (r.category_id as number) ?? null,
    excludedDates: parseJsonArray<string>(r.excluded_dates),
    createdBy: (r.created_by as string) ?? "web-ui",
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

/**
 * Every event that could have a reminder due: anything starting inside the
 * lookahead, plus every recurring series — whose stored `start_at` may be months
 * in the past even though its next occurrence is days away.
 */
async function candidateEvents(fromIso: string, toIso: string): Promise<CalendarEvent[]> {
  const [oneOffs, recurring] = await Promise.all([
    listCalendarEvents({ from: fromIso, to: toIso }),
    (async () => {
      const { data, error } = await sb
        .from("calendar_events")
        .select("*")
        .not("recurrence", "is", null)
        .lt("start_at", fromIso);
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => mapEventRow(r as Record<string, unknown>));
    })(),
  ]);
  const seen = new Set(oneOffs.map((e) => e.id));
  return [...oneOffs, ...recurring.filter((e) => !seen.has(e.id))];
}

/* ------------------------------- the sweep ------------------------------- */

/**
 * Fire every event reminder that fell due since the last sweep, delivering each
 * one to the people on the event. How punctual a reminder is depends purely on
 * how often this runs — see the cron route.
 */
export async function runEventReminders(opts?: { now?: Date }): Promise<EventReminderResult> {
  const now = opts?.now ?? new Date();
  const nowMs = now.getTime();

  const settings = await getAppSettings();
  const wantPing = settings.eventAttendeePings;
  const wantEmail = settings.eventReminderEmail;

  const lastRunRaw = await readSetting(LAST_RUN_KEY);
  const lastRunMs = lastRunRaw ? new Date(lastRunRaw).getTime() : NaN;
  const windowStart = Math.max(
    Number.isFinite(lastRunMs) ? lastRunMs : nowMs - DEFAULT_WINDOW_MS,
    nowMs - MAX_CATCHUP_MS
  );
  const windowEnd = nowMs;

  // Always move the watermark on, even if nothing fires or a delivery fails —
  // otherwise one bad event would replay its reminders on every sweep.
  const finish = async (r: Omit<EventReminderResult, "windowFrom" | "windowTo">) => {
    await writeSetting(LAST_RUN_KEY, new Date(windowEnd).toISOString());
    return {
      ...r,
      windowFrom: new Date(windowStart).toISOString(),
      windowTo: new Date(windowEnd).toISOString(),
    };
  };

  if (!wantPing && !wantEmail) return finish({ fired: 0, pushed: 0, emailed: 0 });

  const lookaheadEnd = nowMs + MAX_LOOKAHEAD_DAYS * 86400000;
  const events = await candidateEvents(
    new Date(windowStart).toISOString(),
    new Date(lookaheadEnd).toISOString()
  );

  const ledger = await readLedger(nowMs);
  const already = new Set(ledger.map((e) => e.k));
  const fresh: LedgerEntry[] = [];

  let fired = 0;
  let pushed = 0;
  let emailed = 0;

  for (const { event: ev, occurrenceIso, minutes, key } of dueReminders({
    events,
    windowStart,
    windowEnd,
    now: nowMs,
    lookaheadEnd,
  })) {
    if (already.has(key)) continue;
    already.add(key);
    fresh.push({ k: key, t: nowMs });
    fired += 1;

    // A recurring series is stored once, so shift the copy we describe onto THIS
    // occurrence — otherwise every reminder would quote the very first date.
    const occMs = new Date(occurrenceIso).getTime();
    const shifted: CalendarEvent = {
      ...ev,
      startAt: occurrenceIso,
      endAt: ev.endAt
        ? new Date(occMs + (new Date(ev.endAt).getTime() - new Date(ev.startAt).getTime())).toISOString()
        : null,
    };

    // ── push + Reminders channel ──────────────────────────────────────────
    if (wantPing) {
      for (const a of ev.attendees) {
        if (typeof a.personId !== "number") continue;
        try {
          await postSystemMessage({
            personId: a.personId,
            kind: "reminders",
            title: "Task reminders",
            body: buildChatBody(shifted, occurrenceIso, minutes, a.name || ""),
            push: {
              title: `${ev.title} · ${leadPhrase(minutes)}`,
              body: ev.allDay
                ? fmtWhen(occurrenceIso, true)
                : `${fmtWhen(occurrenceIso, false)}${ev.location ? ` · ${ev.location}` : ""}`,
            },
          });
          pushed += 1;
        } catch { /* one bad recipient must not stop the sweep */ }
      }
    }

    // ── branded email ─────────────────────────────────────────────────────
    if (wantEmail) {
      for (const a of ev.attendees.filter((g) => g.email)) {
        try {
          const mail = buildEventEmail(shifted, {
            kind: "reminder",
            organizerName: settings.emailFromName,
            organizerEmail: settings.emailFrom,
            recipientName: a.name,
            publicUrl: process.env.NEXT_PUBLIC_APP_URL
              ? `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/e/${ev.publicToken}`
              : null,
          });
          const r = await sendEmail({ to: a.email!, subject: mail.subject, html: mail.html, text: mail.text });
          if (r.ok) emailed += 1;
        } catch { /* best-effort per guest */ }
      }
    }
  }

  if (fresh.length) await writeSetting(SENT_KEY, JSON.stringify([...ledger, ...fresh]));

  return finish({ fired, pushed, emailed });
}

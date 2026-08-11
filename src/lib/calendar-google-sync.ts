// Catch-up for events that never made it onto the Google calendar.
//
// Pushing to Google at creation is best-effort by design — a network blip, an
// expired token or a slow cold start must never stop the event being saved. But
// the failure was then permanent and invisible: the event sat in COS, absent
// from everyone's phone, with nothing to say so. (Seen in testing: a create-time
// push failed, the identical push seconds later succeeded.)
//
// This sweep re-tries them. It runs alongside the reminder sweep, so a transient
// failure heals on its own instead of waiting for someone to notice and re-save.
//
// Deliberately narrow:
//   • FUTURE, confirmed events only — no rewriting history into the calendar;
//   • never mints a Meet room (a room is the owner's choice at creation);
//   • never emails anyone (Google is called with sendUpdates="none");
//   • capped per run, so a long-broken connection can't stampede the API.

import { sb } from "@/db/supabase";
import { setGoogleEventId, type CalendarEvent } from "@/lib/calendar";
import { createGoogleEvent } from "@/lib/google-calendar";
import { recordEvent } from "@/lib/system-events";

/** Most events to re-try in one sweep. */
const BATCH = 25;

export type GoogleBackfillResult = {
  /** Events found needing a push. */
  found: number;
  /** Successfully placed on the Google calendar. */
  pushed: number;
  /** Still failing (the reason is recorded against the first one). */
  failed: number;
  /** True when Google isn't connected at all — nothing to do, not a fault. */
  notConnected: boolean;
};

export async function backfillGoogleEvents(): Promise<GoogleBackfillResult> {
  const nowIso = new Date().toISOString();
  const { data, error } = await sb
    .from("calendar_events")
    .select("*")
    .is("google_event_id", null)
    .neq("status", "cancelled")
    .gte("start_at", nowIso)
    .order("start_at", { ascending: true })
    .limit(BATCH);
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const result: GoogleBackfillResult = { found: rows.length, pushed: 0, failed: 0, notConnected: false };
  if (!rows.length) return result;

  let firstError: string | null = null;

  for (const row of rows) {
    // createGoogleEvent only reads the fields below, so a light shape is enough.
    const ev = {
      id: row.id as number,
      title: row.title as string,
      description: (row.description as string) ?? null,
      location: (row.location as string) ?? null,
      meetLink: (row.meet_link as string) ?? null,
      startAt: row.start_at as string,
      endAt: (row.end_at as string) ?? null,
      allDay: !!row.all_day,
      reminders: parseNumbers(row.reminders, (row.reminder_minutes as number) ?? null),
      recurrence: (row.recurrence as string) ?? null,
      recurrenceUntil: (row.recurrence_until as string) ?? null,
      attendees: parseAttendees(row.attendees),
    } as CalendarEvent;

    const g = await createGoogleEvent(ev, { requestMeet: false });
    if (g.ok) {
      if (g.eventId) await setGoogleEventId(ev.id, g.eventId);
      result.pushed += 1;
      continue;
    }
    if (g.reason === "not-connected") {
      // No Google account linked — stop immediately, this isn't a fault.
      result.notConnected = true;
      return result;
    }
    result.failed += 1;
    if (!firstError) firstError = `${ev.title}: ${g.error ?? "unknown"}`;
  }

  if (result.pushed || result.failed) {
    await recordEvent("calendar.google-backfill", result.failed ? "error" : "ok", {
      found: result.found,
      pushed: result.pushed,
      failed: result.failed,
      ...(firstError ? { message: firstError } : {}),
    });
  }
  return result;
}

function parseAttendees(raw: unknown): CalendarEvent["attendees"] {
  if (typeof raw !== "string" || !raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function parseNumbers(raw: unknown, fallback: number | null): number[] {
  if (typeof raw === "string" && raw) {
    try {
      const v = JSON.parse(raw);
      if (Array.isArray(v)) return v.filter((n): n is number => typeof n === "number");
    } catch { /* fall through */ }
  }
  return fallback != null ? [fallback] : [];
}

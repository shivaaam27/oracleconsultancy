// Creates events directly in Google Calendar via the API. When the operator's
// Google account is connected, this is the "magic" path: the event lands in each
// guest's calendar automatically (Google delivers the native invite), Apple/
// Outlook guests get a perfectly-formed invitation Google sends for us, and a
// real Meet link is minted per event. Falls back to .ics email when not connected.

import { google, type calendar_v3 } from "googleapis";
import { getAuthorizedClient } from "@/lib/google";
import type { CalendarEvent } from "@/lib/calendar";

export type GoogleCreateResult =
  | { ok: true; htmlLink: string | null; meetLink: string | null; eventId: string }
  | { ok: false; reason: "not-connected" | "error"; error?: string };

export type GoogleWriteResult =
  | { ok: true }
  | { ok: false; reason: "not-connected" | "no-google-event" | "error"; error?: string };

const EAT_TZ = "Africa/Dar_es_Salaam";

/** Shared field mapping for insert + patch. `wantMeet` adds a Meet create request. */
function buildRequestBody(ev: CalendarEvent, wantMeet: boolean): calendar_v3.Schema$Event {
  const start = new Date(ev.startAt);
  const end = ev.endAt ? new Date(ev.endAt) : new Date(start.getTime() + (ev.allDay ? 24 : 1) * 60 * 60 * 1000);
  const startField = ev.allDay ? { date: start.toISOString().slice(0, 10) } : { dateTime: start.toISOString(), timeZone: EAT_TZ };
  const endField = ev.allDay ? { date: end.toISOString().slice(0, 10) } : { dateTime: end.toISOString(), timeZone: EAT_TZ };
  return {
    summary: ev.title,
    description: [ev.description, ev.meetLink ? `Join: ${ev.meetLink}` : null].filter(Boolean).join("\n\n") || undefined,
    location: ev.location || ev.meetLink || undefined,
    start: startField,
    end: endField,
    attendees: ev.attendees.filter((a) => a.email).map((a) => ({ email: a.email!, displayName: a.name || undefined })),
    reminders:
      ev.reminderMinutes != null
        ? { useDefault: false, overrides: [{ method: "popup", minutes: ev.reminderMinutes }] }
        : { useDefault: true },
    ...(wantMeet
      ? {
          conferenceData: {
            createRequest: {
              requestId: `cos-${ev.id}-${Date.now()}`,
              conferenceSolutionKey: { type: "hangoutsMeet" },
            },
          },
        }
      : {}),
  };
}

/**
 * Pushes a stored COS event into Google Calendar and invites the attendees.
 * `requestMeet` adds a freshly-generated Google Meet room (Option B). With
 * sendUpdates="all", Google emails/auto-adds for every guest.
 */
export async function createGoogleEvent(
  ev: CalendarEvent,
  opts?: { requestMeet?: boolean }
): Promise<GoogleCreateResult> {
  const auth = await getAuthorizedClient();
  if (!auth) return { ok: false, reason: "not-connected" };

  try {
    const calendar = google.calendar({ version: "v3", auth });
    const wantMeet = !!(opts?.requestMeet && !ev.meetLink);
    const requestBody = buildRequestBody(ev, wantMeet);

    const res = await calendar.events.insert({
      calendarId: "primary",
      sendUpdates: "all",
      conferenceDataVersion: wantMeet ? 1 : 0,
      requestBody,
    });

    const data = res.data;
    const meetLink =
      data.hangoutLink ??
      data.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri ??
      null;

    return { ok: true, htmlLink: data.htmlLink ?? null, meetLink, eventId: data.id ?? "" };
  } catch (e) {
    return { ok: false, reason: "error", error: e instanceof Error ? e.message : "Google Calendar error" };
  }
}

/**
 * Push a COS edit to the matching Google event so guests get the reschedule/
 * change email and their calendars update. No-op (typed) when Google isn't
 * connected or the event was never pushed to Google. Never mints a new Meet.
 */
export async function updateGoogleEvent(ev: CalendarEvent): Promise<GoogleWriteResult> {
  if (!ev.googleEventId) return { ok: false, reason: "no-google-event" };
  const auth = await getAuthorizedClient();
  if (!auth) return { ok: false, reason: "not-connected" };
  try {
    const calendar = google.calendar({ version: "v3", auth });
    await calendar.events.patch({
      calendarId: "primary",
      eventId: ev.googleEventId,
      sendUpdates: "all",
      requestBody: buildRequestBody(ev, false),
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: "error", error: e instanceof Error ? e.message : "Google Calendar error" };
  }
}

/**
 * Cancel (delete) the matching Google event so Google emails guests the
 * cancellation and removes it from their calendars. Treats an already-deleted
 * Google event (410 Gone) as success.
 */
export async function cancelGoogleEvent(googleEventId: string): Promise<GoogleWriteResult> {
  const auth = await getAuthorizedClient();
  if (!auth) return { ok: false, reason: "not-connected" };
  try {
    const calendar = google.calendar({ version: "v3", auth });
    await calendar.events.delete({ calendarId: "primary", eventId: googleEventId, sendUpdates: "all" });
    return { ok: true };
  } catch (e) {
    const code = (e as { code?: number })?.code;
    if (code === 404 || code === 410) return { ok: true }; // already gone
    return { ok: false, reason: "error", error: e instanceof Error ? e.message : "Google Calendar error" };
  }
}

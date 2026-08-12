// Creates events directly in Google Calendar via the API. When the operator's
// Google account is connected, this is the "magic" path: the event lands in each
// guest's calendar automatically (Google delivers the native invite), Apple/
// Outlook guests get a perfectly-formed invitation Google sends for us, and a
// real Meet link is minted per event. Falls back to .ics email when not connected.

import { google, type calendar_v3 } from "googleapis";
import { getAuthorizedClient } from "@/lib/google";
import type { CalendarEvent } from "@/lib/calendar";
import { recurrenceToRrule } from "@/lib/ics";

export type GoogleCreateResult =
  | { ok: true; htmlLink: string | null; meetLink: string | null; eventId: string; attachmentsAccepted?: boolean }
  | { ok: false; reason: "not-connected" | "error"; error?: string };

export type GoogleWriteResult =
  | { ok: true; attachmentsAccepted?: boolean }
  | { ok: false; reason: "not-connected" | "no-google-event" | "error"; error?: string };

/** A paper to hang off the Google event. `fileUrl` is our permanent
 *  /e/<token>/doc/<id> link — see the caveat on `attachmentsAccepted` below. */
export type GoogleAttachment = { fileUrl: string; title: string; mimeType?: string | null };

const EAT_TZ = "Africa/Dar_es_Salaam";

// Google caps attachments at 25 per event (documented on Events.attachments).
const MAX_GOOGLE_ATTACHMENTS = 25;

/**
 * Google's own reference is ambiguous about whether `fileUrl` MUST be a Drive
 * link: it documents the Drive format but describes the field as "URL link to
 * the attachment". Rather than depend on the answer, every call that sends
 * attachments RETRIES WITHOUT THEM if Google refuses — the calendar entry is the
 * thing that matters, and a rejected paperclip must never cost us the event.
 * The .ics ATTACH line and the emailed file are unaffected either way.
 */
function looksLikeAttachmentRejection(e: unknown): boolean {
  const err = e as { code?: number; message?: string; errors?: Array<{ reason?: string; message?: string }> };
  if (err?.code !== 400 && err?.code !== 403) return false;
  const text = [err?.message, ...(err?.errors ?? []).map((x) => `${x.reason} ${x.message}`)].join(" ").toLowerCase();
  return text.includes("attachment") || text.includes("fileurl") || text.includes("drive");
}

/** Shared field mapping for insert + patch. `wantMeet` adds a Meet create request. */
function buildRequestBody(
  ev: CalendarEvent,
  wantMeet: boolean,
  attachments?: GoogleAttachment[]
): calendar_v3.Schema$Event {
  const start = new Date(ev.startAt);
  const end = ev.endAt ? new Date(ev.endAt) : new Date(start.getTime() + (ev.allDay ? 24 : 1) * 60 * 60 * 1000);
  const startField = ev.allDay ? { date: start.toISOString().slice(0, 10) } : { dateTime: start.toISOString(), timeZone: EAT_TZ };
  const endField = ev.allDay ? { date: end.toISOString().slice(0, 10) } : { dateTime: end.toISOString(), timeZone: EAT_TZ };

  // Recurrence → a real Google recurring series (one invite covers every
  // occurrence; edits/cancellations then propagate to all of them natively).
  // Without this, a "every Saturday" event only landed one Saturday in Google.
  const rrule = recurrenceToRrule(ev.recurrence, ev.recurrenceUntil ? new Date(ev.recurrenceUntil) : null);

  // All reminders (Google caps at 5 overrides), not just the first.
  const reminderOverrides = [...new Set((ev.reminders ?? []).filter((m) => m != null && m >= 0))]
    .slice(0, 5)
    .map((minutes) => ({ method: "popup" as const, minutes }));

  return {
    summary: ev.title,
    description: [ev.description, ev.meetLink ? `Join: ${ev.meetLink}` : null].filter(Boolean).join("\n\n") || undefined,
    location: ev.location || ev.meetLink || undefined,
    start: startField,
    end: endField,
    ...(rrule ? { recurrence: [rrule] } : {}),
    attendees: ev.attendees.filter((a) => a.email).map((a) => ({ email: a.email!, displayName: a.name || undefined })),
    reminders:
      reminderOverrides.length > 0
        ? { useDefault: false, overrides: reminderOverrides }
        : { useDefault: true },
    ...(attachments && attachments.length
      ? {
          attachments: attachments.slice(0, MAX_GOOGLE_ATTACHMENTS).map((a) => ({
            fileUrl: a.fileUrl,
            title: a.title,
            ...(a.mimeType ? { mimeType: a.mimeType } : {}),
          })),
        }
      : {}),
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
 * Pushes a stored COS event into Google Calendar (the owner's calendar mirror +
 * a freshly-minted Google Meet room when `requestMeet`). sendUpdates="none":
 * Google NEVER emails the guests — the app sends its own branded invitation +
 * .ics, so the guest experience is fully ours (not Google's plain template).
 */
export async function createGoogleEvent(
  ev: CalendarEvent,
  opts?: { requestMeet?: boolean; attachments?: GoogleAttachment[] }
): Promise<GoogleCreateResult> {
  const auth = await getAuthorizedClient();
  if (!auth) return { ok: false, reason: "not-connected" };

  const calendar = google.calendar({ version: "v3", auth });
  const wantMeet = !!(opts?.requestMeet && !ev.meetLink);
  const atts = opts?.attachments ?? [];

  const insert = async (withAttachments: boolean) => {
    const res = await calendar.events.insert({
      calendarId: "primary",
      sendUpdates: "none",
      conferenceDataVersion: wantMeet ? 1 : 0,
      ...(withAttachments && atts.length ? { supportsAttachments: true } : {}),
      requestBody: buildRequestBody(ev, wantMeet, withAttachments ? atts : undefined),
    });
    const data = res.data;
    const meetLink =
      data.hangoutLink ??
      data.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri ??
      null;
    return {
      ok: true as const,
      htmlLink: data.htmlLink ?? null,
      meetLink,
      eventId: data.id ?? "",
      attachmentsAccepted: withAttachments && atts.length > 0,
    };
  };

  try {
    return await insert(atts.length > 0);
  } catch (e) {
    // A refused paperclip must not cost us the calendar entry — retry plain.
    if (atts.length && looksLikeAttachmentRejection(e)) {
      try {
        return await insert(false);
      } catch (e2) {
        return { ok: false, reason: "error", error: e2 instanceof Error ? e2.message : "Google Calendar error" };
      }
    }
    return { ok: false, reason: "error", error: e instanceof Error ? e.message : "Google Calendar error" };
  }
}

/**
 * Push a COS edit to the matching Google event so guests get the reschedule/
 * change email and their calendars update. No-op (typed) when Google isn't
 * connected or the event was never pushed to Google. Never mints a new Meet.
 */
export async function updateGoogleEvent(
  ev: CalendarEvent,
  opts?: { attachments?: GoogleAttachment[] }
): Promise<GoogleWriteResult> {
  if (!ev.googleEventId) return { ok: false, reason: "no-google-event" };
  const auth = await getAuthorizedClient();
  if (!auth) return { ok: false, reason: "not-connected" };

  const calendar = google.calendar({ version: "v3", auth });
  const atts = opts?.attachments ?? [];

  const patch = async (withAttachments: boolean) => {
    await calendar.events.patch({
      calendarId: "primary",
      eventId: ev.googleEventId!,
      sendUpdates: "none",
      ...(withAttachments && atts.length ? { supportsAttachments: true } : {}),
      requestBody: buildRequestBody(ev, false, withAttachments ? atts : undefined),
    });
    return { ok: true as const, attachmentsAccepted: withAttachments && atts.length > 0 };
  };

  try {
    return await patch(atts.length > 0);
  } catch (e) {
    if (atts.length && looksLikeAttachmentRejection(e)) {
      try {
        return await patch(false);
      } catch (e2) {
        return { ok: false, reason: "error", error: e2 instanceof Error ? e2.message : "Google Calendar error" };
      }
    }
    return { ok: false, reason: "error", error: e instanceof Error ? e.message : "Google Calendar error" };
  }
}

/**
 * Mint a Meet room ON an event that is ALREADY in Google. Needed because every
 * event now reaches Google at creation — so "add a Meet link" afterwards must
 * patch the existing event, never insert a second copy of it.
 */
export async function addGoogleMeet(
  googleEventId: string,
  eventId: number
): Promise<{ ok: true; meetLink: string | null } | { ok: false; reason: "not-connected" | "error"; error?: string }> {
  const auth = await getAuthorizedClient();
  if (!auth) return { ok: false, reason: "not-connected" };
  try {
    const calendar = google.calendar({ version: "v3", auth });
    const res = await calendar.events.patch({
      calendarId: "primary",
      eventId: googleEventId,
      sendUpdates: "none",
      conferenceDataVersion: 1,
      requestBody: {
        conferenceData: {
          createRequest: {
            requestId: `cos-meet-${eventId}-${Date.now()}`,
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        },
      },
    });
    const data = res.data;
    return {
      ok: true,
      meetLink:
        data.hangoutLink ??
        data.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri ??
        null,
    };
  } catch (e) {
    return { ok: false, reason: "error", error: e instanceof Error ? e.message : "Google Calendar error" };
  }
}

/**
 * Cancel ONE occurrence of a recurring Google event (leaving the rest intact) so
 * guests are told that single date is off. Finds the instance whose start matches
 * `occurrenceStartIso` (within the same day) and deletes it with sendUpdates="all".
 */
export async function cancelGoogleInstance(
  seriesEventId: string,
  occurrenceStartIso: string,
): Promise<GoogleWriteResult> {
  const auth = await getAuthorizedClient();
  if (!auth) return { ok: false, reason: "not-connected" };
  try {
    const calendar = google.calendar({ version: "v3", auth });
    const start = new Date(occurrenceStartIso);
    const dayStart = new Date(start); dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(start); dayEnd.setUTCHours(23, 59, 59, 999);
    const res = await calendar.events.instances({
      calendarId: "primary",
      eventId: seriesEventId,
      timeMin: dayStart.toISOString(),
      timeMax: dayEnd.toISOString(),
      maxResults: 10,
    });
    const target = start.getTime();
    const instance = (res.data.items ?? []).find((it) => {
      const s = it.start?.dateTime ?? (it.start?.date ? `${it.start.date}T00:00:00Z` : null);
      if (!s) return false;
      return Math.abs(new Date(s).getTime() - target) < 60_000; // within a minute
    });
    if (!instance?.id) return { ok: true }; // nothing to cancel (already gone / not found)
    await calendar.events.delete({ calendarId: "primary", eventId: instance.id, sendUpdates: "none" });
    return { ok: true };
  } catch (e) {
    const code = (e as { code?: number })?.code;
    if (code === 404 || code === 410) return { ok: true };
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
    await calendar.events.delete({ calendarId: "primary", eventId: googleEventId, sendUpdates: "none" });
    return { ok: true };
  } catch (e) {
    const code = (e as { code?: number })?.code;
    if (code === 404 || code === 410) return { ok: true }; // already gone
    return { ok: false, reason: "error", error: e instanceof Error ? e.message : "Google Calendar error" };
  }
}

"use server";

import { revalidatePath } from "next/cache";
import {
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  getCalendarEvent,
  markCalendarEventCancelled,
  setGoogleEventId,
  setExcludedDates,
  toIcsEvent,
  type CalendarAttendee,
  type CalendarEvent,
} from "@/lib/calendar";
import { buildIcs } from "@/lib/ics";
import { buildEventEmail, type EventEmailKind } from "@/lib/event-email";
import { createTasksForEvent, shouldCreateMeetingTasks } from "@/lib/meeting-tasks";
import { sendEmail } from "@/lib/email/send";
import { getAppSettings } from "@/lib/settings";
import { cancelGoogleEvent, cancelGoogleInstance, createGoogleEvent, updateGoogleEvent } from "@/lib/google-calendar";
import { resolveEventCategoryId } from "@/lib/event-categories";
import { sb } from "@/db/supabase";
import { db } from "@/db";
import { calendarEvents, eventCategories } from "@/db/schema";
import { eq } from "drizzle-orm";

type Result =
  | { ok: true; id?: number; googleSynced?: boolean; googleCancelled?: boolean; taskCodes?: string[] }
  | { ok: false; error: string };

/** Parse a JSON array of company ids from the form ("companyIds"), falling back
 *  to the single "companyId" field. Used for meeting-as-task (one task/company). */
function parseCompanyIds(fd: FormData, fallback: number | null): number[] {
  const raw = (fd.get("companyIds") ?? "").toString().trim();
  if (raw) {
    try {
      const v = JSON.parse(raw);
      if (Array.isArray(v)) {
        const ids = v.map((n) => Number(n)).filter((n) => Number.isFinite(n));
        if (ids.length) return [...new Set(ids)];
      }
    } catch { /* fall through */ }
  }
  return fallback != null ? [fallback] : [];
}

function str(fd: FormData, key: string): string | null {
  const v = (fd.get(key) ?? "").toString().trim();
  return v || null;
}
function numOrNull(fd: FormData, key: string): number | null {
  const v = (fd.get(key) ?? "").toString().trim();
  if (!v) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

// A datetime-local value ("2026-06-15T14:00") is wall-clock in Dar es Salaam
// (UTC+3). We append the offset so it's stored as the correct instant.
function localToIso(value: string | null, allDay: boolean): string | null {
  if (!value) return null;
  if (allDay) {
    // Date-only — anchor at UTC midnight (the all-day convention used app-wide).
    const datePart = value.slice(0, 10);
    const d = new Date(`${datePart}T00:00:00Z`);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  // datetime-local has no zone; treat as Dar es Salaam (+03:00).
  const d = new Date(`${value}:00+03:00`);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function parseAttendees(raw: string | null): CalendarAttendee[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v
      .map((a: { personId?: number; name?: string; email?: string }) => ({
        personId: a.personId,
        name: (a.name ?? "").toString(),
        email: a.email ? a.email.toString() : undefined,
      }))
      .filter((a) => a.name);
  } catch {
    return [];
  }
}

function parseReminders(raw: string | null): number[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return [...new Set(v.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n >= 0))].sort((a, b) => b - a);
  } catch {
    return [];
  }
}

function parseRecurrence(fd: FormData): { recurrence: string | null; recurrenceUntil: string | null } {
  const r = (fd.get("recurrence") ?? "").toString().trim();
  const recurrence = ["daily", "weekly", "monthly"].includes(r) ? r : null;
  if (!recurrence) return { recurrence: null, recurrenceUntil: null };
  const until = (fd.get("recurrenceUntil") ?? "").toString().trim();
  let recurrenceUntil: string | null = null;
  if (until) {
    const d = new Date(`${until.slice(0, 10)}T00:00:00Z`);
    recurrenceUntil = isNaN(d.getTime()) ? null : d.toISOString();
  }
  return { recurrence, recurrenceUntil };
}

function invalidate() {
  revalidatePath("/calendar");
}

export async function createEventAction(fd: FormData, createdBy?: string): Promise<Result> {
  const title = str(fd, "title");
  if (!title) return { ok: false, error: "Give the event a title." };
  const allDay = fd.get("allDay") === "1" || fd.get("allDay") === "on";
  const startAt = localToIso(str(fd, "startAt"), allDay);
  if (!startAt) return { ok: false, error: "Choose a start date/time." };
  const endAt = localToIso(str(fd, "endAt"), allDay);

  try {
    const companyId = numOrNull(fd, "companyId");
    const categoryId = await resolveEventCategoryId(str(fd, "category"));
    const ev = await createCalendarEvent({
      title,
      description: str(fd, "description"),
      location: str(fd, "location"),
      meetLink: str(fd, "meetLink"),
      companyId,
      categoryId,
      startAt,
      endAt,
      allDay,
      reminders: parseReminders(str(fd, "reminders")),
      ...parseRecurrence(fd),
      attendees: parseAttendees(str(fd, "attendees")),
      createdBy,
    });

    // Meeting-as-task: spawn one task per company (no deadline) so the meeting can
    // be prepped + followed through in the task system. Per-event override:
    // trackAsTask "on"/"off" beats the setting; empty = the setting's default.
    let taskCodes: string[] | undefined;
    try {
      const settings = await getAppSettings();
      const companyIds = parseCompanyIds(fd, companyId);
      const track = (fd.get("trackAsTask") ?? "").toString().trim();
      const want =
        track === "off" ? false
        : track === "on" ? companyIds.length > 0
        : shouldCreateMeetingTasks(settings.meetingTaskMode, companyIds);
      if (want) {
        const created = await createTasksForEvent(ev, { companyIds, createdBy });
        if (created.length) taskCodes = created.map((t) => t.code);
      }
    } catch { /* task spawn is best-effort — never block event creation */ }

    invalidate();
    return { ok: true, id: ev.id, taskCodes };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not create event." };
  }
}

/**
 * Ensure a Google Meet link exists on an event — mints one via the Google
 * Calendar API even when there are NO email attendees (so an internal meeting
 * still gets a room). No-op if a link already exists or Google isn't connected.
 * Creating the Google event also invites any email guests (sendUpdates="all").
 */
export async function ensureEventMeetLink(id: number): Promise<{ meetLink: string | null }> {
  const ev = await getCalendarEvent(id);
  if (!ev) return { meetLink: null };
  if (ev.meetLink) return { meetLink: ev.meetLink };
  const g = await createGoogleEvent(ev, { requestMeet: true });
  if (g.ok) {
    // Remember the Google event id so a later edit/cancel can reach it, and store
    // the freshly-minted Meet link.
    if (g.eventId) await setGoogleEventId(id, g.eventId, g.meetLink);
    else if (g.meetLink) await sb.from("calendar_events").update({ meet_link: g.meetLink, updated_at: new Date().toISOString() }).eq("id", id);
    invalidate();
    return { meetLink: g.meetLink };
  }
  return { meetLink: null };
}

export async function updateEventAction(fd: FormData): Promise<Result> {
  const id = numOrNull(fd, "id");
  if (!id) return { ok: false, error: "Missing event." };
  const title = str(fd, "title");
  if (!title) return { ok: false, error: "Give the event a title." };
  const allDay = fd.get("allDay") === "1" || fd.get("allDay") === "on";
  const startAt = localToIso(str(fd, "startAt"), allDay);
  if (!startAt) return { ok: false, error: "Choose a start date/time." };
  const endAt = localToIso(str(fd, "endAt"), allDay);

  try {
    const updated = await updateCalendarEvent(id, {
      title,
      description: str(fd, "description"),
      location: str(fd, "location"),
      meetLink: str(fd, "meetLink"),
      companyId: numOrNull(fd, "companyId"),
      categoryId: await resolveEventCategoryId(str(fd, "category")),
      startAt,
      endAt,
      allDay,
      reminders: parseReminders(str(fd, "reminders")),
      ...parseRecurrence(fd),
      attendees: parseAttendees(str(fd, "attendees")),
    });
    // If this event lives in Google Calendar, push the edit so every guest gets
    // the reschedule/change email + their calendar updates. Best-effort — a Google
    // hiccup must never block saving the change locally.
    let googleSynced = false;
    if (updated.googleEventId) {
      const r = await updateGoogleEvent(updated);
      googleSynced = r.ok;
    }
    invalidate();
    return { ok: true, id, googleSynced };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not update event." };
  }
}

function fmtEat(iso: string, allDay: boolean): string {
  const d = new Date(iso);
  if (allDay) {
    return d.toLocaleDateString("en-GB", { timeZone: "Africa/Dar_es_Salaam", weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }
  return d.toLocaleString("en-GB", { timeZone: "Africa/Dar_es_Salaam", weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Company display name for an event (for the email letterhead line). */
async function eventCompanyName(companyId: number | null): Promise<string | null> {
  if (!companyId) return null;
  const { data } = await sb.from("companies").select("name").eq("id", companyId).maybeSingle();
  return (data?.name as string) ?? null;
}

/** Public share page for an event, if an app URL is configured. */
function publicEventUrl(token: string): string | null {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  return base ? `${base}/e/${token}` : null;
}

type SendResult =
  | { ok: true; count: number; via: "google" | "email"; meetLink?: string | null }
  | { ok: false; error: string; reason?: string };

/**
 * Invites every attendee with an email. Prefers the connected Google account
 * (event lands in guests' calendars automatically + a real Meet link is minted),
 * and falls back to the .ics email path when Google isn't connected.
 */
export async function sendEventInviteAction(id: number): Promise<SendResult> {
  const ev = await getCalendarEvent(id);
  if (!ev) return { ok: false, error: "Event not found." };

  const recipients = ev.attendees.filter((a) => a.email).map((a) => a.email!) as string[];
  if (recipients.length === 0)
    return { ok: false, error: "No attendees with an email address. Add their email first." };

  // --- Preferred path: Google Calendar (auto-add + native invites + Meet) ---
  const g = await createGoogleEvent(ev, { requestMeet: true });
  if (g.ok) {
    const now = new Date().toISOString();
    // Remember the Google event id (for later edit/cancel sync) + any minted Meet link.
    if (g.eventId) await setGoogleEventId(ev.id, g.eventId, g.meetLink && !ev.meetLink ? g.meetLink : null);
    else if (g.meetLink && !ev.meetLink) {
      await sb.from("calendar_events").update({ meet_link: g.meetLink, updated_at: now }).eq("id", ev.id);
    }
    await sb.from("outbox").insert({
      channel: "EMAIL",
      recipient_name: ev.attendees.filter((a) => a.email).map((a) => a.name).join(", "),
      recipient_contact: recipients.join(", "),
      subject: `Invitation: ${ev.title}`,
      body: `Sent via Google Calendar.${g.meetLink ? ` Meet: ${g.meetLink}` : ""}`,
      message_type: "calendar-invite",
      status: "Sent",
      source: `calendar:${ev.id}`,
      created_at: now,
      sent_at: now,
    });

    // Confirmation copy to the organiser's own inbox — Google never emails the
    // organiser their own invite, so without this you'd have nothing in your mail.
    // Best-effort: never block or fail the invite if this copy can't send.
    try {
      const { emailFrom, emailFromName } = await getAppSettings();
      if (emailFrom) {
        const companyName = await eventCompanyName(ev.companyId);
        // Reflect the freshly-minted Meet link (not yet on the stored ev) in the copy.
        const evForCopy = { ...ev, meetLink: g.meetLink || ev.meetLink };
        const mail = buildEventEmail(evForCopy, {
          kind: "invite",
          organizerName: emailFromName,
          organizerEmail: emailFrom,
          companyName,
          publicUrl: publicEventUrl(ev.publicToken),
        });
        await sendEmail({
          to: emailFrom,
          subject: `Copy: invite sent — ${ev.title}`,
          html: mail.html,
          text: `This invitation was sent via Google Calendar and added to each guest's calendar. Your copy for the record:\n\n${mail.text}`,
        });
      }
    } catch {
      /* confirmation copy is best-effort */
    }

    invalidate();
    return { ok: true, count: recipients.length, via: "google", meetLink: g.meetLink };
  }
  // g.reason === "not-connected" → fall through to email; a real error also falls
  // back so a guest still gets the invite.

  const { emailFrom, emailFromName } = await getAppSettings();
  const icsEvent = toIcsEvent(ev, { name: emailFromName, email: emailFrom });
  const ics = buildIcs(icsEvent);
  const companyName = await eventCompanyName(ev.companyId);
  const mail = buildEventEmail(ev, {
    kind: "invite",
    organizerName: emailFromName,
    organizerEmail: emailFrom,
    companyName,
    publicUrl: publicEventUrl(ev.publicToken),
  });

  const result = await sendEmail({
    to: recipients,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    replyTo: emailFrom,
    calendar: { content: ics, method: "REQUEST", filename: "invite.ics" },
  });

  if (!result.ok) {
    if (result.reason === "not-configured")
      return {
        ok: false,
        reason: "not-configured",
        error: "Email sending isn't switched on yet (no provider key). The invite link still works — share it manually for now.",
      };
    return { ok: false, error: result.error ?? "Could not send the email." };
  }

  // Human-readable sent record in the Outbox (mirrors markSent for other channels).
  const now = new Date().toISOString();
  await sb.from("outbox").insert({
    channel: "EMAIL",
    recipient_name: ev.attendees.filter((a) => a.email).map((a) => a.name).join(", "),
    recipient_contact: recipients.join(", "),
    subject: `Invitation: ${ev.title}`,
    body: mail.text,
    message_type: "calendar-invite",
    status: "Sent",
    source: `calendar:${ev.id}`,
    created_at: now,
    sent_at: now,
  });

  invalidate();
  return { ok: true, count: recipients.length, via: "email" };
}

/**
 * Render the exact invite email (subject + HTML) WITHOUT sending — powers the
 * "Preview email" step in the calendar UI, so the owner sees what guests receive
 * before committing. Read-only.
 */
export async function previewEventInviteAction(
  id: number,
  kind: EventEmailKind = "invite",
): Promise<{ ok: true; subject: string; html: string; recipients: string[] } | { ok: false; error: string }> {
  const ev = await getCalendarEvent(id);
  if (!ev) return { ok: false, error: "Event not found." };
  const { emailFrom, emailFromName } = await getAppSettings();
  const companyName = await eventCompanyName(ev.companyId);
  const mail = buildEventEmail(ev, {
    kind,
    organizerName: emailFromName,
    organizerEmail: emailFrom,
    companyName,
    publicUrl: publicEventUrl(ev.publicToken),
  });
  const recipients = ev.attendees.filter((a) => a.email).map((a) => a.email!) as string[];
  return { ok: true, subject: mail.subject, html: mail.html, recipients };
}

function firstName(name: string | undefined): string {
  return (name ?? "").trim().split(/\s+/)[0] ?? "";
}

type DraftResult = { ok: true; count: number } | { ok: false; error: string };

/**
 * Create Outbox **drafts** reminding each attendee (with an email) ahead of the
 * event. Scheduled for the event's first reminder lead time; the owner reviews
 * and sends from /outbox. Reuses the Outbox — no auto-send.
 */
export async function draftEventRemindersAction(id: number): Promise<DraftResult> {
  const ev = await getCalendarEvent(id);
  if (!ev) return { ok: false, error: "Event not found." };
  const recipients = ev.attendees.filter((a) => a.email);
  if (recipients.length === 0) return { ok: false, error: "No attendees with an email to remind." };

  const when = fmtEat(ev.startAt, ev.allDay);
  const lead = ev.reminders[0] ?? 1440;
  const scheduledFor = new Date(new Date(ev.startAt).getTime() - lead * 60_000).toISOString();
  const now = new Date().toISOString();
  const rows = recipients.map((a) => ({
    channel: "EMAIL",
    recipient_name: a.name,
    recipient_contact: a.email,
    subject: `Reminder: ${ev.title}`,
    body: [
      `Hi ${firstName(a.name)},`.trim(),
      ``,
      `A reminder that "${ev.title}" is scheduled for ${when}.`,
      ev.meetLink ? `Join: ${ev.meetLink}` : null,
      ev.location ? `Where: ${ev.location}` : null,
      ``,
      `See you there.`,
    ].filter((l) => l !== null).join("\n"),
    message_type: "EVENT REMINDER",
    status: "Draft",
    source: `calendar:${ev.id}`,
    scheduled_for: scheduledFor,
    created_at: now,
  }));
  const { error } = await sb.from("outbox").insert(rows);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/outbox");
  return { ok: true, count: rows.length };
}

/** Create Outbox follow-up drafts after a meeting (one per attendee with email). */
export async function draftEventFollowupAction(id: number): Promise<DraftResult> {
  const ev = await getCalendarEvent(id);
  if (!ev) return { ok: false, error: "Event not found." };
  const recipients = ev.attendees.filter((a) => a.email);
  if (recipients.length === 0) return { ok: false, error: "No attendees with an email to follow up." };

  const when = fmtEat(ev.startAt, ev.allDay);
  const now = new Date().toISOString();
  const rows = recipients.map((a) => ({
    channel: "EMAIL",
    recipient_name: a.name,
    recipient_contact: a.email,
    subject: `Follow-up: ${ev.title}`,
    body: [
      `Hi ${firstName(a.name)},`.trim(),
      ``,
      `Thank you for joining "${ev.title}" on ${when}.`,
      ``,
      `Action points:`,
      `- `,
      ``,
      `Please let me know if I've missed anything.`,
    ].join("\n"),
    message_type: "EVENT FOLLOW-UP",
    status: "Draft",
    source: `calendar:${ev.id}`,
    created_at: now,
  }));
  const { error } = await sb.from("outbox").insert(rows);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/outbox");
  return { ok: true, count: rows.length };
}

/**
 * When an event invited by EMAIL (not Google) is cancelled/deleted, email the
 * guests a METHOD:CANCEL .ics so their calendars remove it — for a recurring
 * series this retracts every occurrence (matched by UID). Google-invited events
 * (googleEventId set) are skipped: Google sends its own cancellation, so we'd
 * otherwise double-notify. Only fires when an invite was actually emailed (a prior
 * calendar-invite Outbox row exists) — never for drafts nobody received.
 * Best-effort: never throws.
 */
async function emailCancellationIfSent(ev: CalendarEvent): Promise<void> {
  try {
    if (ev.googleEventId) return; // Google notifies guests itself on cancel
    const recipients = ev.attendees.filter((a) => a.email).map((a) => a.email!) as string[];
    if (recipients.length === 0) return;
    const { data: sent } = await sb
      .from("outbox")
      .select("id")
      .eq("source", `calendar:${ev.id}`)
      .eq("message_type", "calendar-invite")
      .limit(1);
    if (!sent || sent.length === 0) return; // never actually emailed → nothing to retract

    const { emailFrom, emailFromName } = await getAppSettings();
    // A cancellation .ics MUST share the UID and carry a higher SEQUENCE than the
    // invite so the guest's calendar supersedes (removes) the original.
    const icsEvent = { ...toIcsEvent(ev, { name: emailFromName, email: emailFrom }), status: "cancelled" as const, sequence: ev.sequence + 1 };
    const ics = buildIcs(icsEvent);
    const when = fmtEat(ev.startAt, ev.allDay);
    const safeTitle = ev.title.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
    const res = await sendEmail({
      to: recipients,
      subject: `Cancelled: ${ev.title}`,
      html: `<p>The event <strong>${safeTitle}</strong> scheduled for ${when} has been <strong>cancelled</strong>.</p><p>It will be removed from your calendar automatically. Apologies for any inconvenience.</p>`,
      text: `The event "${ev.title}" (${when}) has been cancelled and will be removed from your calendar automatically.`,
      replyTo: emailFrom,
      calendar: { content: ics, method: "CANCEL", filename: "cancel.ics" },
    });
    if (res.ok) {
      const now = new Date().toISOString();
      await sb.from("outbox").insert({
        channel: "EMAIL",
        recipient_name: ev.attendees.filter((a) => a.email).map((a) => a.name).join(", "),
        recipient_contact: recipients.join(", "),
        subject: `Cancelled: ${ev.title}`,
        body: "Cancellation sent to guests.",
        message_type: "calendar-cancel",
        status: "Sent",
        source: `calendar:${ev.id}`,
        created_at: now,
        sent_at: now,
      });
    }
  } catch {
    /* cancellation email is best-effort — never block the delete/cancel */
  }
}

export async function deleteEventAction(id: number): Promise<Result> {
  try {
    // Cancel the Google event FIRST (while we still have its id) so Google emails
    // every guest the cancellation + clears it from their calendars. Best-effort.
    let googleCancelled = false;
    const ev = await getCalendarEvent(id);
    if (ev?.googleEventId) {
      const r = await cancelGoogleEvent(ev.googleEventId);
      googleCancelled = r.ok;
    } else if (ev) {
      // Email-invited (no Google event) → send a cancellation .ics to guests.
      await emailCancellationIfSent(ev);
    }
    await deleteCalendarEvent(id);
    invalidate();
    return { ok: true, googleCancelled };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not delete event." };
  }
}

/**
 * Cancel WITHOUT deleting — keeps the row (marked cancelled) but tells Google to
 * notify guests. Useful when you want the audit trail to keep the event. Exposed
 * for callers that prefer cancel-over-delete; the calendar UI uses delete.
 */
export async function cancelEventAction(id: number): Promise<Result> {
  try {
    const ev = await getCalendarEvent(id);
    if (!ev) return { ok: false, error: "Event not found." };
    let googleCancelled = false;
    if (ev.googleEventId) {
      const r = await cancelGoogleEvent(ev.googleEventId);
      googleCancelled = r.ok;
    } else {
      await emailCancellationIfSent(ev);
    }
    await markCalendarEventCancelled(id);
    invalidate();
    return { ok: true, googleCancelled };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not cancel event." };
  }
}

/* ------------------------------------------------------------------ *
 * Owner-managed EVENT CATEGORIES (Board / Site visit / …). Add / rename
 * / merge / delete, mirroring the sites/roles reference lists. Events keep
 * their category via calendar_events.category_id; merge re-points it, delete
 * sets it null (events become uncategorised, never lost).
 * ------------------------------------------------------------------ */
type RefResult = { ok: true } | { ok: false; error: string };

export async function createEventCategory(name: string): Promise<RefResult> {
  const clean = name.trim();
  if (!clean) return { ok: false, error: "Enter a category name." };
  const { data: existing } = await sb.from("event_categories").select("id").ilike("name", clean).maybeSingle();
  if (existing) return { ok: false, error: "That category already exists." };
  const { error } = await sb.from("event_categories").insert({ name: clean });
  if (error) return { ok: false, error: error.message };
  invalidate();
  return { ok: true };
}

export async function renameEventCategory(id: number, name: string): Promise<RefResult> {
  const clean = name.trim();
  if (!clean) return { ok: false, error: "Enter a category name." };
  const { data: clash } = await sb.from("event_categories").select("id").ilike("name", clean).maybeSingle();
  if (clash && (clash.id as number) !== id) return { ok: false, error: "Another category already uses that name." };
  const { error } = await sb.from("event_categories").update({ name: clean }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  invalidate();
  return { ok: true };
}

/** Merge one category into another: re-point its events, then delete the source. */
export async function mergeEventCategories(fromId: number, intoId: number): Promise<RefResult> {
  if (fromId === intoId) return { ok: false, error: "Pick two different categories." };
  try {
    await db.transaction(async (tx) => {
      await tx.update(calendarEvents).set({ categoryId: intoId }).where(eq(calendarEvents.categoryId, fromId));
      await tx.delete(eventCategories).where(eq(eventCategories.id, fromId));
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not merge the categories." };
  }
  invalidate();
  return { ok: true };
}

/** Delete a category; its events become uncategorised (category_id → null). */
export async function deleteEventCategory(id: number): Promise<RefResult> {
  // The FK is ON DELETE SET NULL, so events are cleared automatically.
  const { error } = await sb.from("event_categories").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  invalidate();
  return { ok: true };
}

/* ------------------------------------------------------------------ *
 * Per-occurrence SKIP — cancel ONE date of a recurring series, keep the
 * rest. Stored as an EXDATE-style excluded date; guests are notified for
 * just that instance (Google instance-cancel, or a RECURRENCE-ID .ics email).
 * ------------------------------------------------------------------ */

/** The instant of a specific occurrence: the excluded date at the series' time-of-day. */
function occurrenceIso(startIso: string, dateKey: string): string {
  const start = new Date(startIso);
  const occ = new Date(`${dateKey}T00:00:00Z`);
  occ.setUTCHours(start.getUTCHours(), start.getUTCMinutes(), start.getUTCSeconds(), 0);
  return occ.toISOString();
}

/** Email guests a RECURRENCE-ID cancellation for ONE occurrence (email-invited
 *  series only; Google-invited series are handled by cancelGoogleInstance). */
async function emailInstanceCancellation(ev: CalendarEvent, dateKey: string): Promise<void> {
  try {
    if (ev.googleEventId) return;
    const recipients = ev.attendees.filter((a) => a.email).map((a) => a.email!) as string[];
    if (recipients.length === 0) return;
    const { data: sent } = await sb
      .from("outbox").select("id").eq("source", `calendar:${ev.id}`).eq("message_type", "calendar-invite").limit(1);
    if (!sent || sent.length === 0) return;

    const { emailFrom, emailFromName } = await getAppSettings();
    const occIso = occurrenceIso(ev.startAt, dateKey);
    const icsEvent = {
      ...toIcsEvent(ev, { name: emailFromName, email: emailFrom }),
      status: "cancelled" as const,
      recurrenceId: new Date(occIso),
      sequence: ev.sequence + 1,
    };
    const ics = buildIcs(icsEvent);
    const when = fmtEat(occIso, ev.allDay);
    const safeTitle = ev.title.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
    await sendEmail({
      to: recipients,
      subject: `Cancelled: ${ev.title} — ${when}`,
      html: `<p>Just this occurrence of <strong>${safeTitle}</strong> (${when}) has been <strong>cancelled</strong>. The rest of the series is unchanged.</p>`,
      text: `Just the ${when} occurrence of "${ev.title}" has been cancelled; the rest of the series is unchanged.`,
      replyTo: emailFrom,
      calendar: { content: ics, method: "CANCEL", filename: "cancel.ics" },
    });
  } catch {
    /* best-effort */
  }
}

export async function skipEventOccurrence(id: number, dateKey: string): Promise<Result> {
  try {
    const key = (dateKey ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return { ok: false, error: "Invalid date." };
    const ev = await getCalendarEvent(id);
    if (!ev) return { ok: false, error: "Event not found." };
    if (!ev.recurrence || ev.recurrence === "none") return { ok: false, error: "This isn't a recurring event." };
    if (ev.excludedDates.includes(key)) return { ok: true }; // already skipped

    await setExcludedDates(id, [...ev.excludedDates, key]);

    // Tell guests this one date is off.
    if (ev.googleEventId) {
      await cancelGoogleInstance(ev.googleEventId, occurrenceIso(ev.startAt, key)).catch(() => {});
    } else {
      await emailInstanceCancellation(ev, key);
    }
    invalidate();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not skip this date." };
  }
}

/** Undo a skip locally (restores it on OUR calendar). Note: a guest's calendar
 *  won't automatically un-cancel a date already retracted in Google — re-send the
 *  invite if you need it back on their side. */
export async function restoreEventOccurrence(id: number, dateKey: string): Promise<Result> {
  try {
    const key = (dateKey ?? "").slice(0, 10);
    const ev = await getCalendarEvent(id);
    if (!ev) return { ok: false, error: "Event not found." };
    await setExcludedDates(id, ev.excludedDates.filter((d) => d !== key));
    invalidate();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not restore this date." };
  }
}

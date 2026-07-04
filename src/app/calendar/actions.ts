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
import { senderName, type EmailOffice } from "@/lib/email/layout";
import { createTasksForEvent, shouldCreateMeetingTasks, deleteTasksForEvent } from "@/lib/meeting-tasks";
import { notifyMany, personRecipient, recipientForCreatedBy } from "@/lib/notifications";
import { sendEmail } from "@/lib/email/send";
import { getAppSettings } from "@/lib/settings";
import { cancelGoogleEvent, cancelGoogleInstance, createGoogleEvent, updateGoogleEvent } from "@/lib/google-calendar";
import { resolveEventCategoryId } from "@/lib/event-categories";
import { sb } from "@/db/supabase";
import { db } from "@/db";
import { calendarEvents, eventCategories } from "@/db/schema";
import { eq } from "drizzle-orm";

type Result =
  | { ok: true; id?: number; googleSynced?: boolean; googleCancelled?: boolean; taskCodes?: string[]; invited?: number; inviteNotConfigured?: boolean }
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

export async function createEventAction(
  fd: FormData,
  createdBy?: string,
  opts?: { autoInvite?: boolean },
): Promise<Result> {
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

    // Notify the people invited — the bell + a push ("You've been added to a
    // meeting"). This was missing, so attendees added from the command centre or
    // a portal never heard about it. Gated by the same eventAttendeePings setting
    // that governs meeting-start pings; the organiser isn't notified of their own
    // event. Best-effort — never block event creation.
    try {
      const settings = await getAppSettings();
      if (settings.eventAttendeePings) {
        const attendeeIds = [
          ...new Set(ev.attendees.map((a) => a.personId).filter((p): p is number => typeof p === "number")),
        ];
        if (attendeeIds.length) {
          const organiser = await recipientForCreatedBy(createdBy ?? null);
          const recipients = attendeeIds.map(personRecipient).filter((r) => r !== organiser);
          const when = new Date(ev.startAt).toLocaleString("en-GB", {
            weekday: "short", day: "numeric", month: "short",
            ...(ev.allDay ? {} : { hour: "2-digit", minute: "2-digit" }),
            timeZone: "Africa/Dar_es_Salaam",
          });
          const actor = createdBy ? createdBy.split(":").pop() ?? null : null;
          await notifyMany(recipients, {
            kind: "meeting",
            title: `New meeting: ${ev.title}`,
            body: ev.allDay ? `${when} · All day` : when,
            actor,
          });
        }
      }
    } catch { /* notifications are best-effort */ }

    // Auto-send the branded invitation to any guests with an email — create ==
    // invite, like a ticketing system. sendEventInviteAction also mints the Meet
    // link + mirrors to Google, so the UI's later ensureEventMeetLink is a no-op.
    // Best-effort — never block event creation; the "Send invite" button stays as
    // a manual re-send.
    let invited: number | undefined;
    let inviteNotConfigured = false;
    try {
      if (opts?.autoInvite !== false && ev.attendees.some((a) => a.email)) {
        const r = await sendEventInviteAction(ev.id);
        if (r.ok) invited = r.count;
        else if (r.reason === "not-configured") inviteNotConfigured = true;
      }
    } catch { /* invite send is best-effort */ }

    invalidate();
    return { ok: true, id: ev.id, taskCodes, invited, inviteNotConfigured };
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
    // Keep the owner's Google copy in step (silent — no guest email from Google).
    let googleSynced = false;
    if (updated.googleEventId) {
      const r = await updateGoogleEvent(updated);
      googleSynced = r.ok;
    }
    // Tell guests about the change with OUR branded "updated" email (only if an
    // invite was actually sent before — never for an unsent draft).
    const guestsNotified = await emailUpdateIfSent(updated);
    invalidate();
    return { ok: true, id, googleSynced: googleSynced || guestsNotified };
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

/** Category name for an event (for the branded email's "Type" row). */
async function eventCategoryName(categoryId: number | null): Promise<string | null> {
  if (!categoryId) return null;
  const { data } = await sb.from("event_categories").select("name").eq("id", categoryId).maybeSingle();
  return (data?.name as string) ?? null;
}

export type EventSender = {
  office: EmailOffice;
  fromName: string;
  replyTo: string;
  signoffName: string | null;
  signoffTitle: string | null;
};

/**
 * Who an event email is "from", derived from the event's `createdBy` stamp:
 *  • portal-dir:<Name> → OC Director's Office, replies to the director's own email,
 *    footer "Name / Director - <Company>";
 *  • portal-mgr:<Name> → OC Manager's Office, likewise;
 *  • everything else (web-ui / meeting-mode / ai-command) → the Command Centre,
 *    signing plainly as Oracle Consultancy, replies to the admin address.
 * Falls back to the Command Centre if the named person can't be resolved.
 */
async function resolveEventSender(createdBy: string): Promise<EventSender> {
  const { emailFrom } = await getAppSettings();
  const adminReply = emailFrom || "admin@oracle.co.tz";
  const m = /^portal-(dir|mgr):(.+)$/.exec(createdBy || "");
  if (m) {
    const office: EmailOffice = m[1] === "dir" ? "director" : "manager";
    const roleWord = office === "director" ? "Director" : "Manager";
    const name = m[2].trim();
    // ⚠️ people has 2 FKs to companies (company_id + director_company_id) — must
    // disambiguate the embed or PostgREST errors.
    const { data } = await sb
      .from("people")
      .select("name,email,companies!company_id(name,legal_name)")
      .eq("active", true)
      .eq("name", name)
      .limit(1)
      .maybeSingle();
    if (data) {
      const co = (Array.isArray(data.companies) ? data.companies[0] : data.companies) as { name?: string; legal_name?: string } | null;
      const company = co?.legal_name || co?.name || "Oracle Consultancy Ltd";
      return {
        office,
        fromName: senderName(office),
        replyTo: (data.email as string | null) || adminReply,
        signoffName: (data.name as string) || name,
        signoffTitle: `${roleWord} - ${company}`,
      };
    }
    // Named person not found — still sign as the office, reply to admin.
    return { office, fromName: senderName(office), replyTo: adminReply, signoffName: name, signoffTitle: `${roleWord} - Oracle Consultancy Ltd` };
  }
  // Command Centre (owner / automations).
  return { office: "command", fromName: senderName("command"), replyTo: adminReply, signoffName: null, signoffTitle: null };
}

/**
 * Send guests OUR branded Oracle invitation (Option A). Google is used only to
 * mint the Meet link + mirror the event on the owner's calendar — it never emails
 * the guests (sendUpdates="none"), so the guest sees our design, not Google's
 * plain template. A personalised email ("Hi <name>,") goes to each guest with the
 * calendar invitation embedded so their app still auto-adds it / offers RSVP.
 */
export async function sendEventInviteAction(id: number): Promise<SendResult> {
  const ev = await getCalendarEvent(id);
  if (!ev) return { ok: false, error: "Event not found." };

  const guests = ev.attendees.filter((a) => a.email);
  if (guests.length === 0)
    return { ok: false, error: "No attendees with an email address. Add their email first." };
  const recipients = guests.map((a) => a.email!) as string[];

  // 1. Google (silent) — mint the Meet link + put it on the owner's calendar.
  let meetLink = ev.meetLink;
  let googleOk = false;
  const g = await createGoogleEvent(ev, { requestMeet: true });
  if (g.ok) {
    googleOk = true;
    if (g.eventId) await setGoogleEventId(ev.id, g.eventId, g.meetLink && !ev.meetLink ? g.meetLink : null);
    else if (g.meetLink && !ev.meetLink) {
      await sb.from("calendar_events").update({ meet_link: g.meetLink, updated_at: new Date().toISOString() }).eq("id", ev.id);
    }
    if (g.meetLink && !ev.meetLink) meetLink = g.meetLink;
  }

  // 2. Send OUR branded email to each guest, with the .ics for auto-add / RSVP.
  const { emailFrom, emailFromName } = await getAppSettings();
  const [companyName, categoryName, sender] = await Promise.all([
    eventCompanyName(ev.companyId),
    eventCategoryName(ev.categoryId),
    resolveEventSender(ev.createdBy),
  ]);
  const evForEmail = { ...ev, meetLink };
  const ics = buildIcs(toIcsEvent(evForEmail, { name: emailFromName, email: emailFrom }));

  let sent = 0;
  let lastError: string | null = null;
  let notConfigured = false;
  for (const a of guests) {
    const mail = buildEventEmail(evForEmail, {
      kind: "invite",
      organizerName: emailFromName,
      organizerEmail: emailFrom,
      companyName,
      categoryName,
      recipientName: a.name,
      publicUrl: publicEventUrl(ev.publicToken),
      office: sender.office,
      signoffName: sender.signoffName,
      signoffTitle: sender.signoffTitle,
    });
    const r = await sendEmail({
      to: a.email!,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      fromName: sender.fromName,
      replyTo: sender.replyTo,
      calendar: { content: ics, method: "REQUEST", filename: "invite.ics" },
    });
    if (r.ok) sent++;
    else if (r.reason === "not-configured") notConfigured = true;
    else lastError = r.error ?? "Could not send the email.";
  }

  if (sent === 0) {
    if (notConfigured)
      return { ok: false, reason: "not-configured", error: "Email sending isn't switched on yet (no provider key). The invite link still works — share it manually for now." };
    return { ok: false, error: lastError ?? "Could not send the invite." };
  }

  const now = new Date().toISOString();
  await sb.from("outbox").insert({
    channel: "EMAIL",
    recipient_name: guests.map((a) => a.name).join(", "),
    recipient_contact: recipients.join(", "),
    subject: `Invitation: ${ev.title}`,
    body: `Branded invitation sent to ${sent} guest${sent === 1 ? "" : "s"}.${meetLink ? ` Meet: ${meetLink}` : ""}`,
    message_type: "calendar-invite",
    status: "Sent",
    source: `calendar:${ev.id}`,
    created_at: now,
    sent_at: now,
  });

  invalidate();
  return { ok: true, count: sent, via: googleOk ? "google" : "email", meetLink };
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
  const [companyName, categoryName, sender] = await Promise.all([
    eventCompanyName(ev.companyId),
    eventCategoryName(ev.categoryId),
    resolveEventSender(ev.createdBy),
  ]);
  const mail = buildEventEmail(ev, {
    kind,
    organizerName: emailFromName,
    organizerEmail: emailFrom,
    companyName,
    categoryName,
    // Preview reflects the recipient's greeting using the first attendee's name.
    recipientName: ev.attendees.find((a) => a.name)?.name ?? null,
    publicUrl: publicEventUrl(ev.publicToken),
    office: sender.office,
    signoffName: sender.signoffName,
    signoffTitle: sender.signoffTitle,
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
 * On cancel/delete, email the guests a METHOD:CANCEL .ics so their calendars
 * remove it — for a recurring series this retracts every occurrence (matched by
 * UID). We always send this now (Google no longer notifies guests — sendUpdates
 * "none"). Only fires when an invite was actually emailed (a prior calendar-invite
 * Outbox row exists) — never for drafts nobody received. Best-effort: never throws.
 */
async function emailCancellationIfSent(ev: CalendarEvent): Promise<void> {
  try {
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
    const [companyName, categoryName, sender] = await Promise.all([
      eventCompanyName(ev.companyId),
      eventCategoryName(ev.categoryId),
      resolveEventSender(ev.createdBy),
    ]);
    // A cancellation .ics MUST share the UID and carry a higher SEQUENCE than the
    // invite so the guest's calendar supersedes (removes) the original.
    const icsEvent = { ...toIcsEvent(ev, { name: emailFromName, email: emailFrom }), status: "cancelled" as const, sequence: ev.sequence + 1 };
    const ics = buildIcs(icsEvent);
    // Send ONE branded cancellation to everyone (no per-guest greeting needed).
    const mail = buildEventEmail(ev, {
      kind: "cancel", organizerName: emailFromName, organizerEmail: emailFrom,
      companyName, categoryName, office: sender.office, signoffName: sender.signoffName, signoffTitle: sender.signoffTitle,
    });
    const res = await sendEmail({
      to: recipients,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      fromName: sender.fromName,
      replyTo: sender.replyTo,
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

/**
 * Email guests OUR branded "updated" invitation after an edit (personalised, with
 * a bumped-SEQUENCE .ics so their calendar updates rather than duplicates). Only
 * when an invite was actually sent before. Returns true if anyone was emailed.
 * Best-effort: never throws.
 */
async function emailUpdateIfSent(ev: CalendarEvent): Promise<boolean> {
  try {
    const guests = ev.attendees.filter((a) => a.email);
    if (guests.length === 0) return false;
    const { data: sent } = await sb
      .from("outbox").select("id").eq("source", `calendar:${ev.id}`).eq("message_type", "calendar-invite").limit(1);
    if (!sent || sent.length === 0) return false; // never invited → nothing to update

    const { emailFrom, emailFromName } = await getAppSettings();
    const [companyName, categoryName, sender] = await Promise.all([
      eventCompanyName(ev.companyId),
      eventCategoryName(ev.categoryId),
      resolveEventSender(ev.createdBy),
    ]);
    const ics = buildIcs(toIcsEvent(ev, { name: emailFromName, email: emailFrom }));
    let any = false;
    for (const a of guests) {
      const mail = buildEventEmail(ev, {
        kind: "update", organizerName: emailFromName, organizerEmail: emailFrom,
        companyName, categoryName, recipientName: a.name, publicUrl: publicEventUrl(ev.publicToken),
        office: sender.office, signoffName: sender.signoffName, signoffTitle: sender.signoffTitle,
      });
      const r = await sendEmail({
        to: a.email!, subject: mail.subject, html: mail.html, text: mail.text,
        fromName: sender.fromName, replyTo: sender.replyTo, calendar: { content: ics, method: "REQUEST", filename: "invite.ics" },
      });
      if (r.ok) any = true;
    }
    return any;
  } catch {
    return false;
  }
}

export async function deleteEventAction(id: number): Promise<Result> {
  try {
    let googleCancelled = false;
    const ev = await getCalendarEvent(id);
    if (ev) {
      // Guests are emailed OUR cancellation (we own their invites now); the Google
      // event is removed from the owner's calendar too. Both best-effort.
      await emailCancellationIfSent(ev);
      if (ev.googleEventId) {
        const r = await cancelGoogleEvent(ev.googleEventId);
        googleCancelled = r.ok;
      }
    }
    // Remove the tasks this event spawned BEFORE deleting the row — the FK is
    // ON DELETE SET NULL, so once the event is gone the link is lost and the
    // tasks can no longer be found. This clears them everywhere (command centre
    // + all portals) so a deleted meeting leaves no orphaned open tasks.
    await deleteTasksForEvent(id);
    await deleteCalendarEvent(id);
    invalidate();
    return { ok: true, googleCancelled };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not delete event." };
  }
}

/**
 * Cancel WITHOUT deleting — keeps the row (marked cancelled). Guests get our
 * cancellation email; the owner's Google copy is removed too.
 */
export async function cancelEventAction(id: number): Promise<Result> {
  try {
    const ev = await getCalendarEvent(id);
    if (!ev) return { ok: false, error: "Event not found." };
    await emailCancellationIfSent(ev);
    let googleCancelled = false;
    if (ev.googleEventId) {
      const r = await cancelGoogleEvent(ev.googleEventId);
      googleCancelled = r.ok;
    }
    // A cancelled meeting has no work to do — clear its spawned tasks too so they
    // don't linger as open tasks across the command centre and portals.
    await deleteTasksForEvent(id);
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

/** Email guests a RECURRENCE-ID cancellation for ONE occurrence (we own guest
 *  comms now; the owner's Google instance is removed separately). */
async function emailInstanceCancellation(ev: CalendarEvent, dateKey: string): Promise<void> {
  try {
    const recipients = ev.attendees.filter((a) => a.email).map((a) => a.email!) as string[];
    if (recipients.length === 0) return;
    const { data: sent } = await sb
      .from("outbox").select("id").eq("source", `calendar:${ev.id}`).eq("message_type", "calendar-invite").limit(1);
    if (!sent || sent.length === 0) return;

    const { emailFrom, emailFromName } = await getAppSettings();
    const [companyName, categoryName, sender] = await Promise.all([
      eventCompanyName(ev.companyId),
      eventCategoryName(ev.categoryId),
      resolveEventSender(ev.createdBy),
    ]);
    const occIso = occurrenceIso(ev.startAt, dateKey);
    // The email speaks about THIS occurrence's date; the .ics targets it via RECURRENCE-ID.
    const evOcc = { ...ev, startAt: occIso, endAt: null };
    const icsEvent = {
      ...toIcsEvent(evOcc, { name: emailFromName, email: emailFrom }),
      status: "cancelled" as const,
      recurrenceId: new Date(occIso),
      sequence: ev.sequence + 1,
    };
    const ics = buildIcs(icsEvent);
    const mail = buildEventEmail(evOcc, {
      kind: "cancel", organizerName: emailFromName, organizerEmail: emailFrom,
      companyName, categoryName, office: sender.office, signoffName: sender.signoffName, signoffTitle: sender.signoffTitle,
    });
    await sendEmail({
      to: recipients,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      fromName: sender.fromName,
      replyTo: sender.replyTo,
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

    // Tell guests this one date is off (our branded email) + remove the instance
    // from the owner's Google calendar.
    await emailInstanceCancellation(ev, key);
    if (ev.googleEventId) {
      await cancelGoogleInstance(ev.googleEventId, occurrenceIso(ev.startAt, key)).catch(() => {});
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

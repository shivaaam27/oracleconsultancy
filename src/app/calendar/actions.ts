"use server";

import { revalidatePath } from "next/cache";
import {
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  getCalendarEvent,
  toIcsEvent,
  type CalendarAttendee,
} from "@/lib/calendar";
import { buildIcs } from "@/lib/ics";
import { sendEmail } from "@/lib/email";
import { getAppSettings } from "@/lib/settings";
import { createGoogleEvent } from "@/lib/google-calendar";
import { sb } from "@/db/supabase";

type Result = { ok: true; id?: number } | { ok: false; error: string };

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

function invalidate() {
  revalidatePath("/calendar");
}

export async function createEventAction(fd: FormData): Promise<Result> {
  const title = str(fd, "title");
  if (!title) return { ok: false, error: "Give the event a title." };
  const allDay = fd.get("allDay") === "1" || fd.get("allDay") === "on";
  const startAt = localToIso(str(fd, "startAt"), allDay);
  if (!startAt) return { ok: false, error: "Choose a start date/time." };
  const endAt = localToIso(str(fd, "endAt"), allDay);

  try {
    const ev = await createCalendarEvent({
      title,
      description: str(fd, "description"),
      location: str(fd, "location"),
      meetLink: str(fd, "meetLink"),
      companyId: numOrNull(fd, "companyId"),
      startAt,
      endAt,
      allDay,
      reminderMinutes: numOrNull(fd, "reminderMinutes"),
      attendees: parseAttendees(str(fd, "attendees")),
    });
    invalidate();
    return { ok: true, id: ev.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not create event." };
  }
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
    await updateCalendarEvent(id, {
      title,
      description: str(fd, "description"),
      location: str(fd, "location"),
      meetLink: str(fd, "meetLink"),
      companyId: numOrNull(fd, "companyId"),
      startAt,
      endAt,
      allDay,
      reminderMinutes: numOrNull(fd, "reminderMinutes"),
      attendees: parseAttendees(str(fd, "attendees")),
    });
    invalidate();
    return { ok: true, id };
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

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
    if (g.meetLink && !ev.meetLink) {
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
    invalidate();
    return { ok: true, count: recipients.length, via: "google", meetLink: g.meetLink };
  }
  // g.reason === "not-connected" → fall through to email; a real error also falls
  // back so a guest still gets the invite.

  const { emailFrom, emailFromName } = await getAppSettings();
  const icsEvent = toIcsEvent(ev, { name: emailFromName, email: emailFrom });
  const ics = buildIcs(icsEvent);

  const when = fmtEat(ev.startAt, ev.allDay);
  const rows: string[] = [`<p><strong>When:</strong> ${escapeHtml(when)}</p>`];
  if (ev.meetLink)
    rows.push(`<p><strong>Join:</strong> <a href="${escapeHtml(ev.meetLink)}">${escapeHtml(ev.meetLink)}</a></p>`);
  if (ev.location) rows.push(`<p><strong>Where:</strong> ${escapeHtml(ev.location)}</p>`);
  if (ev.description) rows.push(`<p>${escapeHtml(ev.description).replace(/\n/g, "<br>")}</p>`);

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;color:#111;line-height:1.5">
      <h2 style="margin:0 0 12px">${escapeHtml(ev.title)}</h2>
      ${rows.join("\n")}
      <p style="color:#666;font-size:13px;margin-top:16px">The calendar invite is attached — open it to add this to your calendar.</p>
    </div>`.trim();

  const textParts = [ev.title, `When: ${when}`];
  if (ev.meetLink) textParts.push(`Join: ${ev.meetLink}`);
  if (ev.location) textParts.push(`Where: ${ev.location}`);
  if (ev.description) textParts.push("", ev.description);

  const result = await sendEmail({
    to: recipients,
    subject: `Invitation: ${ev.title} — ${when}`,
    html,
    text: textParts.join("\n"),
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
    body: textParts.join("\n"),
    message_type: "calendar-invite",
    status: "Sent",
    source: `calendar:${ev.id}`,
    created_at: now,
    sent_at: now,
  });

  invalidate();
  return { ok: true, count: recipients.length, via: "email" };
}

export async function deleteEventAction(id: number): Promise<Result> {
  try {
    await deleteCalendarEvent(id);
    invalidate();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not delete event." };
  }
}

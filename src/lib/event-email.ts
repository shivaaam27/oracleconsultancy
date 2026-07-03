// Branded HTML/text builder for calendar-event emails (invites, reminders,
// follow-ups). One place so the invite, the organiser's copy and the /calendar
// preview are always identical. Pure — no DB/network — so it's safe to call from
// a server action OR a preview endpoint. Email HTML must be inline-styled and
// table-free-friendly; we keep it simple so Gmail/Outlook/Apple all render it.

import { toIcsEvent, type CalendarEvent } from "@/lib/calendar";
import { googleCalendarUrl, outlookCalendarUrl } from "@/lib/ics";
import { renderEmail, type EmailOffice } from "@/lib/email/layout";

const EAT_TZ = "Africa/Dar_es_Salaam";
const ACCENT = "#1f7aeb";
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export type EventEmailKind = "invite" | "reminder" | "followup" | "update" | "cancel";

export type EventEmailOptions = {
  kind?: EventEmailKind;
  organizerName?: string | null;
  organizerEmail?: string | null;
  companyName?: string | null;
  /** Recipient's display name — personalises the greeting ("Hi Asha,"). */
  recipientName?: string | null;
  /** Public event page (…/e/<token>) for a "View details" link. */
  publicUrl?: string | null;
  /** Category name (Board / Site visit / …) shown as a "Type" row. */
  categoryName?: string | null;
  /** Sender identity for the shared shell — masthead office + footer sign-off. */
  office?: EmailOffice;
  signoffName?: string | null;
  signoffTitle?: string | null;
};

/** "Weekly until 31 December 2026" (shown against a "Repeats" label; null for a
 *  one-off). */
function recurrenceLabel(ev: CalendarEvent): string | null {
  const r = ev.recurrence;
  if (r !== "daily" && r !== "weekly" && r !== "monthly") return null;
  const cadence = r === "daily" ? "Daily" : r === "weekly" ? "Weekly" : "Monthly";
  const until = ev.recurrenceUntil
    ? new Date(ev.recurrenceUntil).toLocaleDateString("en-GB", { timeZone: EAT_TZ, day: "numeric", month: "long", year: "numeric" })
    : null;
  return `${cadence}${until ? ` until ${until}` : ""}`;
}

/** "1 day before", "1 hour before", "at start". */
function reminderLabel(mins: number): string {
  if (mins <= 0) return "at start";
  if (mins % 1440 === 0) { const n = mins / 1440; return `${n} day${n > 1 ? "s" : ""} before`; }
  if (mins % 60 === 0) { const n = mins / 60; return `${n} hour${n > 1 ? "s" : ""} before`; }
  return `${mins} min before`;
}

export type BuiltEmail = { subject: string; html: string; text: string };

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function firstName(name?: string | null): string {
  return (name ?? "").trim().split(/\s+/)[0] ?? "";
}

function fmt(iso: string, allDay: boolean, withTime: boolean): string {
  const d = new Date(iso);
  if (allDay || !withTime) {
    return d.toLocaleDateString("en-GB", { timeZone: EAT_TZ, weekday: "short", day: "numeric", month: "long", year: "numeric" });
  }
  return d.toLocaleString("en-GB", { timeZone: EAT_TZ, weekday: "short", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function timeOnly(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { timeZone: EAT_TZ, hour: "2-digit", minute: "2-digit" });
}

/** A human "When" line: "Mon 15 June 2026, 14:00–15:00 (EAT)" or an all-day date. */
export function whenLine(ev: CalendarEvent): string {
  if (ev.allDay) return `${fmt(ev.startAt, true, false)} · all day`;
  const start = fmt(ev.startAt, false, true);
  const end = ev.endAt ? timeOnly(ev.endAt) : null;
  return `${start}${end ? `–${end}` : ""} (EAT)`;
}

/** A full-width block button for the right-hand action column. */
function blockButton(href: string, label: string, filled: boolean): string {
  const base = "display:block;text-align:center;padding:11px 16px;margin:0 0 9px;border-radius:10px;font-size:14px;font-weight:600;text-decoration:none;";
  const style = filled
    ? `${base}background:${ACCENT};color:#ffffff;`
    : `${base}background:#f2f5fa;color:#1b2a4a;border:1px solid #dde3ee;`;
  return `<a href="${esc(href)}" style="${style}">${esc(label)}</a>`;
}

function detailRow(label: string, valueHtml: string): string {
  return `<tr>
    <td style="padding:6px 12px 6px 0;color:#8a93a6;font-size:13px;white-space:nowrap;vertical-align:top">${esc(label)}</td>
    <td style="padding:6px 0;color:#1b2333;font-size:15px;vertical-align:top">${valueHtml}</td>
  </tr>`;
}

/** Build the full branded email for an event. Returns subject + HTML + plain text. */
export function buildEventEmail(ev: CalendarEvent, opts: EventEmailOptions = {}): BuiltEmail {
  const kind = opts.kind ?? "invite";
  const company = opts.companyName?.trim() || "Oracle Consultancy";
  const when = whenLine(ev);
  const ics = toIcsEvent(ev, { name: opts.organizerName, email: opts.organizerEmail });
  const googleUrl = googleCalendarUrl(ics);
  const outlookUrl = outlookCalendarUrl(ics);

  const subject =
    kind === "reminder" ? `Reminder: ${ev.title} — ${when}`
    : kind === "followup" ? `Follow-up: ${ev.title}`
    : kind === "update" ? `Updated: ${ev.title} — ${when}`
    : kind === "cancel" ? `Cancelled: ${ev.title} — ${when}`
    : `Invitation: ${ev.title} — ${when}`;

  const intro =
    kind === "reminder" ? `A friendly reminder that this is coming up:`
    : kind === "followup" ? `Thank you for joining. Here's a summary for your records:`
    : kind === "update" ? `This event has been updated — here are the new details:`
    : kind === "cancel" ? `This event has been cancelled. Please remove it from your diary:`
    : `You're invited — here are the details:`;

  const repeats = recurrenceLabel(ev);
  const reminders = ev.reminders && ev.reminders.length
    ? ev.reminders.map(reminderLabel).join(", ")
    : null;

  // --- Detail rows ---
  const rows: string[] = [detailRow("When", esc(when))];
  if (repeats) rows.push(detailRow("Repeats", esc(repeats)));
  if (opts.categoryName) rows.push(detailRow("Type", esc(opts.categoryName)));
  if (ev.meetLink) rows.push(detailRow("Join", `<a href="${esc(ev.meetLink)}" style="color:${ACCENT};font-weight:600">${esc(ev.meetLink)}</a>`));
  if (ev.location) rows.push(detailRow("Where", esc(ev.location)));
  const guests = ev.attendees.filter((a) => a.name || a.email).map((a) => a.name || a.email!).join(", ");
  if (guests) rows.push(detailRow("Guests", esc(guests)));
  if (ev.description) rows.push(detailRow("Details", esc(ev.description).replace(/\n/g, "<br>")));
  if (reminders && kind !== "followup") rows.push(detailRow("Reminders", esc(reminders)));

  // --- Right-hand action column (full-width block buttons) — none on a cancel. ---
  const showButtons = kind !== "followup" && kind !== "cancel";
  const sideButtons: string[] = [];
  if (ev.meetLink && showButtons) sideButtons.push(blockButton(ev.meetLink, "Join the meeting", true));
  if (showButtons) {
    sideButtons.push(blockButton(googleUrl, "Add to Google", false));
    sideButtons.push(blockButton(outlookUrl, "Add to Outlook", false));
  }
  if (opts.publicUrl && kind !== "cancel") sideButtons.push(blockButton(opts.publicUrl, "View details", false));
  const hasSide = sideButtons.length > 0;

  const greeting = opts.recipientName ? `<p style="margin:0 0 12px;font-size:15px;color:#1b2333;font-family:${FONT}">Hi ${esc(firstName(opts.recipientName))},</p>` : "";

  // Two columns on a wide screen (details | actions), stacking to one column on a
  // phone via the media query.
  const detailsTable = `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">${rows.join("\n")}</table>`;
  const layout = hasSide
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
        <tr>
          <td class="cos-stack" style="vertical-align:top;padding-right:28px">${detailsTable}</td>
          <td class="cos-stack cos-side" style="vertical-align:top;width:240px">${sideButtons.join("")}</td>
        </tr>
      </table>`
    : detailsTable;

  // The bespoke event body lives inside the SHARED shell (masthead office identity
  // + footer sign-off), so every email in the system shares one design language.
  const body = `
    <style>
      @media only screen and (max-width:620px){
        .cos-stack{display:block !important;width:100% !important;padding:0 !important}
        .cos-side{margin-top:20px !important}
      }
    </style>
    ${greeting}
    <p style="margin:0 0 18px;font-size:15px;color:#5b6577;font-family:${FONT}">${esc(intro)}</p>
    ${layout}
    <p style="color:#aab2c0;font-size:11px;margin:18px 0 0;font-family:${FONT}">Times shown in Dar es Salaam (EAT, UTC+3).</p>`;

  const footerNote = (kind === "invite" || kind === "update")
    ? "This message includes a calendar invitation — most apps (Gmail, Apple Calendar, Outlook) will offer to add it automatically, or use the buttons."
    : undefined;

  const html = renderEmail({
    title: ev.title,
    office: opts.office ?? "command",
    signoffName: opts.signoffName ?? opts.organizerName ?? undefined,
    signoffTitle: opts.signoffTitle ?? undefined,
    footerNote,
    wide: hasSide,
    blocks: [{ kind: "html", html: body }],
  });

  // --- Plain-text fallback ---
  const textLines: string[] = [];
  if (opts.recipientName) textLines.push(`Hi ${firstName(opts.recipientName)},`, "");
  textLines.push(ev.title, "", intro, "", `When: ${when}`);
  if (repeats) textLines.push(`Repeats: ${repeats}`);
  if (opts.categoryName) textLines.push(`Type: ${opts.categoryName}`);
  if (ev.meetLink) textLines.push(`Join: ${ev.meetLink}`);
  if (ev.location) textLines.push(`Where: ${ev.location}`);
  if (guests) textLines.push(`Guests: ${guests}`);
  if (reminders && kind !== "followup") textLines.push(`Reminders: ${reminders}`);
  if (ev.description) textLines.push("", ev.description);
  if (kind !== "followup") textLines.push("", `Add to Google: ${googleUrl}`, `Add to Outlook: ${outlookUrl}`);
  if (opts.organizerName) textLines.push("", `— ${opts.organizerName}${company ? `, ${company}` : ""}`);

  return { subject, html, text: textLines.filter((l) => l !== undefined).join("\n") };
}

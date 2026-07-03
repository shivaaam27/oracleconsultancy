// Branded HTML/text builder for calendar-event emails (invites, reminders,
// follow-ups). One place so the invite, the organiser's copy and the /calendar
// preview are always identical. Pure — no DB/network — so it's safe to call from
// a server action OR a preview endpoint. Email HTML must be inline-styled and
// table-free-friendly; we keep it simple so Gmail/Outlook/Apple all render it.

import { toIcsEvent, type CalendarEvent } from "@/lib/calendar";
import { googleCalendarUrl, outlookCalendarUrl } from "@/lib/ics";

const EAT_TZ = "Africa/Dar_es_Salaam";
const ACCENT = "#2f6bff";

export type EventEmailKind = "invite" | "reminder" | "followup";

export type EventEmailOptions = {
  kind?: EventEmailKind;
  organizerName?: string | null;
  organizerEmail?: string | null;
  companyName?: string | null;
  /** Recipient's display name — personalises the greeting ("Hi Asha,"). */
  recipientName?: string | null;
  /** Public event page (…/e/<token>) for a "View details" link. */
  publicUrl?: string | null;
};

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

function button(href: string, label: string, filled: boolean): string {
  const base = "display:inline-block;padding:9px 16px;margin:4px 6px 4px 0;border-radius:9px;font-size:14px;font-weight:600;text-decoration:none;";
  const style = filled
    ? `${base}background:${ACCENT};color:#ffffff;`
    : `${base}background:#eef1f7;color:#1b2a4a;border:1px solid #d7deea;`;
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
    : `Invitation: ${ev.title} — ${when}`;

  const intro =
    kind === "reminder" ? `A reminder that this is coming up:`
    : kind === "followup" ? `Thank you for joining. Here's a summary for your records:`
    : `You're invited to the following:`;

  // --- Detail rows ---
  const rows: string[] = [detailRow("When", esc(when))];
  if (ev.meetLink) rows.push(detailRow("Join", `<a href="${esc(ev.meetLink)}" style="color:${ACCENT};font-weight:600">${esc(ev.meetLink)}</a>`));
  if (ev.location) rows.push(detailRow("Where", esc(ev.location)));
  const guests = ev.attendees.filter((a) => a.name || a.email).map((a) => a.name || a.email!).join(", ");
  if (guests) rows.push(detailRow("Guests", esc(guests)));
  if (ev.description) rows.push(detailRow("Details", esc(ev.description).replace(/\n/g, "<br>")));

  // --- Add-to-calendar buttons ---
  const addButtons: string[] = [];
  if (ev.meetLink && kind !== "followup") addButtons.push(button(ev.meetLink, "Join the meeting", true));
  if (kind !== "followup") {
    addButtons.push(button(googleUrl, "Add to Google", false));
    addButtons.push(button(outlookUrl, "Add to Outlook", false));
  }
  if (opts.publicUrl) addButtons.push(button(opts.publicUrl, "View details", false));

  const greeting = opts.recipientName ? `<p style="margin:0 0 12px;font-size:15px;color:#1b2333">Hi ${esc(firstName(opts.recipientName))},</p>` : "";
  const signoff = opts.organizerName
    ? `<p style="margin:20px 0 0;font-size:14px;color:#5b6577">— ${esc(opts.organizerName)}${company ? `, ${esc(company)}` : ""}</p>`
    : "";
  const footNote = kind === "invite"
    ? `<p style="margin:16px 0 0;color:#9aa3b2;font-size:12px">A calendar file is attached — open it to add this to Apple Calendar or any other app. If it was sent via Google, it's already on your calendar.</p>`
    : "";

  const html = `
  <div style="margin:0;padding:0;background:#f4f6fa">
    <div style="max-width:560px;margin:0 auto;padding:24px 16px">
      <div style="background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e6eaf1">
        <div style="height:6px;background:${ACCENT}"></div>
        <div style="padding:22px 24px">
          <p style="margin:0 0 2px;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#9aa3b2;font-weight:600">${esc(company)}</p>
          <h1 style="margin:0 0 14px;font-size:21px;line-height:1.25;color:#0f1729">${esc(ev.title)}</h1>
          ${greeting}
          <p style="margin:0 0 14px;font-size:15px;color:#5b6577">${esc(intro)}</p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:0 0 8px">
            ${rows.join("\n")}
          </table>
          <div style="margin-top:16px">${addButtons.join("")}</div>
          ${signoff}
          ${footNote}
        </div>
      </div>
      <p style="text-align:center;color:#aab2c0;font-size:11px;margin:14px 0 0">Times shown in Dar es Salaam (EAT, UTC+3).</p>
    </div>
  </div>`.trim();

  // --- Plain-text fallback ---
  const textLines: string[] = [];
  if (opts.recipientName) textLines.push(`Hi ${firstName(opts.recipientName)},`, "");
  textLines.push(ev.title, "", intro, "", `When: ${when}`);
  if (ev.meetLink) textLines.push(`Join: ${ev.meetLink}`);
  if (ev.location) textLines.push(`Where: ${ev.location}`);
  if (guests) textLines.push(`Guests: ${guests}`);
  if (ev.description) textLines.push("", ev.description);
  if (kind !== "followup") textLines.push("", `Add to Google: ${googleUrl}`, `Add to Outlook: ${outlookUrl}`);
  if (opts.organizerName) textLines.push("", `— ${opts.organizerName}${company ? `, ${company}` : ""}`);

  return { subject, html, text: textLines.filter((l) => l !== undefined).join("\n") };
}

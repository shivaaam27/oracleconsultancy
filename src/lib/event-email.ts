// Branded HTML/text builder for calendar-event emails (invites, reminders,
// follow-ups). One place so the invite, the organiser's copy and the /calendar
// preview are always identical. Pure — no DB/network — so it's safe to call from
// a server action OR a preview endpoint. Email HTML must be inline-styled and
// table-free-friendly; we keep it simple so Gmail/Outlook/Apple all render it.

import { type CalendarEvent } from "@/lib/calendar";
import { renderEmail, type EmailOffice } from "@/lib/email/layout";
import { getGivenName } from "@/lib/names";

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
  /**
   * Papers travelling with the event (the ticket, the agenda). Each is listed in
   * an "Attached" row and gets a permanent link, so the recipient can open it
   * from the email months later even if their mail client strips attachments.
   */
  attachments?: EventEmailAttachment[];
  /**
   * For an "update" email: what actually changed, one line each
   * ("When: Tue 25 Aug, 10:45 → Wed 26 Aug, 14:00").
   *
   * Without this the message just re-listed the whole event and left the reader
   * to spot the difference — which is no use to someone deciding whether this
   * affects their morning.
   */
  changeLines?: string[];
};

export type EventEmailAttachment = {
  title: string;
  fileName: string | null;
  /** Permanent /e/<token>/doc/<id> link. */
  url: string;
  /** Did the file itself ride along on this message? */
  attached: boolean;
  /**
   * Not attached BECAUSE a mailbox would have bounced it — the email says so
   * plainly rather than letting the reader assume the file is there.
   *
   * Distinct from a plain `attached: false`, which is the ordinary case on a
   * reminder or an update: the guest already has the file from the invitation,
   * so those messages carry the link only and there is nothing to apologise for.
   */
  tooLarge?: boolean;
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

/** "Mr Shivam Parmar" → "Shivam". Taking the first word alone greeted people as
 *  "Hi Mr," — getGivenName skips the honorific, as the chat reminders already do. */
function firstName(name?: string | null): string {
  const raw = (name ?? "").trim();
  return raw ? getGivenName(raw) : "";
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

/**
 * A compact "when" for the SUBJECT LINE: "Tue 25 Aug, 10:45".
 *
 * A phone shows roughly 35–45 characters of a subject, and the old line spent 43
 * of them on "— Tue, 25 August 2026 at 10:45–12:15 (EAT)" — pushing the actual
 * event off the end. Everything dropped here is still in the email itself: the
 * end time, the zone, and the year (kept only when it isn't this year, because
 * then it genuinely tells you something).
 */
function whenShort(ev: CalendarEvent): string {
  const d = new Date(ev.startAt);
  const year = Number(new Intl.DateTimeFormat("en-GB", { timeZone: EAT_TZ, year: "numeric" }).format(d));
  const thisYear = Number(new Intl.DateTimeFormat("en-GB", { timeZone: EAT_TZ, year: "numeric" }).format(new Date()));
  const date = d.toLocaleDateString("en-GB", {
    timeZone: EAT_TZ, weekday: "short", day: "numeric", month: "short",
    ...(year === thisYear ? {} : { year: "numeric" }),
  });
  return ev.allDay ? date : `${date}, ${timeOnly(ev.startAt)}`;
}

/** A human "When" line: "Mon 15 June 2026, 14:00–15:00 (EAT)" or an all-day date. */
export function whenLine(ev: CalendarEvent): string {
  if (ev.allDay) return `${fmt(ev.startAt, true, false)} · all day`;
  const start = fmt(ev.startAt, false, true);
  const end = ev.endAt ? timeOnly(ev.endAt) : null;
  return `${start}${end ? `–${end}` : ""} (EAT)`;
}

/**
 * A full-width action button.
 *
 * Full width on EVERY screen, not just narrow ones. The buttons used to sit in a
 * fixed 240px column beside the details, collapsing to one column via a media
 * query — and that query never runs in Gmail, because this email is sent as an
 * HTML fragment with no <head> for a stylesheet to live in. Gmail therefore kept
 * both columns on a phone and squeezed the actual information into roughly a
 * third of the screen, so "Mon, 7 September 2026 at 10:45–12:15" broke over
 * three lines. Apple Mail is lenient and looked fine, which is why it went
 * unnoticed.
 *
 * A single column needs no stylesheet to be correct, so it renders identically
 * everywhere. Buttons are also easier to hit at full width.
 */
function blockButton(href: string, label: string, filled: boolean): string {
  const base =
    "display:block;text-align:center;padding:13px 18px;border-radius:10px;font-size:15px;font-weight:600;text-decoration:none;";
  const style = filled
    ? `${base}background:${ACCENT};color:#ffffff;`
    : `${base}background:#f4f6fa;color:#1b2a4a;border:1px solid #dde3ee;`;
  return `<tr><td style="padding:0 0 9px"><a href="${esc(href)}" style="${style}">${esc(label)}</a></td></tr>`;
}

/**
 * A detail as label ABOVE value, not beside it.
 *
 * Two columns meant the label column claimed a fixed slice and the value lived
 * in whatever was left — the thing that made these emails feel cramped. Stacked,
 * the value always has the full width of the message, so it wraps only when the
 * text genuinely needs it.
 */
function detailRow(label: string, valueHtml: string): string {
  return `<tr><td style="padding:0 0 14px">
    <div style="font-size:12px;font-weight:600;letter-spacing:0.4px;text-transform:uppercase;color:#9aa3b2;font-family:${FONT};padding-bottom:3px">${esc(label)}</div>
    <div style="font-size:15px;line-height:1.5;color:#1b2333;font-family:${FONT}">${valueHtml}</div>
  </td></tr>`;
}

/**
 * The headline answer: when it happens, big enough to read at a glance.
 * On a travel entry this is the one line that matters most, so it is given the
 * weight the old flat list never gave it.
 */
function heroWhen(ev: CalendarEvent): string {
  const dayPart = new Date(ev.startAt).toLocaleDateString("en-GB", {
    timeZone: EAT_TZ, weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  const timePart = ev.allDay
    ? "All day"
    : `${timeOnly(ev.startAt)}${ev.endAt ? ` – ${timeOnly(ev.endAt)}` : ""} (EAT)`;
  return `<tr><td style="padding:0 0 18px">
    <div style="font-size:12px;font-weight:600;letter-spacing:0.4px;text-transform:uppercase;color:#9aa3b2;font-family:${FONT};padding-bottom:5px">When</div>
    <div style="font-size:19px;font-weight:600;line-height:1.35;color:#1b2333;font-family:${FONT}">${esc(dayPart)}</div>
    <div style="font-size:17px;line-height:1.4;color:${ACCENT};font-weight:600;font-family:${FONT};padding-top:2px">${esc(timePart)}</div>
  </td></tr>`;
}

/**
 * The details block (the flight summary, an agenda) in a quiet panel.
 *
 * `white-space:pre-wrap` so the line breaks written into the description survive
 * — without it the whole block collapses into one paragraph, which is how the
 * flight details ended up as an unreadable run of text.
 */
function detailsPanel(text: string): string {
  return `<tr><td style="padding:2px 0 16px">
    <div style="border-left:3px solid #e3e8f0;padding:2px 0 2px 14px">
      <div style="font-size:12px;font-weight:600;letter-spacing:0.4px;text-transform:uppercase;color:#9aa3b2;font-family:${FONT};padding-bottom:6px">Details</div>
      <div style="font-size:15px;line-height:1.65;color:#3d4657;font-family:${FONT};white-space:pre-wrap">${esc(text)}</div>
    </div>
  </td></tr>`;
}

/** Build the full branded email for an event. Returns subject + HTML + plain text. */
export function buildEventEmail(ev: CalendarEvent, opts: EventEmailOptions = {}): BuiltEmail {
  const kind = opts.kind ?? "invite";
  const company = opts.companyName?.trim() || "Oracle Consultancy";
  const when = whenLine(ev);
  // NOTE: no add-to-calendar template URLs are built here any more — see the
  // Actions section below for why. The builders still exist in lib/ics.ts and are
  // used by the calendar board, the public event page, the meeting sheet and the
  // portal, where a one-tap "add this" genuinely is the only route.

  // A video link makes it a MEETING you're invited to; without one it's simply
  // something going in the diary — a site visit, a flight, a deadline. Calling
  // that an "invitation" reads wrongly, so the wording follows the link.
  const isMeeting = !!ev.meetLink;

  // Subject = [what changed] + the event + when. Nothing else.
  //
  // "Your upcoming event: " and "Invitation: " were 21 and 12 characters that
  // told the reader nothing they couldn't see — an invitation already announces
  // itself, both in the inbox and by Gmail's own RSVP card. The remaining
  // prefixes stay because they carry real news: this is NOT the original message.
  const shortWhen = whenShort(ev);
  const subject =
    kind === "reminder" ? `Reminder: ${ev.title} · ${shortWhen}`
    : kind === "followup" ? `Follow-up: ${ev.title}`
    : kind === "update" ? `Updated: ${ev.title} · ${shortWhen}`
    : kind === "cancel" ? `Cancelled: ${ev.title} · ${shortWhen}`
    : `${ev.title} · ${shortWhen}`;

  const intro =
    kind === "reminder" ? `A friendly reminder that this is coming up:`
    : kind === "followup" ? `Thank you for joining. Here's a summary for your records:`
    : kind === "update" ? `This event has been updated — here are the new details:`
    : kind === "cancel" ? `This event has been cancelled. Please remove it from your diary:`
    : isMeeting ? `You're invited — here are the details:`
    : `Your upcoming event — here are the details:`;

  const repeats = recurrenceLabel(ev);
  const reminders = ev.reminders && ev.reminders.length
    ? ev.reminders.map(reminderLabel).join(", ")
    : null;

  // --- The body, ordered by what someone actually needs first ---
  //
  // WHEN is the headline; then WHERE; then the supporting detail; then the
  // papers; then the housekeeping (type, repeats, guests, alarms). The old
  // version gave every one of these identical weight in a flat two-column list,
  // so the departure time of a flight looked no more important than its baggage
  // allowance.
  const rows: string[] = [];

  // What changed goes FIRST on an update — it is the only reason the message
  // exists, and burying it under the full details is how the old one read.
  const changed = opts.changeLines ?? [];
  if (kind === "update" && changed.length) {
    rows.push(`<tr><td style="padding:0 0 16px">
      <div style="border-left:3px solid ${ACCENT};background:${ACCENT}0d;border-radius:0 10px 10px 0;padding:10px 14px">
        <div style="font-size:12px;font-weight:600;letter-spacing:0.4px;text-transform:uppercase;color:${ACCENT};font-family:${FONT};padding-bottom:5px">What changed</div>
        ${changed.map((l) => `<div style="font-size:15px;line-height:1.55;color:#1b2333;font-family:${FONT}">${esc(l)}</div>`).join("")}
      </div>
    </td></tr>`);
  }

  rows.push(heroWhen(ev));

  if (ev.location) rows.push(detailRow("Where", esc(ev.location)));
  if (ev.meetLink) {
    rows.push(
      detailRow(
        "Join",
        `<a href="${esc(ev.meetLink)}" style="color:${ACCENT};font-weight:600;word-break:break-all">${esc(ev.meetLink)}</a>`
      )
    );
  }
  if (ev.description) rows.push(detailsPanel(ev.description));

  // Attached papers. Named and linked even when the file rode along, because a
  // phone mail client often hides attachments below the fold — and a ticket you
  // can't find is a ticket you don't have.
  const attachments = opts.attachments ?? [];
  if (attachments.length && kind !== "cancel") {
    const list = attachments
      .map((a) => {
        const label = a.fileName || a.title;
        const note = a.tooLarge ? `<div style="color:#8a93a6;font-size:12.5px;padding-top:1px">Too large to attach — open the link</div>` : "";
        return `<div style="padding:0 0 6px"><a href="${esc(a.url)}" style="color:${ACCENT};font-weight:600;text-decoration:none;word-break:break-word">${esc(label)}</a>${note}</div>`;
      })
      .join("");
    rows.push(detailRow(attachments.length === 1 ? "Attached" : "Attached files", list));
  }

  const guests = ev.attendees.filter((a) => a.name || a.email).map((a) => a.name || a.email!).join(", ");
  if (guests) rows.push(detailRow("Guests", esc(guests)));
  if (opts.categoryName) rows.push(detailRow("Type", esc(opts.categoryName)));
  if (repeats) rows.push(detailRow("Repeats", esc(repeats)));
  if (reminders && kind !== "followup") rows.push(detailRow("Reminders", esc(reminders)));

  // --- Actions ---
  //
  // Only ONE button survives: joining a meeting. Everything else that used to be
  // here was removed once the automatic path was verified end to end:
  //
  //  • "Add to Google" / "Add to Outlook" — the invite, update and cancellation
  //    emails all carry a real inline text/calendar entry, so the recipient's
  //    calendar files it for them. Worse, these two built a TEMPLATE url with no
  //    UID (see googleCalendarUrl): pressing one creates a SECOND, unlinked copy
  //    of an event they already have. That is how you get the same flight three
  //    times on one phone.
  //  • "View ticket" / "Open attachment" — the file is already linked in the
  //    Attached row above, so the button was the same link twice.
  //
  // The escape hatch is the quiet "View details" link under the buttons: the
  // public event page carries Add-to-Google and an .ics, for the rare guest whose
  // calendar does not file invitations automatically.
  const showButtons = kind !== "followup" && kind !== "cancel";
  const buttons: string[] = [];
  if (ev.meetLink && showButtons) buttons.push(blockButton(ev.meetLink, "Join the meeting", true));

  const greeting = opts.recipientName ? `<p style="margin:0 0 10px;font-size:15px;color:#1b2333;font-family:${FONT}">Hi ${esc(firstName(opts.recipientName))},</p>` : "";

  // ONE column. No media query, no classes, nothing that can be stripped — the
  // layout is correct at every width because there is only ever one column.
  const detailsTable = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">${rows.join("\n")}</table>`;
  const buttonTable = buttons.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;padding-top:4px">${buttons.join("")}</table>`
    : "";

  // A quiet text link, not a button — the safety net for a guest whose calendar
  // didn't file the invitation by itself. The page it opens carries
  // Add-to-Google and an .ics, so the fallback lives there rather than cluttering
  // every email with buttons almost nobody needs.
  const detailsLink =
    opts.publicUrl && kind !== "cancel"
      ? `<p style="margin:14px 0 0;font-size:13.5px;font-family:${FONT}"><a href="${esc(opts.publicUrl)}" style="color:${ACCENT};text-decoration:none">View this ${isMeeting ? "meeting" : "event"} &rsaquo;</a></p>`
      : "";

  // The bespoke event body lives inside the SHARED shell (masthead office identity
  // + footer sign-off), so every email in the system shares one design language.
  const body = `
    ${greeting}
    <p style="margin:0 0 20px;font-size:15px;line-height:1.5;color:#5b6577;font-family:${FONT}">${esc(intro)}</p>
    ${detailsTable}
    ${buttonTable}
    ${detailsLink}
    <p style="color:#aab2c0;font-size:11.5px;margin:18px 0 0;font-family:${FONT}">Times shown in Dar es Salaam (EAT, UTC+3) unless stated otherwise.</p>`;

  // No longer "or use the buttons" — there are none to use. The sentence now says
  // only what is true: the entry is in the message and the app files it.
  const footerNote = (kind === "invite" || kind === "update")
    ? `This message includes a calendar ${isMeeting ? "invitation" : "entry"}, so Gmail, Apple Calendar and Outlook add it to your diary automatically.`
    : undefined;

  const html = renderEmail({
    title: ev.title,
    office: opts.office ?? "command",
    signoffName: opts.signoffName ?? opts.organizerName ?? undefined,
    signoffTitle: opts.signoffTitle ?? undefined,
    footerNote,
    // The 760px card existed to fit the old side-by-side columns. A single
    // column reads better narrow — long lines are harder to follow — so the
    // event email uses the standard 600px card like everything else.
    wide: false,
    blocks: [{ kind: "html", html: body }],
  });

  // --- Plain-text fallback ---
  const textLines: string[] = [];
  if (opts.recipientName) textLines.push(`Hi ${firstName(opts.recipientName)},`, "");
  textLines.push(ev.title, "", intro, "");
  if (kind === "update" && changed.length) {
    textLines.push("What changed:", ...changed.map((l) => `  ${l}`), "");
  }
  textLines.push(`When: ${when}`);
  if (repeats) textLines.push(`Repeats: ${repeats}`);
  if (opts.categoryName) textLines.push(`Type: ${opts.categoryName}`);
  if (ev.meetLink) textLines.push(`Join: ${ev.meetLink}`);
  if (ev.location) textLines.push(`Where: ${ev.location}`);
  if (guests) textLines.push(`Guests: ${guests}`);
  if (reminders && kind !== "followup") textLines.push(`Reminders: ${reminders}`);
  if (ev.description) textLines.push("", ev.description);
  if (attachments.length && kind !== "cancel") {
    textLines.push("", attachments.length === 1 ? "Attached:" : "Attached files:");
    for (const a of attachments) {
      textLines.push(`  ${a.fileName || a.title}${a.tooLarge ? " (too large to attach — use the link)" : ""}`, `  ${a.url}`);
    }
  }
  // Matches the HTML: the add-to-calendar links are gone (the message carries a
  // real calendar entry, and those links made an unlinked duplicate). The public
  // page remains as the one fallback.
  if (opts.publicUrl && kind !== "cancel") textLines.push("", `View this ${isMeeting ? "meeting" : "event"}: ${opts.publicUrl}`);
  if (opts.organizerName) textLines.push("", `— ${opts.organizerName}${company ? `, ${company}` : ""}`);

  return { subject, html, text: textLines.filter((l) => l !== undefined).join("\n") };
}

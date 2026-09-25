// Branded HTML/text builder for calendar-event emails (invites, reminders,
// follow-ups). One place so the invite, the organiser's copy and the /calendar
// preview are always identical. Pure — no DB/network — so it's safe to call from
// a server action OR a preview endpoint. Email HTML must be inline-styled and
// table-free-friendly; we keep it simple so Gmail/Outlook/Apple all render it.

import { type CalendarEvent } from "@/lib/calendar";
import { renderEmail, emailButton, EMAIL_C, EMAIL_FONT, type EmailBlock, type EmailFact, type EmailOffice } from "@/lib/email/layout";
import { getGivenName } from "@/lib/names";

const EAT_TZ = "Africa/Dar_es_Salaam";

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

/** The headline answer — the day, then the time, big enough to read at a glance. */
function whenParts(ev: CalendarEvent): { day: string; time: string } {
  const day = new Date(ev.startAt).toLocaleDateString("en-GB", {
    timeZone: EAT_TZ, weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  const time = ev.allDay ? "All day" : `${timeOnly(ev.startAt)}${ev.endAt ? ` – ${timeOnly(ev.endAt)}` : ""} (EAT)`;
  return { day, time };
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
  // Everything below is the SHARED template's blocks (lib/email/layout.ts), so
  // an invitation looks like every other email the system sends (owner, 25 Sept
  // 2026: "unify all of them"). Order is what someone needs first: what changed
  // (on an update), WHEN, where, the detail, the papers, then housekeeping.
  const blocks: EmailBlock[] = [{ kind: "lead", text: intro }];

  const changed = opts.changeLines ?? [];
  if (kind === "update" && changed.length) blocks.push({ kind: "callout", label: "What changed", lines: changed, tone: "accent" });

  const w = whenParts(ev);
  blocks.push({ kind: "hero", label: "When", big: w.day, small: w.time });

  const facts: EmailFact[] = [];
  if (ev.location) facts.push({ label: "Where", text: ev.location });
  if (ev.meetLink) facts.push({ label: "Join", html: `<a class="em-link" href="${esc(ev.meetLink)}" style="color:${EMAIL_C.link};font-weight:600;word-break:break-all">${esc(ev.meetLink)}</a>` });
  if (facts.length) blocks.push({ kind: "facts", rows: facts });
  if (ev.description) blocks.push({ kind: "callout", label: "Details", lines: [ev.description], tone: "muted" });

  // Attached papers — named and linked even when the file rode along, because a
  // phone mail client often hides attachments below the fold.
  const attachments = opts.attachments ?? [];
  if (attachments.length && kind !== "cancel") {
    blocks.push({
      kind: "links",
      label: attachments.length === 1 ? "Attached" : "Attached files",
      links: attachments.map((a) => ({ label: a.fileName || a.title, url: a.url, note: a.tooLarge ? "Too large to attach — open the link" : undefined })),
    });
  }

  const guests = ev.attendees.filter((a) => a.name || a.email).map((a) => a.name || a.email!).join(", ");
  const more: EmailFact[] = [];
  if (guests) more.push({ label: "Guests", text: guests });
  if (opts.categoryName) more.push({ label: "Type", text: opts.categoryName });
  if (repeats) more.push({ label: "Repeats", text: repeats });
  if (reminders && kind !== "followup") more.push({ label: "Reminders", text: reminders });
  if (more.length) blocks.push({ kind: "facts", rows: more });

  // ONE button: joining a meeting. "Add to Google/Outlook" were removed on
  // purpose — the message carries a real calendar entry, and those template
  // links made an unlinked SECOND copy. The quiet "View this…" link is the
  // fallback: its page carries Add-to-Google and an .ics.
  const showButtons = kind !== "followup" && kind !== "cancel";
  // The button sits right after the facts, before the small print.
  if (ev.meetLink && showButtons) blocks.push({ kind: "html", html: emailButton(ev.meetLink, "Join the meeting") });
  if (opts.publicUrl && kind !== "cancel") {
    blocks.push({ kind: "html", html: `<div style="padding:12px 0 0;font-size:14px;font-family:${EMAIL_FONT}"><a class="em-link" href="${esc(opts.publicUrl)}" style="color:${EMAIL_C.link};text-decoration:none">View this ${isMeeting ? "meeting" : "event"} &rsaquo;</a></div>` });
  }
  blocks.push({ kind: "fine", text: "Times shown in Dar es Salaam (EAT, UTC+3) unless stated otherwise." });

  const footerNote = (kind === "invite" || kind === "update")
    ? `This message includes a calendar ${isMeeting ? "invitation" : "entry"}, so Gmail, Apple Calendar and Outlook add it to your diary automatically.`
    : undefined;

  const html = renderEmail({
    title: ev.title,
    subtitle: kind === "cancel" ? "Cancelled" : kind === "update" ? "Updated" : kind === "reminder" ? "Reminder" : kind === "followup" ? "Follow-up" : company,
    preheader: `${w.day} · ${w.time}${ev.location ? ` · ${ev.location}` : ""}`,
    greeting: opts.recipientName ? `Hi ${firstName(opts.recipientName)},` : undefined,
    office: opts.office ?? "command",
    signoffName: opts.signoffName ?? opts.organizerName ?? undefined,
    signoffTitle: opts.signoffTitle ?? undefined,
    footerNote,
    blocks,
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

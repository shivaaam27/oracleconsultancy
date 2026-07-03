// .ics calendar-file generator — the universal calendar format (RFC 5545) that
// every mail/calendar app understands. Attach the output to an email or serve it
// from /api/calendar/[id] and the recipient's own calendar saves the event
// automatically (the "airline ticket" behaviour). Pure, dependency-free, and
// safe to call from any server path. Also builds an "Add to Google Calendar"
// template URL for a one-tap web fallback.

export type IcsAttendee = { name: string; email?: string };

export type Recurrence = "daily" | "weekly" | "monthly";

/** Normalise a stored recurrence value to a known frequency (or null). */
export function normaliseRecurrence(recurrence?: string | null): Recurrence | null {
  return recurrence === "daily" || recurrence === "weekly" || recurrence === "monthly"
    ? recurrence
    : null;
}

/**
 * The single source of truth for "when does this recurring event next fall".
 * Both the in-app calendar grid and the exported .ics derive their occurrences
 * from this so the two can never disagree (ACTMEET-01/-02, COMPBIG-01/-02).
 *
 * Stepping rules (RFC 5545 semantics):
 *  - daily   → +1 day,  weekly → +7 days (UTC arithmetic, no DST drift here);
 *  - monthly → same day-of-month each month, CLAMPED to the last day of shorter
 *    months (a 31st event lands on the 30th/28th, it never rolls into next month).
 *
 * Anchored on the original start so the month-day never drifts across short months.
 */
function stepOccurrence(start: Date, recurrence: Recurrence, n: number): Date {
  if (recurrence === "daily") return new Date(start.getTime() + n * 86_400_000);
  if (recurrence === "weekly") return new Date(start.getTime() + n * 7 * 86_400_000);
  // monthly — clamp the day-of-month to the target month's length.
  const day = start.getUTCDate();
  const target = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + n, 1,
    start.getUTCHours(), start.getUTCMinutes(), start.getUTCSeconds(), start.getUTCMilliseconds()));
  const daysInMonth = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, daysInMonth));
  return target;
}

/** How many whole periods fit between `start` and `from` (never negative). */
function periodsBefore(start: Date, recurrence: Recurrence, from: number): number {
  if (from <= start.getTime()) return 0;
  if (recurrence === "daily") return Math.floor((from - start.getTime()) / 86_400_000);
  if (recurrence === "weekly") return Math.floor((from - start.getTime()) / (7 * 86_400_000));
  // monthly — approximate by calendar months, then settle exactly.
  const s = new Date(start);
  const f = new Date(from);
  let months = (f.getUTCFullYear() - s.getUTCFullYear()) * 12 + (f.getUTCMonth() - s.getUTCMonth());
  if (months < 0) months = 0;
  return months;
}

/**
 * Expand one recurring series into concrete occurrence start-times within
 * [windowStart, windowEnd] (inclusive). `until`, if set, is treated as the
 * INCLUSIVE last day (matching the .ics UNTIL, which is stamped at end-of-day).
 * Fast-forwards arithmetically to the window so a series that began years ago
 * never exhausts the guard before its visible occurrences (COMPBIG-01).
 */
export function expandRecurrence(opts: {
  start: Date;
  recurrence?: string | null;
  until?: Date | null;
  windowStart: number;
  windowEnd: number;
  maxOccurrences?: number;
  /** "yyyy-mm-dd" (UTC) occurrence dates to SKIP (cancelled single occurrences). */
  excluded?: string[];
}): Date[] {
  const skip = opts.excluded && opts.excluded.length ? new Set(opts.excluded) : null;
  const recurrence = normaliseRecurrence(opts.recurrence);
  const start = opts.start;
  if (!recurrence) {
    const t = start.getTime();
    if (skip && skip.has(start.toISOString().slice(0, 10))) return [];
    return t >= opts.windowStart && t <= opts.windowEnd ? [start] : [];
  }
  // Inclusive last day: anchor any `until` at end-of-day UTC, as the .ics does.
  let cap = opts.windowEnd;
  if (opts.until) {
    const u = new Date(opts.until);
    u.setUTCHours(23, 59, 59, 999);
    cap = Math.min(cap, u.getTime());
  }
  const limit = opts.maxOccurrences ?? 800;
  const out: Date[] = [];
  // Jump to the first occurrence at/after windowStart without burning the guard,
  // then step back a couple to cover any clamp/rounding under-shoot.
  let n = Math.max(0, periodsBefore(start, recurrence, opts.windowStart) - 2);
  for (let guard = 0; guard < limit; guard += 1) {
    const occ = stepOccurrence(start, recurrence, n);
    const t = occ.getTime();
    n += 1;
    if (t > cap) break;
    if (t < opts.windowStart) continue;
    if (skip && skip.has(occ.toISOString().slice(0, 10))) continue; // cancelled occurrence
    out.push(occ);
  }
  return out;
}

export type IcsEvent = {
  uid: string;
  title: string;
  description?: string | null;
  /** Physical place or a video URL shown as LOCATION. */
  location?: string | null;
  /** Canonical meeting link; appended to the description + used as URL. */
  meetLink?: string | null;
  start: Date;
  /** Defaults to start + 1h for timed events, or start + 1 day for all-day. */
  end?: Date | null;
  allDay?: boolean;
  /** Minutes before start to alarm. Omitted = no VALARM. */
  reminderMinutes?: number | null;
  /** Multiple reminders (minutes before start); takes precedence over reminderMinutes. */
  reminders?: number[] | null;
  /** "daily" | "weekly" | "monthly" — emits an RRULE so it repeats. */
  recurrence?: string | null;
  /** Inclusive last day the recurrence repeats. */
  recurrenceUntil?: Date | null;
  /** "yyyy-mm-dd" (UTC) occurrence dates to exclude from the series (EXDATE). */
  excludedDates?: string[] | null;
  /** Identifies the single occurrence this VEVENT overrides/cancels (RECURRENCE-ID).
   *  Used to cancel ONE date of a series without touching the rest. */
  recurrenceId?: Date | null;
  attendees?: IcsAttendee[];
  organizerName?: string | null;
  organizerEmail?: string | null;
  /** Bumped on edit so a re-send updates (not duplicates) the calendar entry. */
  sequence?: number;
  /** "confirmed" (default) or "cancelled" to retract a previously sent event. */
  status?: "confirmed" | "cancelled";
};

// RFC 5545 text escaping: backslash, semicolon, comma, newline.
function esc(v: string): string {
  return v
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

// UTC timestamp form: 20260615T140000Z
function dtUtc(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

// All-day date form (no time): 20260615
function dtDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

// Fold long lines at 75 octets per spec (continuation lines start with a space).
function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, 75));
  rest = rest.slice(75);
  while (rest.length > 0) {
    parts.push(" " + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  return parts.join("\r\n");
}

// Map our simple recurrence to an RFC 5545 RRULE line. UNTIL is given as a UTC
// timestamp at end-of-day so the final occurrence is included.
export function recurrenceToRrule(recurrence?: string | null, until?: Date | null): string | null {
  const r = normaliseRecurrence(recurrence);
  const freq = r === "daily" ? "DAILY" : r === "weekly" ? "WEEKLY" : r === "monthly" ? "MONTHLY" : null;
  if (!freq) return null;
  let rule = `RRULE:FREQ=${freq}`;
  if (until) {
    const u = new Date(until); u.setUTCHours(23, 59, 59, 0);
    rule += `;UNTIL=${dtUtc(u)}`;
  }
  return rule;
}

/** Build a full VCALENDAR document for a single event. */
export function buildIcs(ev: IcsEvent): string {
  const now = new Date();
  const allDay = !!ev.allDay;
  const end =
    ev.end ??
    (allDay
      ? new Date(ev.start.getTime() + 24 * 60 * 60 * 1000)
      : new Date(ev.start.getTime() + 60 * 60 * 1000));

  const descParts: string[] = [];
  if (ev.description) descParts.push(ev.description);
  if (ev.meetLink) descParts.push(`Join: ${ev.meetLink}`);
  const description = descParts.join("\n\n");

  // A cancelled event uses METHOD:CANCEL so the recipient's calendar REMOVES it
  // (matched by UID); everything else is a normal REQUEST invitation.
  const method = (ev.status ?? "confirmed") === "cancelled" ? "CANCEL" : "REQUEST";

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Oracle Consultancy//Calendar//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${method}`,
    "BEGIN:VEVENT",
    `UID:${esc(ev.uid)}`,
    `DTSTAMP:${dtUtc(now)}`,
    `SEQUENCE:${ev.sequence ?? 0}`,
    `STATUS:${(ev.status ?? "confirmed").toUpperCase()}`,
    allDay
      ? `DTSTART;VALUE=DATE:${dtDate(ev.start)}`
      : `DTSTART:${dtUtc(ev.start)}`,
    allDay ? `DTEND;VALUE=DATE:${dtDate(end)}` : `DTEND:${dtUtc(end)}`,
    `SUMMARY:${esc(ev.title)}`,
  ];

  if (description) lines.push(`DESCRIPTION:${esc(description)}`);
  if (ev.location || ev.meetLink)
    lines.push(`LOCATION:${esc(ev.location || ev.meetLink || "")}`);
  if (ev.meetLink) lines.push(`URL:${esc(ev.meetLink)}`);

  // A per-occurrence override/cancellation targets ONE instance (RECURRENCE-ID) and
  // carries no RRULE; the whole-series form emits the RRULE (+ any EXDATE skips).
  if (ev.recurrenceId) {
    lines.push(`RECURRENCE-ID:${dtUtc(ev.recurrenceId)}`);
  } else {
    const rrule = recurrenceToRrule(ev.recurrence, ev.recurrenceUntil);
    if (rrule) lines.push(rrule);
    // EXDATE must match each excluded occurrence's DTSTART: same time-of-day as the
    // series start, on the excluded date.
    for (const d of ev.excludedDates ?? []) {
      const dt = new Date(`${d}T00:00:00Z`);
      if (isNaN(dt.getTime())) continue;
      if (allDay) {
        lines.push(`EXDATE;VALUE=DATE:${dtDate(dt)}`);
      } else {
        dt.setUTCHours(ev.start.getUTCHours(), ev.start.getUTCMinutes(), ev.start.getUTCSeconds(), 0);
        lines.push(`EXDATE:${dtUtc(dt)}`);
      }
    }
  }

  if (ev.organizerEmail)
    lines.push(
      `ORGANIZER;CN=${esc(ev.organizerName || ev.organizerEmail)}:mailto:${ev.organizerEmail}`
    );

  for (const a of ev.attendees ?? []) {
    if (!a.email) continue;
    lines.push(
      `ATTENDEE;CN=${esc(a.name || a.email)};RSVP=TRUE:mailto:${a.email}`
    );
  }

  const mins = (ev.reminders && ev.reminders.length ? ev.reminders : ev.reminderMinutes != null ? [ev.reminderMinutes] : [])
    .filter((m) => m != null && m >= 0);
  for (const m of mins) {
    lines.push(
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${esc(ev.title)}`,
      `TRIGGER:-PT${Math.round(m)}M`,
      "END:VALARM"
    );
  }

  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

/**
 * "Add to Google Calendar" template URL — a one-tap web fallback for recipients
 * who'd rather click than open an attachment. Google parses these parameters and
 * pre-fills its event composer; the user just hits Save.
 */
export function googleCalendarUrl(ev: IcsEvent): string {
  const allDay = !!ev.allDay;
  const end =
    ev.end ??
    (allDay
      ? new Date(ev.start.getTime() + 24 * 60 * 60 * 1000)
      : new Date(ev.start.getTime() + 60 * 60 * 1000));

  const dates = allDay
    ? `${dtDate(ev.start)}/${dtDate(end)}`
    : `${dtUtc(ev.start)}/${dtUtc(end)}`;

  const detailsParts: string[] = [];
  if (ev.description) detailsParts.push(ev.description);
  if (ev.meetLink) detailsParts.push(`Join: ${ev.meetLink}`);

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: ev.title,
    dates,
  });
  if (detailsParts.length) params.set("details", detailsParts.join("\n\n"));
  if (ev.location || ev.meetLink)
    params.set("location", ev.location || ev.meetLink || "");

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * "Add to Outlook" deep link (Outlook.com / Microsoft 365 web) — the equivalent
 * one-tap composer for Outlook users, who can't open a Google template URL.
 */
export function outlookCalendarUrl(ev: IcsEvent): string {
  const allDay = !!ev.allDay;
  const end =
    ev.end ??
    (allDay
      ? new Date(ev.start.getTime() + 24 * 60 * 60 * 1000)
      : new Date(ev.start.getTime() + 60 * 60 * 1000));

  const bodyParts: string[] = [];
  if (ev.description) bodyParts.push(ev.description);
  if (ev.meetLink) bodyParts.push(`Join: ${ev.meetLink}`);

  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: ev.title,
    startdt: ev.start.toISOString(),
    enddt: end.toISOString(),
  });
  if (allDay) params.set("allday", "true");
  if (bodyParts.length) params.set("body", bodyParts.join("\n\n"));
  if (ev.location || ev.meetLink) params.set("location", ev.location || ev.meetLink || "");

  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}

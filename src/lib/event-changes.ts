// What actually changed when an event was edited.
//
// Two jobs, both of which the update path needed and neither of which it had:
//
//  1. **Did anything change at all?** Opening an event and pressing Save used to
//     bump the version number, re-send the whole thing to Google and email every
//     guest — for a save that altered nothing.
//  2. **What changed, in words?** The old "Updated:" email simply re-listed the
//     entire event and left the reader to spot the difference. "Moved from
//     Tue 25 Aug, 10:45 to Wed 26 Aug, 14:00" is the actual news.
//
// Pure: Intl only, no database, no network — so it can be unit-tested directly.

const EAT_TZ = "Africa/Dar_es_Salaam";

/** The fields an edit can touch. Structurally satisfied by CalendarEvent. */
export type EventSnapshot = {
  title: string;
  description: string | null;
  location: string | null;
  meetLink: string | null;
  startAt: string;
  endAt: string | null;
  allDay: boolean;
  reminders: number[];
  recurrence: string | null;
  recurrenceUntil: string | null;
  attendees: Array<{ personId?: number; name: string; email?: string }>;
  companyId: number | null;
  categoryId: number | null;
};

export type EventChange = {
  /** Machine name, for logs. */
  field: string;
  /** What a person calls it. */
  label: string;
  /** Human-readable before/after. Null when there was nothing there. */
  from: string | null;
  to: string | null;
};

export type EventDiff = {
  changes: EventChange[];
  /** True when the event actually MOVED — the one change worth interrupting
   *  someone for, and the only one that buzzes attendees in-app. */
  timeMoved: boolean;
};

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

function fmtWhen(iso: string | null, allDay: boolean): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleString("en-GB", {
    timeZone: EAT_TZ,
    weekday: "short", day: "numeric", month: "short", year: "numeric",
    ...(allDay ? {} : { hour: "2-digit", minute: "2-digit" }),
  });
}

function timeOnly(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { timeZone: EAT_TZ, hour: "2-digit", minute: "2-digit" });
}

/** The whole slot as one phrase: "Mon, 7 Sept 2026, 10:45–14:15".
 *
 *  When both ends fall on the same day the date is said ONCE — repeating it
 *  ("Mon 7 Sept, 10:45 – Mon 7 Sept, 14:15") is the sort of line a reader has to
 *  work at, and this exists precisely so they don't have to. */
function whenRange(ev: EventSnapshot): string | null {
  const start = fmtWhen(ev.startAt, ev.allDay);
  if (!start) return null;
  if (ev.allDay || !ev.endAt) return start;
  const sameDay = new Date(ev.startAt).toDateString() === new Date(ev.endAt).toDateString();
  return sameDay ? `${start}–${timeOnly(ev.endAt)}` : `${start} – ${fmtWhen(ev.endAt, false)}`;
}

/** "1 day before, 30 min before" — the same wording the invitation uses. */
function fmtReminders(mins: number[]): string | null {
  if (!mins.length) return null;
  return [...mins]
    .sort((a, b) => b - a)
    .map((m) => {
      if (m <= 0) return "at start";
      if (m % 1440 === 0) { const n = m / 1440; return `${n} day${n > 1 ? "s" : ""} before`; }
      if (m % 60 === 0) { const n = m / 60; return `${n} hour${n > 1 ? "s" : ""} before`; }
      return `${m} min before`;
    })
    .join(", ");
}

function fmtRecurrence(r: string | null, until: string | null): string | null {
  if (!r || r === "none") return null;
  const cadence = r.charAt(0).toUpperCase() + r.slice(1);
  const end = until ? fmtWhen(until, true) : null;
  return end ? `${cadence} until ${end}` : cadence;
}

function fmtGuests(list: EventSnapshot["attendees"]): string | null {
  const names = list.map((a) => a.name || a.email || "").filter(Boolean);
  return names.length ? names.join(", ") : null;
}

const text = (v: string | null): string | null => {
  const s = (v ?? "").trim();
  return s || null;
};

/** Collapse whitespace so a stray newline isn't reported as an edit. */
const norm = (v: string | null): string => (v ?? "").replace(/\s+/g, " ").trim();

/* ------------------------------------------------------------------ */
/* The diff                                                            */
/* ------------------------------------------------------------------ */

/**
 * Compare an event before and after an edit.
 *
 * Only reports things a PERSON would call a change. Reordering the guest list,
 * or re-wrapping a line in the description, is not an edit worth telling anyone
 * about — and would otherwise make "did anything change?" answer yes forever.
 */
export function diffEvent(before: EventSnapshot, next: EventSnapshot): EventDiff {
  const changes: EventChange[] = [];
  const add = (field: string, label: string, from: string | null, to: string | null) => {
    if (norm(from) !== norm(to)) changes.push({ field, label, from, to });
  };

  add("title", "Title", text(before.title), text(next.title));

  // When: start, end and all-day are ONE change to a reader — being told the
  // start moved and separately that the end moved is noise, not detail.
  add("when", "When", whenRange(before), whenRange(next));

  add("location", "Where", text(before.location), text(next.location));
  add("meetLink", "Meeting link", text(before.meetLink), text(next.meetLink));
  add("description", "Details", text(before.description), text(next.description));
  add("reminders", "Reminders", fmtReminders(before.reminders), fmtReminders(next.reminders));
  add(
    "recurrence", "Repeats",
    fmtRecurrence(before.recurrence, before.recurrenceUntil),
    fmtRecurrence(next.recurrence, next.recurrenceUntil),
  );
  add("guests", "Guests", fmtGuests(before.attendees), fmtGuests(next.attendees));

  // Company and category are filing, not something a guest is told about — but
  // they still count as a change, so a save that only re-files does save.
  if ((before.companyId ?? null) !== (next.companyId ?? null)) {
    changes.push({ field: "companyId", label: "Company", from: null, to: null });
  }
  if ((before.categoryId ?? null) !== (next.categoryId ?? null)) {
    changes.push({ field: "categoryId", label: "Type", from: null, to: null });
  }

  // Compare INSTANTS, never the strings. The database returns
  // "2026-09-07T12:15:00+00:00" while the form produces "2026-09-07T12:15:00.000Z"
  // — the same moment written two ways. A string comparison here would report a
  // reschedule on every single save and buzz every attendee.
  const ms = (v: string | null): number | null => {
    if (!v) return null;
    const t = new Date(v).getTime();
    return Number.isFinite(t) ? t : null;
  };
  const timeMoved =
    ms(before.startAt) !== ms(next.startAt) ||
    ms(before.endAt) !== ms(next.endAt) ||
    before.allDay !== next.allDay;

  return { changes, timeMoved };
}

/**
 * The change lines for the "Updated" email — only what a GUEST cares about.
 * Company and category are internal filing and are deliberately left out.
 */
export function guestFacingChanges(diff: EventDiff): EventChange[] {
  const hidden = new Set(["companyId", "categoryId"]);
  return diff.changes.filter((c) => !hidden.has(c.field));
}

/** "Moved from Tue 25 Aug, 10:45 to Wed 26 Aug, 14:00" — one line per change. */
export function changeLines(changes: EventChange[]): string[] {
  return changes.map((c) => {
    if (c.from && c.to) return `${c.label}: ${c.from} → ${c.to}`;
    if (c.to) return `${c.label}: ${c.to} (added)`;
    if (c.from) return `${c.label}: removed`;
    return `${c.label} changed`;
  });
}

// When is a calendar event OVER? — the one answer every screen uses.
//
// ⚠️ THE TWO SURFACES DISAGREED, IN OPPOSITE DIRECTIONS (owner, 17 Sep 2026):
//   • Home's "today" panel listed every event of the calendar day, so a meeting
//     that finished at nine was still sitting there at five o'clock.
//   • The portal's upcoming lists filtered on `start_at >= now`, so an event
//     DISAPPEARED THE MOMENT IT BEGAN — an hour-long meeting vanished from
//     "Next meeting" at the very minute you were walking into it.
// Both are the same missing idea: an event runs from its start to its END, and
// only then is it over. Nothing is deleted — a finished event stays in the
// calendar and on its own record, it simply stops being something still to come.
//
// CLIENT-SAFE: pure functions, no `sb`. The server halves import it too.

/** The little of an event this needs. Matches CalendarEvent's shape. */
export type EventTiming = {
  startAt: string; // ISO
  endAt: string | null; // ISO, or null when nobody set an end
  allDay: boolean;
};

/** Dar es Salaam is UTC+3 and the office works to it. An all-day event belongs
 *  to a calendar day HERE, not in UTC. */
const DAR_OFFSET_MS = 3 * 3_600_000;

/** How long an event with no end time is assumed to run. Somebody who types a
 *  start and no end still means "a meeting", and dropping it from the upcoming
 *  list the same minute it starts is what made a meeting vanish as it began.
 *  An hour is the ordinary default a calendar uses. */
export const ASSUMED_LENGTH_MS = 60 * 60_000;

/** The instant an event is over, in ms.
 *  • a timed event → its end, or an hour after its start when none was set;
 *  • an all-day event → the end of that day in Dar, so it stays all day. */
export function eventEndsAt(ev: EventTiming): number {
  const start = Date.parse(ev.startAt);
  if (Number.isNaN(start)) return 0;
  if (ev.allDay) {
    const dar = new Date(start + DAR_OFFSET_MS);
    const endOfDay = Date.UTC(dar.getUTCFullYear(), dar.getUTCMonth(), dar.getUTCDate() + 1) - DAR_OFFSET_MS;
    return endOfDay;
  }
  const end = ev.endAt ? Date.parse(ev.endAt) : NaN;
  // An end BEFORE the start is bad data; fall back rather than report an event
  // that was over before it began.
  if (!Number.isNaN(end) && end > start) return end;
  return start + ASSUMED_LENGTH_MS;
}

/** Has this event finished? Finished events drop out of "what is still to come"
 *  — they are never deleted. */
export function hasElapsed(ev: EventTiming, now: Date | number = Date.now()): boolean {
  const t = typeof now === "number" ? now : now.getTime();
  return eventEndsAt(ev) <= t;
}

/** Is it happening right now? These must keep showing — you are in the meeting. */
export function isHappeningNow(ev: EventTiming, now: Date | number = Date.now()): boolean {
  const t = typeof now === "number" ? now : now.getTime();
  const start = Date.parse(ev.startAt);
  if (Number.isNaN(start)) return false;
  return start <= t && eventEndsAt(ev) > t;
}

/** Still to come, or under way — what "upcoming" should mean everywhere. */
export function isStillToCome(ev: EventTiming, now: Date | number = Date.now()): boolean {
  return !hasElapsed(ev, now);
}

/** Split a list into what is left and what is done, keeping the given order.
 *  The finished half is what a screen shows under "Earlier today" or similar —
 *  present, but plainly over. */
export function splitByElapsed<T extends EventTiming>(
  events: T[],
  now: Date | number = Date.now(),
): { upcoming: T[]; finished: T[] } {
  const upcoming: T[] = [];
  const finished: T[] = [];
  for (const ev of events) (hasElapsed(ev, now) ? finished : upcoming).push(ev);
  return { upcoming, finished };
}

import { describe, it, expect } from "vitest";
import { dueReminders, leadPhrase } from "./event-reminders-core";
import type { CalendarEvent } from "./calendar";

const HOUR = 3600_000;
const DAY = 24 * HOUR;

/** A plain confirmed event; override only what a test cares about. */
function ev(patch: Partial<CalendarEvent> & { startAt: string }): CalendarEvent {
  return {
    id: 1,
    publicToken: "tok",
    title: "Site visit",
    description: null,
    location: null,
    meetLink: null,
    companyId: null,
    endAt: null,
    allDay: false,
    reminderMinutes: null,
    reminders: [60],
    recurrence: null,
    recurrenceUntil: null,
    attendees: [],
    source: "manual",
    meetingId: null,
    taskId: null,
    uid: "tok@cos-system",
    sequence: 0,
    status: "confirmed",
    googleEventId: null,
    categoryId: null,
    excludedDates: [],
    createdBy: "web-ui",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...patch,
  };
}

/** A 10-minute sweep ending `now`, looking 45 days ahead. */
function sweep(events: CalendarEvent[], now: number, windowMs = 10 * 60_000) {
  return dueReminders({
    events,
    windowStart: now - windowMs,
    windowEnd: now,
    now,
    lookaheadEnd: now + 45 * DAY,
  });
}

describe("dueReminders", () => {
  const now = Date.parse("2026-08-11T11:00:00.000Z");

  it("fires a 1-hour reminder in the sweep that covers it, once", () => {
    // Starts at 12:00, so the "1 hour before" reminder is due at 11:00 — inside
    // a window ending now (11:00).
    const events = [ev({ startAt: "2026-08-11T12:00:00.000Z", reminders: [60] })];
    const due = sweep(events, now);
    expect(due).toHaveLength(1);
    expect(due[0].minutes).toBe(60);
    expect(due[0].key).toBe("1:2026-08-11T12:00:00.000Z:60");
  });

  it("does not fire the same reminder again in the next sweep", () => {
    const events = [ev({ startAt: "2026-08-11T12:00:00.000Z", reminders: [60] })];
    expect(sweep(events, now)).toHaveLength(1);
    // Ten minutes later the due time (11:00) is behind windowStart.
    expect(sweep(events, now + 10 * 60_000)).toHaveLength(0);
  });

  it("fires each lead time separately", () => {
    const events = [ev({ startAt: "2026-08-11T12:00:00.000Z", reminders: [1440, 60, 10] })];
    // Only the 60-minute one is due now.
    expect(sweep(events, now).map((d) => d.minutes)).toEqual([60]);
    // The 10-minute one comes due at 11:50.
    expect(sweep(events, now + 50 * 60_000).map((d) => d.minutes)).toEqual([10]);
    // The day-before one came due yesterday at 12:00.
    expect(sweep(events, Date.parse("2026-08-10T12:00:00.000Z")).map((d) => d.minutes)).toEqual([1440]);
  });

  it("reminds about the NEXT occurrence of a weekly series, not the first", () => {
    // Started weeks ago; every Tuesday 12:00. 11 Aug 2026 is a Tuesday.
    const events = [
      ev({ id: 7, startAt: "2026-06-16T12:00:00.000Z", recurrence: "weekly", reminders: [60] }),
    ];
    const due = sweep(events, now);
    expect(due).toHaveLength(1);
    expect(due[0].occurrenceIso).toBe("2026-08-11T12:00:00.000Z");
  });

  it("skips an occurrence that was cancelled on its own", () => {
    const events = [
      ev({
        id: 7,
        startAt: "2026-06-16T12:00:00.000Z",
        recurrence: "weekly",
        reminders: [60],
        excludedDates: ["2026-08-11"],
      }),
    ];
    expect(sweep(events, now)).toHaveLength(0);
  });

  it("stops after the series' last day", () => {
    const events = [
      ev({
        startAt: "2026-06-16T12:00:00.000Z",
        recurrence: "weekly",
        reminders: [60],
        recurrenceUntil: "2026-08-04T00:00:00.000Z",
      }),
    ];
    expect(sweep(events, now)).toHaveLength(0);
  });

  it("ignores cancelled events and events with no reminder set", () => {
    const cancelled = ev({ startAt: "2026-08-11T12:00:00.000Z", status: "cancelled" });
    const noReminder = ev({ id: 2, startAt: "2026-08-11T12:00:00.000Z", reminders: [] });
    expect(sweep([cancelled, noReminder], now)).toHaveLength(0);
  });

  it("does not nag about a meeting that has already started", () => {
    // A 0-minute ("at start") reminder for something that began 40 minutes ago:
    // the catch-up window covers it, but it is past the grace period.
    const events = [ev({ startAt: "2026-08-11T10:20:00.000Z", reminders: [0] })];
    expect(sweep(events, now, 6 * HOUR)).toHaveLength(0);
  });

  it("still delivers a late reminder for a meeting that has not started", () => {
    // Sweep missed 4 hours; the 1-hour reminder for a 12:00 start was due at
    // 11:00 and the meeting is still ahead, so it goes out (late but useful).
    const events = [ev({ startAt: "2026-08-11T12:00:00.000Z", reminders: [60] })];
    const due = sweep(events, Date.parse("2026-08-11T11:30:00.000Z"), 4 * HOUR);
    expect(due).toHaveLength(1);
  });
});

describe("leadPhrase", () => {
  it("reads naturally at every scale", () => {
    expect(leadPhrase(0)).toBe("now");
    expect(leadPhrase(1)).toBe("in 1 minute");
    expect(leadPhrase(30)).toBe("in 30 minutes");
    expect(leadPhrase(60)).toBe("in 1 hour");
    expect(leadPhrase(120)).toBe("in 2 hours");
    expect(leadPhrase(1440)).toBe("tomorrow");
    expect(leadPhrase(4320)).toBe("in 3 days");
  });
});

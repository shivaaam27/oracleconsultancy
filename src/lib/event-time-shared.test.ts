import { describe, it, expect } from "vitest";
import {
  eventEndsAt, hasElapsed, isHappeningNow, isStillToCome, splitByElapsed, ASSUMED_LENGTH_MS,
} from "./event-time-shared";

/** An instant expressed as Dar es Salaam wall-clock (UTC+3). */
function dar(y: number, m: number, d: number, h: number, min = 0): string {
  return new Date(Date.UTC(y, m - 1, d, h - 3, min)).toISOString();
}

const MEETING = { startAt: dar(2026, 9, 17, 10), endAt: dar(2026, 9, 17, 11), allDay: false };

describe("hasElapsed", () => {
  it("is not over before it starts", () => {
    expect(hasElapsed(MEETING, new Date(dar(2026, 9, 17, 9)))).toBe(false);
  });

  it("IS NOT OVER WHILE IT IS RUNNING — the fault that made a meeting vanish as it began", () => {
    expect(hasElapsed(MEETING, new Date(dar(2026, 9, 17, 10)))).toBe(false);
    expect(hasElapsed(MEETING, new Date(dar(2026, 9, 17, 10, 30)))).toBe(false);
  });

  it("is over once the end has passed", () => {
    expect(hasElapsed(MEETING, new Date(dar(2026, 9, 17, 11)))).toBe(true);
    expect(hasElapsed(MEETING, new Date(dar(2026, 9, 17, 17)))).toBe(true);
  });
});

describe("an event with no end time", () => {
  const noEnd = { startAt: dar(2026, 9, 17, 10), endAt: null, allDay: false };

  it("is assumed to run an hour rather than ending the minute it starts", () => {
    expect(eventEndsAt(noEnd)).toBe(Date.parse(noEnd.startAt) + ASSUMED_LENGTH_MS);
    expect(hasElapsed(noEnd, new Date(dar(2026, 9, 17, 10, 30)))).toBe(false);
    expect(hasElapsed(noEnd, new Date(dar(2026, 9, 17, 11, 1)))).toBe(true);
  });
});

describe("an all-day event", () => {
  const allDay = { startAt: dar(2026, 9, 17, 0), endAt: null, allDay: true };

  it("lasts the whole day in Dar, not one hour", () => {
    expect(hasElapsed(allDay, new Date(dar(2026, 9, 17, 9)))).toBe(false);
    expect(hasElapsed(allDay, new Date(dar(2026, 9, 17, 23, 30)))).toBe(false);
  });

  it("is over once that day is", () => {
    expect(hasElapsed(allDay, new Date(dar(2026, 9, 18, 0, 1)))).toBe(true);
  });
});

describe("bad data", () => {
  it("does not treat an end before the start as already finished", () => {
    const backwards = { startAt: dar(2026, 9, 17, 10), endAt: dar(2026, 9, 17, 9), allDay: false };
    expect(hasElapsed(backwards, new Date(dar(2026, 9, 17, 10, 15)))).toBe(false);
  });

  it("an unreadable date is treated as over rather than shown for ever", () => {
    expect(hasElapsed({ startAt: "not a date", endAt: null, allDay: false })).toBe(true);
  });
});

describe("isHappeningNow / isStillToCome", () => {
  it("knows the meeting you are in", () => {
    expect(isHappeningNow(MEETING, new Date(dar(2026, 9, 17, 10, 5)))).toBe(true);
    expect(isHappeningNow(MEETING, new Date(dar(2026, 9, 17, 9, 55)))).toBe(false);
    expect(isHappeningNow(MEETING, new Date(dar(2026, 9, 17, 11, 5)))).toBe(false);
  });

  it("counts both 'not yet' and 'right now' as still to come", () => {
    expect(isStillToCome(MEETING, new Date(dar(2026, 9, 17, 9)))).toBe(true);
    expect(isStillToCome(MEETING, new Date(dar(2026, 9, 17, 10, 5)))).toBe(true);
    expect(isStillToCome(MEETING, new Date(dar(2026, 9, 17, 12)))).toBe(false);
  });
});

describe("splitByElapsed", () => {
  it("separates the day into what is left and what is done, keeping order", () => {
    const list = [
      { startAt: dar(2026, 9, 17, 8), endAt: dar(2026, 9, 17, 9), allDay: false, id: "early" },
      { startAt: dar(2026, 9, 17, 13), endAt: dar(2026, 9, 17, 14), allDay: false, id: "later" },
      { startAt: dar(2026, 9, 17, 11), endAt: dar(2026, 9, 17, 12), allDay: false, id: "running" },
    ];
    const { upcoming, finished } = splitByElapsed(list, new Date(dar(2026, 9, 17, 11, 30)));
    expect(upcoming.map((e) => e.id)).toEqual(["later", "running"]);
    expect(finished.map((e) => e.id)).toEqual(["early"]);
  });
});

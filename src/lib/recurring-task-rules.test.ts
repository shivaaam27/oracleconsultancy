import { describe, it, expect } from "vitest";
import {
  occursToday, shouldCreateTodaysCopy, todaysOccurrenceInstant, RECURRING_FIRES_AT_HOUR,
  buildConfig, cleanAssigneeIds, creatorLabel,
} from "./recurring-task-rules";

/** A wall-clock instant in Dar es Salaam (UTC+3) as a real Date. */
function dar(y: number, m: number, d: number, hour = 12): Date {
  return new Date(Date.UTC(y, m - 1, d, hour - 3));
}

// 16 Sep 2026 is a Wednesday; 18 Sep 2026 a Friday.
const WED = dar(2026, 9, 16);
const FRI = dar(2026, 9, 18);

describe("occursToday", () => {
  it("says yes only on a chosen weekday", () => {
    const fridays = { cadence: "weekly" as const, weekdays: [5], dayOfMonth: 1 };
    expect(occursToday(fridays, WED)).toBe(false);
    expect(occursToday(fridays, FRI)).toBe(true);
  });

  it("handles several chosen days", () => {
    const mwf = { cadence: "weekly" as const, weekdays: [1, 3, 5], dayOfMonth: 1 };
    expect(occursToday(mwf, WED)).toBe(true);
    expect(occursToday(mwf, FRI)).toBe(true);
    expect(occursToday(mwf, dar(2026, 9, 17))).toBe(false); // Thursday
  });

  it("reads the DAR day, not the UTC day", () => {
    // 01:30 on the 18th in Dar is still 22:30 on the 17th in UTC. The task
    // belongs to Friday in the office, so Friday is what must count.
    const fridays = { cadence: "weekly" as const, weekdays: [5], dayOfMonth: 1 };
    expect(occursToday(fridays, dar(2026, 9, 18, 1))).toBe(true);
    // ...and 23:30 on Thursday in Dar is Thursday, though UTC has not turned.
    expect(occursToday(fridays, dar(2026, 9, 17, 23))).toBe(false);
  });

  it("matches a day of the month", () => {
    const fifth = { cadence: "monthly" as const, weekdays: [], dayOfMonth: 5 };
    expect(occursToday(fifth, dar(2026, 9, 5))).toBe(true);
    expect(occursToday(fifth, dar(2026, 9, 6))).toBe(false);
  });

  it("clamps a 31st rule to the last day of a short month", () => {
    // The engine clamps the same way, so the two must agree or a 31st rule
    // would be 'not today' here and 'due' there.
    const last = { cadence: "monthly" as const, weekdays: [], dayOfMonth: 31 };
    expect(occursToday(last, dar(2026, 9, 30))).toBe(true); // September has 30
    expect(occursToday(last, dar(2026, 10, 30))).toBe(false); // October has 31
    expect(occursToday(last, dar(2026, 10, 31))).toBe(true);
  });
});

describe("shouldCreateTodaysCopy", () => {
  const fridays = { cadence: "weekly" as const, weekdays: [5], dayOfMonth: 1 };

  it("saves a future day without creating anything now", () => {
    expect(shouldCreateTodaysCopy(fridays, false, WED)).toBe(false);
  });

  it("creates one now when the person asks for it", () => {
    expect(shouldCreateTodaysCopy(fridays, true, WED)).toBe(true);
  });

  it("creates one when today is itself a chosen day", () => {
    expect(shouldCreateTodaysCopy(fridays, false, FRI)).toBe(true);
  });
});

describe("todaysOccurrenceInstant", () => {
  it("is 09:00 Dar on the same day, whatever the time now", () => {
    for (const hour of [0, 7, 9, 13, 23]) {
      const at = todaysOccurrenceInstant(dar(2026, 9, 18, hour));
      const shifted = new Date(at + 3 * 3_600_000);
      expect(shifted.getUTCHours()).toBe(RECURRING_FIRES_AT_HOUR);
      expect(shifted.getUTCDate()).toBe(18);
    }
  });

  it("is at or after the moment a pre-09:00 creation happened, so the job skips today", () => {
    // The engine fires when `lastFiredAt < occurrence`. Stamping this value
    // means today's occurrence is already covered and tomorrow's is not.
    const sevenAm = dar(2026, 9, 18, 7);
    expect(todaysOccurrenceInstant(sevenAm)).toBeGreaterThan(sevenAm.getTime());
  });
});

describe("buildConfig", () => {
  const base = {
    title: "Open the shop", companyId: 3, cadence: "weekly" as const,
    weekdays: [5], dayOfMonth: 1, priority: "Medium", status: "Not Started",
    description: "", assigneePersonIds: [],
  };

  it("refuses a weekly rule with no day — it could never fire", () => {
    const r = buildConfig({ ...base, weekdays: [] });
    expect(r).toHaveProperty("error");
  });

  it("refuses an empty title", () => {
    expect(buildConfig({ ...base, title: "   " })).toHaveProperty("error");
  });

  it("keeps the chosen days and drops duplicates", () => {
    const r = buildConfig({ ...base, weekdays: [5, 5, 1] });
    expect("error" in r ? null : r.weekdays).toEqual([5, 1]);
  });

  it("clamps a day of the month into range", () => {
    const r = buildConfig({ ...base, cadence: "monthly", dayOfMonth: 99 });
    expect("error" in r ? null : r.dayOfMonth).toBe(31);
  });
});

describe("cleanAssigneeIds", () => {
  it("drops rubbish and duplicates", () => {
    expect(cleanAssigneeIds([3, 3, 0, -1, 7])).toEqual([3, 7]);
    expect(cleanAssigneeIds(undefined)).toEqual([]);
  });
});

describe("creatorLabel", () => {
  it("names who set a rule up in plain words", () => {
    expect(creatorLabel("web-ui")).toBe("Administrator");
    expect(creatorLabel(null)).toBe("Administrator");
    expect(creatorLabel("portal-dir:Hrijay Solanki")).toBe("Hrijay Solanki");
    expect(creatorLabel("mcp:Owner")).toBe("Owner via Claude");
  });
});

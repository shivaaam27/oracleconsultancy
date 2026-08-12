import { describe, it, expect } from "vitest";
import { diffEvent, guestFacingChanges, changeLines, type EventSnapshot } from "./event-changes";

const base: EventSnapshot = {
  title: "Board review",
  description: "Agenda: Q3 numbers",
  location: "Head office",
  meetLink: null,
  startAt: "2026-08-25T07:45:00.000Z", // 10:45 EAT
  endAt: "2026-08-25T09:15:00.000Z",
  allDay: false,
  reminders: [1440],
  recurrence: null,
  recurrenceUntil: null,
  attendees: [{ personId: 71, name: "Mr Shivam Parmar", email: "a@b.c" }],
  companyId: 4,
  categoryId: 2,
};

const edit = (patch: Partial<EventSnapshot>): EventSnapshot => ({ ...base, ...patch });

describe("diffEvent — did anything change?", () => {
  it("reports NOTHING for an untouched save", () => {
    // Opening an event and pressing Save used to bump the version, re-push to
    // Google and email every guest. This is the guard against that.
    const d = diffEvent(base, edit({}));
    expect(d.changes).toEqual([]);
    expect(d.timeMoved).toBe(false);
  });

  it("treats the same instant written two ways as unchanged", () => {
    // The database hands back "+00:00"; the form produces ".000Z". Comparing the
    // strings would report a reschedule on every save and buzz every attendee.
    const fromDb = { ...base, startAt: "2026-08-25T07:45:00+00:00", endAt: "2026-08-25T09:15:00+00:00" };
    const fromForm = { ...base, startAt: "2026-08-25T07:45:00.000Z", endAt: "2026-08-25T09:15:00.000Z" };
    const d = diffEvent(fromDb, fromForm);
    expect(d.changes).toEqual([]);
    expect(d.timeMoved).toBe(false);
  });

  it("ignores whitespace-only edits to text", () => {
    const d = diffEvent(base, edit({ description: "Agenda:   Q3 numbers  \n" }));
    expect(d.changes).toEqual([]);
  });

  it("spots a title change", () => {
    const d = diffEvent(base, edit({ title: "Board review — final" }));
    expect(d.changes.map((c) => c.field)).toEqual(["title"]);
  });

  it("spots a description change without calling it a move", () => {
    const d = diffEvent(base, edit({ description: "Agenda: Q3 numbers and hiring" }));
    expect(d.changes.map((c) => c.field)).toEqual(["description"]);
    expect(d.timeMoved).toBe(false);
  });

  it("spots a reminder change and says it in words", () => {
    const d = diffEvent(base, edit({ reminders: [30] }));
    expect(d.changes).toHaveLength(1);
    expect(d.changes[0].from).toBe("1 day before");
    expect(d.changes[0].to).toBe("30 min before");
    expect(d.timeMoved).toBe(false);
  });
});

describe("diffEvent — a real reschedule", () => {
  it("flags timeMoved and reports one 'When' change, not two", () => {
    const d = diffEvent(base, edit({ startAt: "2026-08-26T11:00:00.000Z", endAt: "2026-08-26T12:00:00.000Z" }));
    expect(d.timeMoved).toBe(true);
    expect(d.changes.map((c) => c.field)).toEqual(["when"]);
    expect(d.changes[0].from).toContain("10:45");
    expect(d.changes[0].to).toContain("14:00");
  });

  it("treats switching to all-day as a move", () => {
    expect(diffEvent(base, edit({ allDay: true })).timeMoved).toBe(true);
  });

  it("says the date once when the event starts and ends the same day", () => {
    // "Mon 7 Sept, 10:45 – Mon 7 Sept, 14:15" is a line you have to work at.
    const d = diffEvent(base, edit({ startAt: "2026-08-25T08:00:00.000Z" }));
    expect(d.changes[0].to).toBe("Tue, 25 Aug 2026, 11:00–12:15");
    expect(d.changes[0].to!.match(/Aug/g)).toHaveLength(1);
  });

  it("keeps both dates when it spans days", () => {
    const d = diffEvent(base, edit({ endAt: "2026-08-26T09:15:00.000Z" }));
    expect(d.changes[0].to).toContain("25 Aug");
    expect(d.changes[0].to).toContain("26 Aug");
  });

  it("shows times in Dar es Salaam, not UTC", () => {
    const d = diffEvent(base, edit({ startAt: "2026-08-25T08:45:00.000Z" }));
    // 08:45 UTC is 11:45 EAT — the reader must see their own clock.
    expect(d.changes[0].to).toContain("11:45");
  });
});

describe("diffEvent — guests and repeats", () => {
  it("spots a guest being added", () => {
    const d = diffEvent(base, edit({ attendees: [...base.attendees, { personId: 13, name: "Mr Pulin Manek" }] }));
    expect(d.changes.map((c) => c.field)).toEqual(["guests"]);
    expect(d.changes[0].to).toContain("Mr Pulin Manek");
  });

  it("spots a repeat being set", () => {
    const d = diffEvent(base, edit({ recurrence: "weekly", recurrenceUntil: "2026-12-31T00:00:00.000Z" }));
    expect(d.changes.map((c) => c.field)).toEqual(["recurrence"]);
    expect(d.changes[0].to).toContain("Weekly");
  });
});

describe("guestFacingChanges", () => {
  it("keeps filing changes OUT of what a guest is told", () => {
    const d = diffEvent(base, edit({ companyId: 9, categoryId: 5 }));
    // The save is real…
    expect(d.changes.length).toBe(2);
    // …but nobody outside needs an email about which company it is filed under.
    expect(guestFacingChanges(d)).toEqual([]);
  });

  it("keeps everything a guest DOES care about", () => {
    const d = diffEvent(base, edit({ title: "New name", companyId: 9 }));
    expect(guestFacingChanges(d).map((c) => c.field)).toEqual(["title"]);
  });
});

describe("changeLines", () => {
  it("reads as news, not as a re-listing of the event", () => {
    const d = diffEvent(base, edit({ startAt: "2026-08-26T11:00:00.000Z", endAt: "2026-08-26T12:00:00.000Z" }));
    const lines = changeLines(guestFacingChanges(d));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^When: .* → .*/);
  });

  it("words an addition and a removal properly", () => {
    expect(changeLines(diffEvent(base, edit({ meetLink: "https://meet.google.com/x" })).changes)[0]).toContain("(added)");
    expect(changeLines(diffEvent(base, edit({ location: null })).changes)[0]).toContain("removed");
  });
});

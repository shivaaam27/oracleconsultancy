import { describe, it, expect } from "vitest";
import {
  isSystemDigest,
  isDailyReminder,
  notifLane,
  notifSubject,
  groupNotifications,
  notifAgo,
  recurringKey,
  recurringTitleMatch,
  type NotifRow,
} from "./notification-view";

const NOW = new Date("2026-08-03T12:00:00Z").getTime();

function row(over: Partial<NotifRow> = {}): NotifRow {
  return {
    id: 1,
    kind: "assigned",
    taskCode: "ME-023",
    threadId: null,
    requestId: null,
    title: "Mr Pulin Manek assigned you a task",
    body: "ISO Certification - Full details and execution",
    actor: "Mr Pulin Manek",
    createdAt: "2026-08-03T10:00:00Z",
    readAt: null,
    ...over,
  };
}

describe("filing", () => {
  it("treats an ORI row with no task as a digest, not an assignment", () => {
    // These are 41% of the owner's bell and were showing under Tasks.
    const digest = row({ actor: "ORI", taskCode: null, title: "11 staff quiet with open work" });
    expect(isSystemDigest(digest)).toBe(true);
    expect(notifLane(digest)).toBe("activity");
  });

  it("keeps a real ORI task action out of the digest bucket", () => {
    const acted = row({ actor: "ORI", taskCode: "ME-009", title: "ORI escalated ME-009" });
    expect(isSystemDigest(acted)).toBe(false);
  });

  it("spots the daily task reminder", () => {
    const rem = row({ kind: "chat", title: "Your tasks · Oracle Consultancy", taskCode: null });
    expect(isDailyReminder(rem)).toBe(true);
    expect(notifLane(rem)).toBe("activity");
  });

  it("puts assignments and mentions in Needs you, updates in Activity", () => {
    expect(notifLane(row({ kind: "assigned" }))).toBe("needs-you");
    expect(notifLane(row({ kind: "mention" }))).toBe("needs-you");
    expect(notifLane(row({ kind: "chat_mention" }))).toBe("needs-you");
    expect(notifLane(row({ kind: "update" }))).toBe("activity");
    expect(notifLane(row({ kind: "announcement" }))).toBe("activity");
  });
});

describe("hierarchy", () => {
  it("leads with the task, not the boilerplate sentence", () => {
    const { headline, meta } = notifSubject(row(), NOW);
    expect(headline).toBe("ISO Certification - Full details and execution");
    expect(meta).toBe("Pulin assigned you · ME-023 · 2h");
  });

  it("drops the honorific from the actor", () => {
    expect(notifSubject(row({ actor: "Mr Diptobrato Bagchi", kind: "update" }), NOW).meta).toContain("Diptobrato updated");
  });

  it("keeps a digest's own title as the headline", () => {
    const digest = row({ actor: "ORI", taskCode: null, title: "2 decisions still open", body: "D-2026-006" });
    expect(notifSubject(digest, NOW).headline).toBe("2 decisions still open");
    expect(notifSubject(digest, NOW).meta).toBe("Daily check · 2h");
  });

  it("falls back to the title when there is no body", () => {
    expect(notifSubject(row({ body: null }), NOW).headline).toBe("Mr Pulin Manek assigned you a task");
  });
});

describe("collapsing repeats", () => {
  it("folds the same update stored four times into one row", () => {
    const items = [1, 2, 3, 4].map((i) =>
      row({ id: i, kind: "update", taskCode: "DS-012", actor: "Mr Diptobrato Bagchi", createdAt: "2026-08-02T18:03:00Z" })
    );
    const groups = groupNotifications(items);
    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(4);
    expect(groups[0].unread).toBe(4);
  });

  it("keeps different tasks apart", () => {
    const groups = groupNotifications([
      row({ id: 1, kind: "update", taskCode: "DS-012" }),
      row({ id: 2, kind: "update", taskCode: "ME-016" }),
    ]);
    expect(groups).toHaveLength(2);
  });

  it("folds the daily reminder however far back it goes", () => {
    // It lands ~30 times per person, a day apart — the single biggest source of
    // noise in the portal bell.
    const items = Array.from({ length: 30 }, (_, i) =>
      row({
        id: 100 + i,
        kind: "chat",
        taskCode: null,
        title: "Your tasks · Oracle Consultancy",
        createdAt: new Date(Date.UTC(2026, 7, 3 - i, 6, 0, 0)).toISOString(),
      })
    );
    const groups = groupNotifications(items);
    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(30);
  });

  it("does not fold ordinary rows that are days apart", () => {
    const groups = groupNotifications([
      row({ id: 1, createdAt: "2026-08-03T10:00:00Z" }),
      row({ id: 2, createdAt: "2026-07-28T10:00:00Z" }),
    ]);
    expect(groups).toHaveLength(2);
  });

  it("counts unread separately from total", () => {
    const groups = groupNotifications([
      row({ id: 1, kind: "update", readAt: null }),
      row({ id: 2, kind: "update", readAt: "2026-08-03T11:00:00Z" }),
    ]);
    expect(groups[0].count).toBe(2);
    expect(groups[0].unread).toBe(1);
  });
});

describe("recurring supersede", () => {
  const digest = (title: string) => row({ actor: "ORI", taskCode: null, title });

  it("treats a digest as the same item when only the count changed", () => {
    // Otherwise every day's variant survives and the pile grows back.
    expect(recurringKey(digest("4 staff quiet with open work"))).toBe(
      recurringKey(digest("11 staff quiet with open work"))
    );
  });

  it("matches those with a LIKE so the older row is found", () => {
    expect(recurringTitleMatch(digest("4 staff quiet with open work"))).toEqual({
      op: "like",
      value: "%staff quiet with open work",
    });
  });

  it("uses an exact match when the title has no count", () => {
    const rem = row({ kind: "chat", taskCode: null, title: "Your tasks · Oracle Consultancy" });
    expect(recurringTitleMatch(rem)).toEqual({ op: "eq", value: "Your tasks · Oracle Consultancy" });
  });

  it("keeps genuinely different digests apart", () => {
    expect(recurringKey(digest("2 decisions still open"))).not.toBe(
      recurringKey(digest("4 staff quiet with open work"))
    );
  });

  it("ignores non-recurring rows", () => {
    expect(recurringKey(row())).toBeNull();
    expect(recurringTitleMatch(row())).toBeNull();
  });
});

describe("relative time", () => {
  it("reads compactly", () => {
    expect(notifAgo("2026-08-03T11:59:30Z", NOW)).toBe("just now");
    expect(notifAgo("2026-08-03T11:30:00Z", NOW)).toBe("30m");
    expect(notifAgo("2026-08-03T09:00:00Z", NOW)).toBe("3h");
    expect(notifAgo("2026-08-01T12:00:00Z", NOW)).toBe("2d");
    expect(notifAgo("2026-07-13T12:00:00Z", NOW)).toBe("3w");
  });
});

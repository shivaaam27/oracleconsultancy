import { describe, it, expect } from "vitest";
import {
  commentBlockers, darDay, darTime, eventTone, groupByDay, subjectHref,
  type CzEvent,
} from "./cocozuri-events-shared";

const ev = (over: Partial<CzEvent> = {}): CzEvent => ({
  id: 1, subjectType: "batch", subjectId: 5, subjectRef: "BATCH-2608-01",
  kind: "created", summary: "Opened.", detail: null, by: "web-ui",
  at: "2026-08-27T09:00:00.000Z",
  ...over,
});

describe("the day something happened", () => {
  it("⚠️ groups in DAR ES SALAAM'S day, not UTC", () => {
    // Everything is stamped timestamptz. Anything before 3am would otherwise be
    // filed under yesterday — the same trap `todayInDar` exists for.
    expect(darDay("2026-08-27T00:30:00.000Z")).toBe("2026-08-27");
    expect(darDay("2026-08-26T22:30:00.000Z")).toBe("2026-08-27");
    expect(darDay("2026-08-26T20:30:00.000Z")).toBe("2026-08-26");
  });

  it("shows the clock time in Dar", () => {
    expect(darTime("2026-08-26T22:30:00.000Z")).toBe("01:30");
  });

  it("puts the newest day first and keeps each day's events together", () => {
    const days = groupByDay([
      ev({ id: 1, at: "2026-08-25T09:00:00.000Z" }),
      ev({ id: 2, at: "2026-08-27T09:00:00.000Z" }),
      ev({ id: 3, at: "2026-08-27T14:00:00.000Z" }),
    ]);
    expect(days.map((d) => d.day)).toEqual(["2026-08-27", "2026-08-25"]);
    expect(days[0]!.events).toHaveLength(2);
  });

  it("handles a day that straddles midnight in Dar", () => {
    const days = groupByDay([
      ev({ id: 1, at: "2026-08-26T21:00:00.000Z" }),  // 00:00 on the 27th in Dar
      ev({ id: 2, at: "2026-08-27T06:00:00.000Z" }),
    ]);
    expect(days).toHaveLength(1);
    expect(days[0]!.day).toBe("2026-08-27");
  });
});

describe("how an event reads", () => {
  it("⚠️ marks only what UNDOES something, and a note", () => {
    // A screen where everything is coloured is one where nothing stands out.
    expect(eventTone("cancelled")).toBe("undo");
    expect(eventTone("deleted")).toBe("undo");
    expect(eventTone("unposted")).toBe("undo");
    expect(eventTone("reopened")).toBe("undo");
    expect(eventTone("comment")).toBe("note");
    expect(eventTone("created")).toBe("plain");
    expect(eventTone("issued")).toBe("plain");
  });

  it("points a batch at its own record, by reference", () => {
    expect(subjectHref(ev())).toBe("/cocozuri/batches/BATCH-2608-01");
  });

  it("falls back to the list when there is no reference", () => {
    expect(subjectHref(ev({ subjectRef: null }))).toBe("/cocozuri/batches");
  });

  it("has nowhere to send something that belongs to no record", () => {
    expect(subjectHref(ev({ subjectType: "module", subjectRef: null }))).toBeNull();
  });
});

describe("a note", () => {
  it("⚠️ must say something, because it can never be removed", () => {
    // Events are append-only — an empty note is a row nobody can tidy away.
    expect(commentBlockers("   ")[0]).toBe("Write something first.");
    expect(commentBlockers("The delivery was short.")).toEqual([]);
  });

  it("refuses one longer than a note should be", () => {
    expect(commentBlockers("x".repeat(4001))[0]).toContain("longer than a note");
  });
});

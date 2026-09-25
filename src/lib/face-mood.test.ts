import { describe, expect, it } from "vitest";
import { moodFor, faceKey, type FaceStats } from "./face-mood";

const base: FaceStats = { open: 4, overdue: 0, dueSoon: 0, inProgress: 2, doneThisMonth: 0, inMeeting: false };

describe("moodFor", () => {
  it("is overburdened before anything else", () => {
    expect(moodFor({ ...base, open: 14, overdue: 4, inMeeting: true })).toBe("sick");
  });
  it("is sad when three or more are late", () => {
    expect(moodFor({ ...base, overdue: 3 })).toBe("sad");
  });
  it("shows a meeting over a small lateness", () => {
    expect(moodFor({ ...base, overdue: 1, inMeeting: true })).toBe("thinking");
  });
  it("is unsure with one or two late", () => {
    expect(moodFor({ ...base, overdue: 1 })).toBe("unsure");
  });
  it("is surprised when something is due soon", () => {
    expect(moodFor({ ...base, dueSoon: 2 })).toBe("surprised");
  });
  it("loves a big month and is happy with a good one", () => {
    expect(moodFor({ ...base, doneThisMonth: 12 })).toBe("love");
    expect(moodFor({ ...base, doneThisMonth: 4 })).toBe("happy");
  });
  it("is sleepy with nothing open", () => {
    expect(moodFor({ ...base, open: 0, inProgress: 0 })).toBe("sleepy");
  });
  it("is calm otherwise", () => {
    expect(moodFor(base)).toBe("idle");
  });
});

describe("faceKey", () => {
  it("matches a name however it is spaced or cased", () => {
    expect(faceKey("  Mr Jitesh Solanki ")).toBe("mr jitesh solanki");
  });
});

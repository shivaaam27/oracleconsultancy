import { describe, it, expect } from "vitest";
import { nextOccurrences } from "./recurring-task-rules";

// Thu 24 Sept 2026, 07:00 in Dar (04:00 UTC).
const NOW = new Date("2026-09-24T04:00:00Z");

describe("nextOccurrences", () => {
  it("lists weekly days from today on", () => {
    expect(nextOccurrences({ cadence: "weekly", weekdays: [1, 4], dayOfMonth: null }, 3, NOW))
      .toEqual(["2026-09-24", "2026-09-28", "2026-10-01"]);
  });
  it("skips today once today's copy is made", () => {
    expect(nextOccurrences({ cadence: "weekly", weekdays: [4], dayOfMonth: null, lastFiredAt: "2026-09-24T06:00:00Z" }, 1, NOW))
      .toEqual(["2026-10-01"]);
  });
  it("clamps a 31st to the end of a short month", () => {
    expect(nextOccurrences({ cadence: "monthly", weekdays: [], dayOfMonth: 31 }, 2, NOW))
      .toEqual(["2026-09-30", "2026-10-31"]);
  });
  it("a paused rule has none", () => {
    expect(nextOccurrences({ cadence: "weekly", weekdays: [1], dayOfMonth: null, paused: true }, 3, NOW)).toEqual([]);
  });
});

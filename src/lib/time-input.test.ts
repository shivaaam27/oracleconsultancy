import { describe, it, expect } from "vitest";
import { parseTimeInput, formatTimeLabel, timeSuggestions, allTimeOptions } from "./time-input";

describe("parseTimeInput", () => {
  it("takes a 24-hour time", () => {
    expect(parseTimeInput("14:30")).toBe("14:30");
    expect(parseTimeInput("09:05")).toBe("09:05");
    expect(parseTimeInput("00:00")).toBe("00:00");
    expect(parseTimeInput("23:59")).toBe("23:59");
  });

  it("takes it without the colon, the way people actually type", () => {
    expect(parseTimeInput("1430")).toBe("14:30");
    expect(parseTimeInput("930")).toBe("09:30");
    expect(parseTimeInput("0905")).toBe("09:05");
  });

  it("takes am/pm in its various forms", () => {
    expect(parseTimeInput("2:30pm")).toBe("14:30");
    expect(parseTimeInput("2:30 PM")).toBe("14:30");
    expect(parseTimeInput("2.30 p.m.")).toBe("14:30");
    expect(parseTimeInput("230pm")).toBe("14:30");
    expect(parseTimeInput("9am")).toBe("09:00");
  });

  it("handles the midnight/noon corners that catch everyone out", () => {
    expect(parseTimeInput("12am")).toBe("00:00");
    expect(parseTimeInput("12pm")).toBe("12:00");
    expect(parseTimeInput("12:30am")).toBe("00:30");
    expect(parseTimeInput("12:30pm")).toBe("12:30");
  });

  it("takes a bare hour", () => {
    expect(parseTimeInput("9")).toBe("09:00");
    expect(parseTimeInput("09")).toBe("09:00");
    expect(parseTimeInput("17")).toBe("17:00");
  });

  it("accepts the separators a keyboard makes easy", () => {
    expect(parseTimeInput("14.30")).toBe("14:30");
    expect(parseTimeInput("14h30")).toBe("14:30");
    expect(parseTimeInput(" 14:30 ")).toBe("14:30");
  });

  it("REFUSES an out-of-range time rather than clamping it", () => {
    // Clamping "25:00" to 23:59 would put the event at a time nobody chose.
    expect(parseTimeInput("25:00")).toBeNull();
    expect(parseTimeInput("14:75")).toBeNull();
    expect(parseTimeInput("13pm")).toBeNull();
    expect(parseTimeInput("0am")).toBeNull();
  });

  it("returns null for anything that isn't a time", () => {
    expect(parseTimeInput("")).toBeNull();
    expect(parseTimeInput(null)).toBeNull();
    expect(parseTimeInput("lunch")).toBeNull();
    expect(parseTimeInput("--")).toBeNull();
  });
});

describe("formatTimeLabel", () => {
  it("shows a 12-hour label for a 24-hour value", () => {
    expect(formatTimeLabel("14:30")).toBe("2:30 PM");
    expect(formatTimeLabel("00:00")).toBe("12:00 AM");
    expect(formatTimeLabel("12:00")).toBe("12:00 PM");
    expect(formatTimeLabel("09:05")).toBe("9:05 AM");
  });

  it("is blank for a non-time", () => {
    expect(formatTimeLabel("nope")).toBe("");
    expect(formatTimeLabel(null)).toBe("");
  });
});

describe("allTimeOptions", () => {
  it("covers the day in quarter hours", () => {
    const all = allTimeOptions();
    expect(all).toHaveLength(96);
    expect(all[0].value).toBe("00:00");
    expect(all.at(-1)!.value).toBe("23:45");
  });
});

describe("timeSuggestions", () => {
  it("starts AROUND the current time, not at midnight", () => {
    // The old dropdown always opened at 00:00, leaving the selected time
    // 1,446px down the list and off screen. This is the fix.
    const s = timeSuggestions("", "10:00");
    expect(s.some((o) => o.value === "10:00")).toBe(true);
    expect(s[0].value).not.toBe("00:00");
  });

  it("narrows as you type", () => {
    const s = timeSuggestions("14", null);
    expect(s.every((o) => o.value.startsWith("14") || o.label.toLowerCase().startsWith("14"))).toBe(true);
  });

  it("puts an exactly-typed time first, even off the quarter hour", () => {
    const s = timeSuggestions("10:47", null);
    expect(s[0].value).toBe("10:47");
  });

  it("matches the 12-hour label people read", () => {
    const s = timeSuggestions("2:30 pm", null);
    expect(s[0].value).toBe("14:30");
  });

  it("never floods the list", () => {
    expect(timeSuggestions("", "10:00").length).toBeLessThanOrEqual(8);
    expect(timeSuggestions("1", null).length).toBeLessThanOrEqual(8);
  });
});

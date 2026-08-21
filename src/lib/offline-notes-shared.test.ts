import { describe, it, expect } from "vitest";
import { textToDoc, titleFromText, isIsoDate, MAX_TITLE } from "./offline-notes-shared";

/* This is what happens to writing done with no connection. If it is wrong, the
 * owner's words come back changed — which is worse than not saving them at all,
 * because nothing announces it. */

describe("a note written offline becomes a real note", () => {
  it("keeps every line as its own paragraph", () => {
    const doc = textToDoc("Call the bank\nAsk about the transfer");
    expect(doc.content).toHaveLength(2);
    expect(doc.content[0].content?.[0].text).toBe("Call the bank");
    expect(doc.content[1].content?.[0].text).toBe("Ask about the transfer");
  });

  it("keeps blank lines, because the paragraph breaks ARE the writing", () => {
    const doc = textToDoc("First thought\n\nSecond thought");
    expect(doc.content).toHaveLength(3);
    expect(doc.content[1].content).toBeUndefined(); // the empty line survives
  });

  it("does not lose leading or trailing spaces inside a line", () => {
    const doc = textToDoc("  indented note");
    expect(doc.content[0].content?.[0].text).toBe("  indented note");
  });

  it("handles Windows line endings", () => {
    const doc = textToDoc("one\r\ntwo");
    expect(doc.content).toHaveLength(2);
    expect(doc.content[1].content?.[0].text).toBe("two");
  });

  it("survives an empty note without crashing", () => {
    expect(textToDoc("").content).toHaveLength(1);
    expect(titleFromText("")).toBe("");
  });
});

describe("the note names itself", () => {
  it("uses the first line that has something on it", () => {
    expect(titleFromText("\n\n  Bank transfer  \nrest of it")).toBe("Bank transfer");
  });

  it("does not run away with a very long first line", () => {
    expect(titleFromText("x".repeat(500)).length).toBe(MAX_TITLE);
  });

  it("is empty when there is nothing but blank lines", () => {
    expect(titleFromText("\n \n\t\n")).toBe("");
  });
});

describe("the device's clock is trusted, but checked", () => {
  it("accepts a real timestamp", () => {
    expect(isIsoDate("2026-08-21T09:15:00.000Z")).toBe(true);
  });

  it("rejects nonsense", () => {
    expect(isIsoDate("yesterday")).toBe(false);
    expect(isIsoDate("")).toBe(false);
    expect(isIsoDate(1234567890)).toBe(false);
    expect(isIsoDate(null)).toBe(false);
  });
});

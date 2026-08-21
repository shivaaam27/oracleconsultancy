import { describe, it, expect } from "vitest";
import { textToDoc, titleFromText, isIsoDate, MAX_TITLE, docText, docIsPlain, appendToDoc, blockMovePlan } from "./offline-notes-shared";

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

/* ------------------------------------------------------------------ *
 * Stages 2 and 3 — reading and adding to a note that already exists.
 *
 * These decide whether the owner's existing writing survives contact with a
 * device that was offline. `docIsPlain` in particular is a safety catch: get it
 * wrong in the permissive direction and a plain-text box quietly eats a table.
 * ------------------------------------------------------------------ */

const para = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
const doc = (...content: unknown[]) => ({ type: "doc", content });

describe("reading a note back as text", () => {
  it("puts one block on one line", () => {
    expect(docText(doc(para("First"), para("Second")))).toBe("First\nSecond");
  });

  it("reads a heading and a list, not just paragraphs", () => {
    const d = doc(
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Permits" }] },
      {
        type: "bulletList",
        content: [{ type: "listItem", content: [para("Interim pass")] }],
      }
    );
    expect(docText(d)).toBe("Permits\nInterim pass");
  });

  it("reads the words out of a table", () => {
    const cell = (t: string) => ({ type: "tableCell", content: [para(t)] });
    const d = doc({ type: "table", content: [{ type: "tableRow", content: [cell("Fee"), cell("600")] }] });
    expect(docText(d)).toBe("Fee\n600");
  });

  it("says nothing at all for an empty document", () => {
    expect(docText(doc())).toBe("");
    expect(docText(null)).toBe("");
    expect(docText(undefined)).toBe("");
  });
});

describe("deciding whether plain text can carry a note back", () => {
  it("says yes to plain paragraphs", () => {
    expect(docIsPlain(doc(para("Call the bank"), { type: "paragraph" }))).toBe(true);
  });

  it("says NO to a table — this is the one that matters", () => {
    const d = doc(para("Costs"), { type: "table", content: [] });
    expect(docIsPlain(d)).toBe(false);
  });

  it("says no to a picture, a heading, a list and a tick-box", () => {
    expect(docIsPlain(doc({ type: "image", attrs: { src: "/x" } }))).toBe(false);
    expect(docIsPlain(doc({ type: "heading", attrs: { level: 1 } }))).toBe(false);
    expect(docIsPlain(doc({ type: "bulletList", content: [] }))).toBe(false);
    expect(docIsPlain(doc({ type: "taskList", content: [] }))).toBe(false);
  });

  it("says no when text is BOLD — formatting is writing too", () => {
    const bold = { type: "paragraph", content: [{ type: "text", text: "Urgent", marks: [{ type: "bold" }] }] };
    expect(docIsPlain(doc(bold))).toBe(false);
  });

  it("says no to a mention, which would come back as bare words", () => {
    const m = { type: "paragraph", content: [{ type: "mention", attrs: { label: "Sulleiman" } }] };
    expect(docIsPlain(doc(m))).toBe(false);
  });

  it("says no to anything that is not a document", () => {
    expect(docIsPlain(null)).toBe(false);
    expect(docIsPlain({ type: "paragraph" })).toBe(false);
  });
});

describe("adding to the end of a note", () => {
  it("leaves everything above it exactly as it was", () => {
    const before = doc(para("Original thought"));
    const after = appendToDoc(before, "A later thought");
    expect(after.content[0]).toEqual(para("Original thought"));
    expect(after.content.at(-1)).toEqual(para("A later thought"));
  });

  it("cannot damage a table, because it never touches one", () => {
    const table = { type: "table", content: [{ type: "tableRow", content: [] }] };
    const after = appendToDoc(doc(table), "Seen at the port");
    expect(after.content[0]).toEqual(table);
    expect(docText(after).endsWith("Seen at the port")).toBe(true);
  });

  it("puts a blank line between the old and the new", () => {
    const after = appendToDoc(doc(para("One")), "Two");
    expect(after.content).toHaveLength(3);
    expect(after.content[1]).toEqual({ type: "paragraph" });
  });

  it("does not add a second blank line when the note already ends in one", () => {
    const after = appendToDoc(doc(para("One"), { type: "paragraph" }), "Two");
    expect(after.content).toHaveLength(3);
  });

  it("appends to an empty note without a leading blank line", () => {
    const after = appendToDoc(doc(), "First thing");
    expect(after.content).toEqual([para("First thing")]);
  });

  it("survives a note with no body at all", () => {
    expect(appendToDoc(null, "Something").content).toEqual([para("Something")]);
  });

  it("gives the same note whichever order two additions arrive in", () => {
    // ⚠️ THIS IS WHY AN APPEND CANNOT CONFLICT. Two devices, both offline, both
    // adding — either order ends up with the same note, so there is nothing to
    // merge and nothing to choose between.
    const base = doc(para("Start"));
    const ab = appendToDoc(appendToDoc(base, "From the laptop"), "From the phone");
    const ba = appendToDoc(appendToDoc(base, "From the phone"), "From the laptop");
    expect(docText(ab).split("\n").sort()).toEqual(docText(ba).split("\n").sort());
  });
});

describe("dragging a block somewhere else", () => {
  // Four blocks, each 10 wide: starts at 0, 10, 20, 30.
  const sizes = [10, 10, 10, 10];

  it("moves a block UP: the positions before it have not shifted", () => {
    // Third block to the very top.
    expect(blockMovePlan(sizes, 2, 0)).toEqual({ deleteFrom: 20, deleteTo: 30, insertAt: 0 });
  });

  it("moves a block DOWN, and the target shifts because the block has gone", () => {
    // ⚠️ THE ONE THAT IS EASY TO GET WRONG. First block dropped below the third:
    // once it is deleted the remaining blocks are [B,C,D], so the gap after C is
    // index 2 — at position 20, not 30.
    expect(blockMovePlan(sizes, 0, 3)).toEqual({ deleteFrom: 0, deleteTo: 10, insertAt: 20 });
  });

  it("sends a block to the very bottom", () => {
    expect(blockMovePlan(sizes, 0, 4)).toEqual({ deleteFrom: 0, deleteTo: 10, insertAt: 30 });
  });

  it("does nothing when the block is dropped where it already is", () => {
    // Either side of itself is the same place.
    expect(blockMovePlan(sizes, 1, 1)).toBeNull();
    expect(blockMovePlan(sizes, 1, 2)).toBeNull();
  });

  it("refuses an index that is not there", () => {
    expect(blockMovePlan(sizes, -1, 0)).toBeNull();
    expect(blockMovePlan(sizes, 4, 0)).toBeNull();
  });

  it("copes with blocks of different sizes", () => {
    // A table is much bigger than a paragraph, so fixed-width maths would be wrong.
    const mixed = [3, 40, 3, 3];
    expect(blockMovePlan(mixed, 1, 0)).toEqual({ deleteFrom: 3, deleteTo: 43, insertAt: 0 });
    expect(blockMovePlan(mixed, 0, 2)).toEqual({ deleteFrom: 0, deleteTo: 3, insertAt: 40 });
  });

  it("moving a block down and back again returns it to where it started", () => {
    const down = blockMovePlan(sizes, 1, 3)!;
    expect(down.insertAt).toBe(20);
    // After that move the order is A,C,B,D — putting B (now index 2) back at 1.
    const back = blockMovePlan(sizes, 2, 1)!;
    expect(back.insertAt).toBe(10);
  });
});

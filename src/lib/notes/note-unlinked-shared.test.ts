import { describe, expect, it } from "vitest";
import { findUnlinked, findWholeWord, type LinkCandidate } from "./note-unlinked-shared";

const company = (id: number, name: string): LinkCandidate =>
  ({ entity: "company", id, code: null, label: name, needle: name });
const person = (id: number, name: string): LinkCandidate =>
  ({ entity: "person", id, code: null, label: name, needle: name });
const task = (id: number, code: string): LinkCandidate =>
  ({ entity: "task", id, code, label: code, needle: code });

const none = new Set<string>();

describe("findWholeWord", () => {
  it("finds a plain occurrence", () => {
    expect(findWholeWord("chase Terra Green today", "Terra Green")).toBe(6);
  });
  it("ignores case", () => {
    expect(findWholeWord("chase terra green today", "Terra Green")).toBe(6);
  });
  it("will not match inside a longer word", () => {
    expect(findWholeWord("Pamojaplus is not it", "Pamoja")).toBe(-1);
  });
  it("matches next to punctuation", () => {
    expect(findWholeWord("about Terra Green.", "Terra Green")).toBe(6);
    expect(findWholeWord("(Terra Green)", "Terra Green")).toBe(1);
  });
  it("does not split a task code at its hyphen", () => {
    expect(findWholeWord("see TG-006 please", "TG-006")).toBe(4);
    expect(findWholeWord("see TG-0061 please", "TG-006")).toBe(-1);
  });
  it("returns -1 for an empty needle", () => {
    expect(findWholeWord("anything", "")).toBe(-1);
  });
});

describe("findUnlinked", () => {
  it("offers a name that is written but not linked", () => {
    const out = findUnlinked("chase Terra Green Ltd about it", [company(3, "Terra Green Ltd")], none);
    expect(out.map((c) => c.id)).toEqual([3]);
  });

  it("stays quiet about something already linked", () => {
    const linked = new Set(["company:3"]);
    expect(findUnlinked("chase Terra Green Ltd", [company(3, "Terra Green Ltd")], linked)).toEqual([]);
  });

  it("says nothing when the name is not there", () => {
    expect(findUnlinked("nothing relevant here", [company(3, "Terra Green Ltd")], none)).toEqual([]);
  });

  /* Two- and three-letter names hit inside ordinary words, and every false offer
     costs more attention than the link saves. */
  it("ignores names too short to be safe", () => {
    expect(findUnlinked("the PES report", [company(5, "PES")], none)).toEqual([]);
  });

  it("still offers a short TASK CODE, which is unambiguous", () => {
    expect(findUnlinked("see TG-6 today", [task(9, "TG-6")], none).map((c) => c.id)).toEqual([9]);
  });

  it("prefers the longer name when one sits inside another", () => {
    const out = findUnlinked("chase Terra Green Ltd", [company(1, "Terra Green"), company(2, "Terra Green Ltd")], none);
    expect(out[0]!.id).toBe(2);
  });

  it("offers each target only once however often it is written", () => {
    const out = findUnlinked("Kishan Suchak and Kishan Suchak again", [person(7, "Kishan Suchak")], none);
    expect(out).toHaveLength(1);
  });

  it("never crowds the writing with more than five", () => {
    const many = Array.from({ length: 12 }, (_, i) => company(i + 1, `Company Number ${i + 1}`));
    const text = many.map((c) => c.needle).join(", ");
    expect(findUnlinked(text, many, none)).toHaveLength(5);
  });

  it("copes with an empty note", () => {
    expect(findUnlinked("", [company(3, "Terra Green Ltd")], none)).toEqual([]);
    expect(findUnlinked("   \n ", [company(3, "Terra Green Ltd")], none)).toEqual([]);
  });
});

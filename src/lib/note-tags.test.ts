import { describe, expect, it } from "vitest";
import { parseTags } from "./note-tags";

/* Tags are derived from prose on every save, so the parser has to be boring and
   predictable. These are the cases that would otherwise write junk rows. */
describe("parseTags", () => {
  it("finds tags at the start and mid-sentence", () => {
    expect(parseTags("#permits and later #visa")).toEqual(["permits", "visa"]);
  });

  it("lower-cases and de-duplicates, keeping the written order", () => {
    expect(parseTags("#Visa #visa #VISA #permits")).toEqual(["visa", "permits"]);
  });

  it("allows hyphens and underscores inside a tag", () => {
    expect(parseTags("#work-permit #tax_2026")).toEqual(["work-permit", "tax_2026"]);
  });

  it("ignores a hash that is not a tag", () => {
    // A hex colour, a number, a bare hash, and a URL fragment.
    expect(parseTags("#2490ef costs #1 # see https://x.co/a#section")).toEqual([]);
  });

  it("ignores a hash glued to the end of a word", () => {
    expect(parseTags("issue#permits")).toEqual([]);
  });

  it("finds a tag after a bracket or a quote", () => {
    expect(parseTags('(#permits) "#visa"')).toEqual(["permits", "visa"]);
  });

  it("caps runaway input", () => {
    const many = Array.from({ length: 80 }, (_, i) => `#tag${i}`).join(" ");
    expect(parseTags(many)).toHaveLength(50);
  });

  it("returns nothing for empty text", () => {
    expect(parseTags("")).toEqual([]);
  });
});

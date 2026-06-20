import { describe, it, expect } from "vitest";
import { SYNONYM_GROUPS, expandTokens, expandQuery } from "@/lib/synonyms";

// Conversational synonym brain — natural phrasing must resolve to the stored
// vocabulary across search, ORI Ask, and matching. A missed synonym means a
// real record never surfaces ("who owns X?" must reach "shareholder").

describe("expandTokens", () => {
  it("expands ownership words to governance vocabulary", () => {
    const out = expandTokens(new Set(["owner"]));
    expect(out.has("shareholder")).toBe(true);
    expect(out.has("director")).toBe(true);
    expect(out.has("equity")).toBe(true);
  });

  it("keeps the original base tokens", () => {
    const out = expandTokens(new Set(["owner", "elephant"]));
    expect(out.has("owner")).toBe(true);
    expect(out.has("elephant")).toBe(true); // unknown token survives untouched
  });

  it("expands suppliers and vendors interchangeably", () => {
    expect(expandTokens(new Set(["vendor"])).has("supplier")).toBe(true);
    expect(expandTokens(new Set(["supplier"])).has("vendor")).toBe(true);
    expect(expandTokens(new Set(["supplier"])).has("contractor")).toBe(true);
  });

  it("expands pay/finance vocabulary", () => {
    const out = expandTokens(new Set(["salary"]));
    expect(out.has("wage")).toBe(true);
    expect(out.has("payroll")).toBe(true);
  });

  it("does not expand a token that is in no group", () => {
    const out = expandTokens(new Set(["banana"]));
    expect(out.size).toBe(1);
    expect(out.has("banana")).toBe(true);
  });
});

describe("expandQuery", () => {
  it("resolves 'who is the owner of dar spices' to shareholder", () => {
    const out = expandQuery("who is the owner of dar spices");
    expect(out).toContain("shareholder");
    expect(out).toContain("director");
  });

  it("drops stopwords and short fragments", () => {
    const out = expandQuery("who is the owner of dar spices");
    expect(out).not.toContain("who");
    expect(out).not.toContain("the");
    expect(out).not.toContain("of");
    expect(out).not.toContain("is");
  });

  it("keeps meaningful domain nouns from the query", () => {
    const out = expandQuery("dar spices");
    expect(out).toContain("dar");
    expect(out).toContain("spices");
  });

  it("normalises case, accents and punctuation", () => {
    const out = expandQuery("OWNER's, équity!");
    expect(out).toContain("owner");
    expect(out).toContain("equity"); // accent stripped: équity → equity
  });

  it("caps the result at 24 tokens", () => {
    // A query touching several large groups would otherwise blow past the cap.
    const out = expandQuery(
      "owner shareholder vendor supplier salary leave permit document task meeting risk asset letter passport contract application",
    );
    expect(out.length).toBeLessThanOrEqual(24);
  });

  it("returns an empty list for a stopword-only query", () => {
    expect(expandQuery("who is the of a an")).toEqual([]);
  });

  it("de-duplicates tokens", () => {
    const out = expandQuery("owner owner owner");
    expect(new Set(out).size).toBe(out.length);
  });
});

describe("SYNONYM_GROUPS", () => {
  it("is a non-empty array of token groups", () => {
    expect(Array.isArray(SYNONYM_GROUPS)).toBe(true);
    expect(SYNONYM_GROUPS.length).toBeGreaterThan(0);
    for (const group of SYNONYM_GROUPS) {
      expect(group.length).toBeGreaterThan(1);
    }
  });

  it("stores tokens already-normalised (lowercase alphanumerics)", () => {
    for (const group of SYNONYM_GROUPS) {
      for (const token of group) {
        expect(token).toMatch(/^[a-z0-9]+$/);
      }
    }
  });
});

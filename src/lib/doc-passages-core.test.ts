import { describe, it, expect } from "vitest";
import { splitIntoPassages, searchPassages } from "./doc-passages-core";

describe("document passage layer", () => {
  it("splits blank-line paragraphs into numbered sections", () => {
    const p = splitIntoPassages("First paragraph with enough text to stand alone here.\n\nSecond paragraph also long enough to be its own block.");
    expect(p.length).toBe(2);
    expect(p[0].location).toBe("Section 1");
    expect(p[1].location).toBe("Section 2");
  });

  it("uses form-feed page breaks to number pages", () => {
    const p = splitIntoPassages("Cover page content that is long enough.\fPage two content also long enough here.");
    expect(p.map((x) => x.location)).toEqual(["Page 1", "Page 2"]);
  });

  it("reads an explicit Page marker as the location", () => {
    const p = splitIntoPassages("Page 4\nSeverance pay clause and other long enough content follows here.");
    expect(p[0].location).toBe("Page 4");
  });

  it("tags a leading clause number as a Clause location", () => {
    const p = splitIntoPassages("32.1 Severance pay — an employee is entitled to seven days per year of service.");
    expect(p[0].location).toBe("Clause 32");
  });

  it("merges a too-short heading forward into the next block", () => {
    const p = splitIntoPassages("Intro\n\nThis is the real body paragraph that is comfortably long enough to keep.");
    expect(p.length).toBe(1);
    expect(p[0].body.startsWith("Intro")).toBe(true);
  });

  it("finds the matching passage and highlights the term", () => {
    const passages = splitIntoPassages(
      "Clause 12 covers annual leave entitlements for staff and other details.\n\n" +
      "Clause 32 covers severance pay due on termination after twelve months of service.",
    );
    const hits = searchPassages(passages, "severance");
    expect(hits.length).toBe(1);
    expect(hits[0].snippet).toContain("«severance»");
    expect(hits[0].location).toBe("Clause 32");
  });

  it("ranks a passage with more distinct query terms higher", () => {
    const passages = splitIntoPassages(
      "This block mentions severance only once in passing here for context.\n\n" +
      "This block mentions severance and also termination and notice pay together.",
    );
    const hits = searchPassages(passages, "severance termination notice");
    expect(hits[0].body).toContain("termination");
    expect(hits[0].score).toBeGreaterThan(hits[1].score);
  });

  it("returns nothing when no term matches", () => {
    const passages = splitIntoPassages("A passage about annual leave and public holidays only.");
    expect(searchPassages(passages, "passport visa").length).toBe(0);
  });
});

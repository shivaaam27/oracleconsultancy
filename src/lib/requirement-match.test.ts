import { describe, it, expect } from "vitest";
import { matchScore, matchDocumentsToItems } from "@/lib/requirement-match";

// Compliance auto-linking — matches a saved document to the checklist item it
// satisfies. A wrong match ticks the wrong box; a missed one understates risk.

describe("matchScore", () => {
  it("matches across synonyms (National ID ↔ NIDA)", () => {
    expect(
      matchScore({ id: 1, label: "National ID", category: "Other" }, { id: 1, title: "NIDA card", category: "Other", docType: null }),
    ).toBeGreaterThanOrEqual(2);
  });
  it("scores 0 for unrelated documents", () => {
    expect(
      matchScore({ id: 1, label: "Passport", category: "Other" }, { id: 1, title: "Bank statement", category: "Other", docType: null }),
    ).toBe(0);
  });
  it("a specific shared category adds a bonus, but 'Other' does not", () => {
    const specific = matchScore(
      { id: 1, label: "Work Permit", category: "Immigration" },
      { id: 1, title: "Residence permit", category: "Immigration", docType: null },
    );
    const other = matchScore(
      { id: 1, label: "Work Permit", category: "Other" },
      { id: 1, title: "Residence permit", category: "Other", docType: null },
    );
    expect(specific).toBeGreaterThan(other);
  });
});

describe("matchDocumentsToItems", () => {
  it("assigns globally best-first, each document and item used once", () => {
    const items = [
      { id: 1, label: "Passport", category: "Other" },
      { id: 2, label: "CV", category: "Other" },
    ];
    const docs = [
      { id: 10, title: "Passport copy", category: "Other", docType: null },
      { id: 20, title: "Curriculum Vitae", category: "Other", docType: null },
    ];
    const m = matchDocumentsToItems(items, docs);
    expect(m.get(1)).toBe(10);
    expect(m.get(2)).toBe(20);
  });

  it("does not link anything below the threshold", () => {
    const items = [{ id: 1, label: "Passport", category: "Other" }];
    const docs = [{ id: 10, title: "Random unrelated note", category: "Other", docType: null }];
    expect(matchDocumentsToItems(items, docs).size).toBe(0);
  });
});

import { describe, it, expect } from "vitest";
import {
  alsoRemoved, byKindRelevance, deleteVerdict, itemKindLabel, kindsForRecipeLine,
  likelyDuplicates, listBlockers,
} from "./cocozuri-lists-shared";

describe("what kind of thing an item is", () => {
  it("⚠️ says NOT SAID rather than guessing at a name", () => {
    // Null is a fifth state and it is not "other": one is a job somebody has to
    // do, the other is a decision somebody made.
    expect(itemKindLabel(null)).toBe("not said");
    expect(itemKindLabel("other")).toBe("Something else");
    expect(itemKindLabel("raw_material")).toBe("Raw material");
  });

  it("offers raw materials to an ingredient line and packaging to a packaging line", () => {
    expect(kindsForRecipeLine("ingredient")).toContain("raw_material");
    expect(kindsForRecipeLine("ingredient")).not.toContain("packaging");
    expect(kindsForRecipeLine("packaging")).toEqual(["packaging"]);
  });

  it("⚠️ does NOT narrow a finishing line, because nobody has said what finishing means", () => {
    // The owner's own word, from note #31, and never defined. Guessing would be
    // inventing his meaning — the same reason DA/SA/TA is stored as written.
    const out = kindsForRecipeLine("finishing");
    expect(out).toContain("raw_material");
    expect(out).toContain("packaging");
  });

  it("⚠️ sorts an unclassified item into the MIDDLE, never out of the list", () => {
    // Hiding it would make the gap invisible and block real work on a row whose
    // only fault is that nobody got to it yet.
    const rows = [
      { kind: "packaging", name: "Box" },
      { kind: null, name: "Mystery powder" },
      { kind: "raw_material", name: "Cocoa" },
    ];
    const sorted = [...rows].sort(byKindRelevance(["raw_material"]));
    expect(sorted.map((r) => r.name)).toEqual(["Cocoa", "Mystery powder", "Box"]);
    expect(sorted).toHaveLength(3);
  });
});

describe("the lists you pick from", () => {
  it("⚠️ refuses a duplicate that differs only in case", () => {
    // PCS and Pcs being two entries is the whole fault this list ends.
    const out = listBlockers("Pcs", [{ value: "PCS", id: 1 }]);
    expect(out[0]).toContain("already on the list");
  });

  it("lets a value keep its own name when it is being renamed", () => {
    expect(listBlockers("PCS", [{ value: "PCS", id: 1 }], 1)).toEqual([]);
  });

  it("refuses an empty name", () => {
    expect(listBlockers("   ", [])[0]).toBe("It needs a name.");
  });

  it("⚠️ finds GM and GRM, and PKT and PKTS — but only SUGGESTS them", () => {
    // Five count units were found in a catalogue that has three. Whether two
    // spellings are one unit is a business decision, not a string comparison.
    const pairs = likelyDuplicates([
      { id: 1, value: "GM" }, { id: 2, value: "GRM" },
      { id: 3, value: "PKT" }, { id: 4, value: "PKTS" },
      { id: 5, value: "PCS" },
    ]);
    const seen = pairs.map((p) => [p.a.value, p.b.value].sort().join("/"));
    expect(seen).toContain("GM/GRM");
    expect(seen).toContain("PKT/PKTS");
    expect(seen.some((s) => s.includes("PCS"))).toBe(false);
  });

  it("does not pair two genuinely different words", () => {
    expect(likelyDuplicates([{ id: 1, value: "BARS" }, { id: 2, value: "COOKIES" }])).toEqual([]);
  });
});

describe("deleting for real", () => {
  it("⚠️ refuses while something points at it, and NAMES what", () => {
    // Rather than failing with a database error nobody can read.
    const v = deleteVerdict([
      { what: "invoice line", count: 4, blocking: true },
      { what: "price", count: 12, blocking: false },
    ]);
    expect(v.ok).toBe(false);
    expect(v.reason).toContain("4 invoice lines");
    expect(v.reason).not.toContain("12 prices");
  });

  it("allows it when only non-blocking things point at it", () => {
    const v = deleteVerdict([
      { what: "invoice line", count: 0, blocking: true },
      { what: "price", count: 12, blocking: false },
    ]);
    expect(v.ok).toBe(true);
  });

  it("says what will go with it", () => {
    expect(alsoRemoved([
      { what: "price", count: 12, blocking: false },
      { what: "branch", count: 1, blocking: false },
    ])).toBe("12 prices, 1 branch");
  });

  it("says nothing when nothing goes with it", () => {
    expect(alsoRemoved([{ what: "price", count: 0, blocking: false }])).toBeNull();
  });

  it("gets the singular right", () => {
    const v = deleteVerdict([{ what: "invoice", count: 1, blocking: true }]);
    expect(v.reason).toContain("1 invoice.");
  });
});

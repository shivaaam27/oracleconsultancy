import { describe, it, expect } from "vitest";
import { detectFactDiscrepancy } from "@/lib/fact-checks";

// Cross-checking a freshly-read fact against the current ledger value. The rule:
// flag ONLY real disagreements (different %, TIN, salary, bank), never formatting.
// A new field (no prior value) is never a conflict — append-only means the first
// observation has nothing to contradict.

describe("detectFactDiscrepancy — no conflict", () => {
  it("new field (no prior value) → no conflict", () => {
    expect(detectFactDiscrepancy("Salary", null, null, "1500000", 1_500_000).conflict).toBe(false);
  });

  it("empty prior or empty new → no conflict", () => {
    expect(detectFactDiscrepancy("Bank Account", "", "", "0123", "0123").conflict).toBe(false);
    expect(detectFactDiscrepancy("Bank Account", "0123", "0123", "—", "—").conflict).toBe(false);
  });

  it("same percentage, different formatting → no conflict", () => {
    expect(detectFactDiscrepancy("Shareholding", "48%", "48%", "48 %", "48 %").conflict).toBe(false);
    expect(detectFactDiscrepancy("Shareholding", "48%", "48%", "48", 48).conflict).toBe(false);
    // 0.48 stored as a fraction == "48%"
    expect(detectFactDiscrepancy("Shareholding", "0.48", 0.48, "48%", "48%").conflict).toBe(false);
  });

  it("same salary, different formatting (commas / currency / float dust) → no conflict", () => {
    expect(detectFactDiscrepancy("Salary", "1,500,000", "1,500,000", "1500000", 1_500_000).conflict).toBe(false);
    expect(detectFactDiscrepancy("Salary", "TZS 1,500,000", "TZS 1,500,000", "1500000", 1_500_000).conflict).toBe(false);
    expect(detectFactDiscrepancy("Salary", "1500000.0", 1_500_000, "1500000", 1_500_000).conflict).toBe(false);
  });

  it("same identifier, different separators / case → no conflict", () => {
    expect(detectFactDiscrepancy("TIN", "123-456-789", "123-456-789", "123 456 789", "123 456 789").conflict).toBe(false);
    expect(detectFactDiscrepancy("TIN", "123456789", "123456789", "123-456-789", "123-456-789").conflict).toBe(false);
    expect(detectFactDiscrepancy("Passport Number", "ab123456", "ab123456", "AB123456", "AB123456").conflict).toBe(false);
    // leading zeros preserved — not coerced to a Number
    expect(detectFactDiscrepancy("Bank Account", "00123450", "00123450", "0012 3450", "0012 3450").conflict).toBe(false);
  });

  it("same directors, different order / separators → no conflict", () => {
    expect(
      detectFactDiscrepancy(
        "Directors",
        "Alice, Bob",
        ["Alice", "Bob"],
        "Bob; Alice",
        ["Bob", "Alice"]
      ).conflict
    ).toBe(false);
    expect(
      detectFactDiscrepancy("Directors", "Alice and Bob", "Alice and Bob", "Bob, Alice", "Bob, Alice").conflict
    ).toBe(false);
  });

  it("same plain text, whitespace / case differences → no conflict", () => {
    expect(detectFactDiscrepancy("Position", "Managing Director", "Managing Director", " managing  director ", " managing  director ").conflict).toBe(false);
  });
});

describe("detectFactDiscrepancy — real conflict", () => {
  it("48% vs 51% → conflict", () => {
    const r = detectFactDiscrepancy("Shareholding", "48%", "48%", "51%", "51%");
    expect(r.conflict).toBe(true);
    expect(r.reason).toContain("48%");
    expect(r.reason).toContain("51%");
  });

  it("0.48 stored vs 51% read → conflict", () => {
    expect(detectFactDiscrepancy("Shareholding", "0.48", 0.48, "51%", "51%").conflict).toBe(true);
  });

  it("different salary → conflict", () => {
    expect(detectFactDiscrepancy("Salary", "1,500,000", 1_500_000, "1,800,000", 1_800_000).conflict).toBe(true);
  });

  it("different TIN / bank / passport → conflict", () => {
    expect(detectFactDiscrepancy("TIN", "123-456-789", "123-456-789", "987-654-321", "987-654-321").conflict).toBe(true);
    expect(detectFactDiscrepancy("Bank Account", "00123450", "00123450", "00999999", "00999999").conflict).toBe(true);
    expect(detectFactDiscrepancy("Passport Number", "AB123456", "AB123456", "CD777777", "CD777777").conflict).toBe(true);
  });

  it("different directors → conflict", () => {
    const r = detectFactDiscrepancy("Directors", "Alice, Bob", ["Alice", "Bob"], "Alice, Carol", ["Alice", "Carol"]);
    expect(r.conflict).toBe(true);
  });

  it("different free text → conflict", () => {
    expect(detectFactDiscrepancy("Position", "Director", "Director", "Accountant", "Accountant").conflict).toBe(true);
  });
});

describe("detectFactDiscrepancy — edge cases", () => {
  it("does not coerce a long identifier to a lossy number", () => {
    // Two genuinely different 20-digit account numbers must not collapse via Number().
    const a = "00000000000000000001";
    const b = "00000000000000000002";
    expect(detectFactDiscrepancy("Account Number", a, a, b, b).conflict).toBe(true);
  });

  it("one numeric side, one non-numeric side, differing → conflict via text", () => {
    expect(detectFactDiscrepancy("Note", "100", 100, "one hundred", "one hundred").conflict).toBe(true);
  });
});

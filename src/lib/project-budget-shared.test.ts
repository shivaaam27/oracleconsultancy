// The Bill of Quantities logic, tested against the workbook's real lines.
//
// As with projects-shared.test.ts, the expected values are READ OUT OF the
// PATAMELA sheet rather than worked out here, so a pass means the site groups
// and totals the budget the way the spreadsheet does.

import { describe, it, expect } from "vitest";
import { suggestItemCode, money, groupByCategory, normaliseCode, type BudgetLine } from "./project-budget-shared";

/** Real lines from PATAMELA, with their stated totals (column M). */
function line(id: number, itemCode: string, category: string, amount: string): BudgetLine {
  return {
    id, projectId: 1, itemCode, category, subJob: null, description: null,
    amount, qty: null, unit: null, sortOrder: id * 10, notes: null,
  };
}

const LINES: BudgetLine[] = [
  line(1, "TIMBER2X2-SETTING OUT", "TIMBER2X2", "175000"),      // PATAMELA r9
  line(2, "SAND-STRIP-FOUNDATION", "SAND", "712500"),           // r12
  line(3, "AGGREGATE-STRIP-FOUNDATION", "AGGREGATE", "2070000"),// r13
  line(4, "CEMENT-STRIP-FOUNDATION", "CEMENT", "2178000"),      // r14
  line(5, "SAND-FOUNDATION-WALLS", "SAND", "665000"),           // r17
  line(6, "CEMENT-FOUNDATION-WALLS", "CEMENT", "1034000"),      // r19
];

describe("grouping by category — PATAMELA's T/U block", () => {
  const groups = groupByCategory(LINES);

  it("adds every line of a category together", () => {
    // The whole reason the item code exists: cement is bought for several parts
    // of the building, and the category rolls those parts back up.
    const cement = groups.find((g) => g.category === "CEMENT")!;
    expect(cement.amount).toBe(2_178_000 + 1_034_000);
    expect(cement.lines).toBe(2);

    const sand = groups.find((g) => g.category === "SAND")!;
    expect(sand.amount).toBe(712_500 + 665_000);
    expect(sand.lines).toBe(2);
  });

  it("orders biggest first, as every list in COS does", () => {
    expect(groups.map((g) => g.category)).toEqual(
      ["CEMENT", "AGGREGATE", "SAND", "TIMBER2X2"],
    );
  });

  it("gives each category its share of the whole", () => {
    const total = LINES.reduce((s, l) => s + Number(l.amount), 0);
    const cement = groups.find((g) => g.category === "CEMENT")!;
    expect(cement.share).toBeCloseTo(3_212_000 / total, 9);
    expect(groups.reduce((s, g) => s + g.share, 0)).toBeCloseTo(1, 9);
  });

  it("has no opinion about an empty budget", () => {
    expect(groupByCategory([])).toEqual([]);
  });

  it("does not divide by zero when every line is nil", () => {
    const nil = [line(1, "A", "A", "0"), line(2, "B", "B", "0")];
    expect(groupByCategory(nil).every((g) => g.share === 0)).toBe(true);
  });
});

describe("item codes", () => {
  it("builds one the way the workbook does — CONCATENATE(job, sub-job)", () => {
    expect(suggestItemCode("TIMBER2X2", "SETTING OUT")).toBe("TIMBER2X2-SETTING OUT");
    expect(suggestItemCode("CEMENT", "strip-foundation")).toBe("CEMENT-STRIP-FOUNDATION");
  });

  it("copes with a category that has no sub-job", () => {
    expect(suggestItemCode("LABOUR", "")).toBe("LABOUR");
    expect(suggestItemCode("", "ANYTHING")).toBe("");
  });

  it("compares codes case-insensitively, so one item cannot become two", () => {
    // 270 lines typed by hand over weeks WILL be typed inconsistently. Without
    // this the unique index would let the same item's budget split in two.
    expect(normaliseCode("Cement-Strip-Foundation")).toBe("CEMENT-STRIP-FOUNDATION");
    expect(normaliseCode("  CEMENT-STRIP-FOUNDATION  ")).toBe("CEMENT-STRIP-FOUNDATION");
    expect(normaliseCode("TIMBER2X2-SETTING   OUT")).toBe("TIMBER2X2-SETTING OUT");
  });
});

describe("money", () => {
  it("shows whole shillings", () => {
    expect(money(146_801_556)).toBe("146,801,556");
    expect(money(0)).toBe("0");
    expect(money(null)).toBeNull();
  });
});

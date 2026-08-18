import { describe, it, expect } from "vitest";
import { csvCell, toCsv, csvFileName } from "@/lib/csv";

describe("csvCell", () => {
  it("leaves an ordinary value alone", () => {
    expect(csvCell("CEMENT")).toBe("CEMENT");
    expect(csvCell(1500000)).toBe("1500000");
  });

  it("wraps a value holding a comma", () => {
    // The real case: a supplier name. Unquoted, this becomes two columns and
    // every figure after it shifts one place to the right.
    expect(csvCell("Nelly, Mushy & Co")).toBe('"Nelly, Mushy & Co"');
  });

  it("doubles an embedded quote", () => {
    expect(csvCell('the 6" pipe')).toBe('"the 6"" pipe"');
  });

  it("wraps a value with a line break", () => {
    expect(csvCell("line one\nline two")).toBe('"line one\nline two"');
  });

  it("writes an empty cell for nothing, never the word null", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it("writes a tick as Yes and No, not true and false", () => {
    expect(csvCell(true)).toBe("Yes");
    expect(csvCell(false)).toBe("No");
  });
});

describe("toCsv", () => {
  it("starts with a byte-order mark so Excel reads it as UTF-8", () => {
    expect(toCsv(["A"], [["x"]]).startsWith("﻿")).toBe(true);
  });

  it("puts the headers first and ends every line with CRLF", () => {
    const csv = toCsv(["Item", "Amount"], [["CEMENT", 500]]);
    expect(csv).toBe("﻿Item,Amount\r\nCEMENT,500\r\n");
  });

  it("copes with no rows at all", () => {
    expect(toCsv(["Item"], [])).toBe("﻿Item\r\n");
  });
});

describe("csvFileName", () => {
  it("names the file after the project and the day", () => {
    expect(csvFileName("Patamela Villa", "budget", new Date("2026-08-18T09:00:00Z")))
      .toBe("Patamela-Villa-budget-2026-08-18");
  });

  it("strips punctuation rather than producing an unopenable file", () => {
    expect(csvFileName('PATAMELA / "DUPLEX"', "summary", new Date("2026-08-18T09:00:00Z")))
      .toBe("PATAMELA-DUPLEX-summary-2026-08-18");
  });

  it("falls back to a name when the project has none", () => {
    expect(csvFileName("   ", "budget", new Date("2026-08-18T09:00:00Z")))
      .toBe("project-budget-2026-08-18");
  });
});

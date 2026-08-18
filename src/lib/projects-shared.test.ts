// ─────────────────────────────────────────────────────────────────────────────
// The PES CAPITAL PROJECT workbook, as a test.
//
// Every expected value below was READ OUT OF THE SPREADSHEET — the cached result
// Excel itself had stored in the cell — not worked out by hand and not produced
// by the code being tested. So a passing run means one thing precisely:
//
//     the site reproduces the workbook's arithmetic, figure for figure.
//
// That matters more than it sounds. "Corrected" has to mean "the differences are
// the ones we chose", and the only way to show that is to pin down everything we
// did NOT intend to change. When Phase 2 adds the bill of quantities and Phase 4
// the expenditure ledger, these tests are what will catch a change nobody meant.
//
// Cell references are to the SNAPSHOT sheet unless stated.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  programme, contract, contractCorrections, num, money, pct, fmtDate,
  isOpen, scheduleTone, type ProjectInput,
} from "./projects-shared";

/** PATAMELA VILLA, exactly as the workbook holds it. */
const PATAMELA: ProjectInput = {
  startDate: "2026-01-19",       // B9
  durationDays: 120,             // B10  ("DURATION: 4 MONTHS")
  quotationValue: "165899292.12", // B14, excl. VAT — a STRING, as Postgres returns numeric
  poValue: "195761164.75",       // C48, incl. VAT
  additionalWork: null,          // C49, none agreed
  vatRate: "0.18",
  whtRate: "0.10",
  completionPct: "0.98",         // B36
};

/** BUDGET DATA!C262 — the bill-of-quantities total. Arrives properly in Phase 2. */
const BUDGET = 146_801_556;

/** The date the workbook's TODAY() had last resolved to when it was saved. */
const AS_AT = new Date("2026-08-12T00:00:00Z");

describe("programme — SNAPSHOT B9:B13", () => {
  const pr = programme(PATAMELA, { today: AS_AT });

  it("expected completion is start + duration (B11 = 19 May 2026)", () => {
    expect(pr.expectedCompletion?.toISOString().slice(0, 10)).toBe("2026-05-19");
  });

  it("days elapsed matches B12 (205)", () => {
    expect(pr.daysElapsed).toBe(205);
  });

  it("days remaining matches B13 (-85, i.e. overdue)", () => {
    expect(pr.daysRemaining).toBe(-85);
  });

  it("restates the negative as a positive overdue count", () => {
    // Same fact as B13, said in a way a reader cannot skim past.
    expect(pr.daysOverdue).toBe(85);
  });

  it("has no opinion when the dates are missing", () => {
    // The workbook would show a nonsense date here; we show nothing.
    const empty = programme({ ...PATAMELA, startDate: null, durationDays: null }, { today: AS_AT });
    expect(empty.expectedCompletion).toBeNull();
    expect(empty.daysElapsed).toBeNull();
    expect(empty.daysRemaining).toBeNull();
    expect(empty.daysOverdue).toBe(0);
  });
});

describe("contract — SNAPSHOT B14:B20 and C46:C50", () => {
  const c = contract(PATAMELA, { budget: BUDGET });

  it("withholding tax matches C47 (16,589,929.22)", () => {
    // C47 = (C46/1.18)*10%. Same answer from the contract value and stored rates.
    expect(c.withholdingTax).toBeCloseTo(16_589_929.22, 2);
  });

  it("budgeted profit matches B16 (19,097,736.12)", () => {
    expect(c.budgetedProfit).toBeCloseTo(19_097_736.12, 2);
  });

  it("projected margin matches B17 (11.51%)", () => {
    expect(c.projectedMargin).toBeCloseTo(0.1151164413, 9);
  });

  it("profit after withholding tax matches B19 (2,507,806.90)", () => {
    expect(c.profitAfterWht).toBeCloseTo(2_507_806.904, 2);
  });

  it("margin after withholding tax matches B20 (1.51%)", () => {
    // The headline of the whole project: 11.5% before tax becomes 1.5% after it.
    expect(c.marginAfterWht).toBeCloseTo(0.01511644126, 9);
  });

  it("strips VAT by dividing, never by subtracting", () => {
    // 195,761,164.75 / 1.18, NOT × 0.82. The two differ by over 6 million here.
    expect(c.contractExVat).toBeCloseTo(165_899_292.16, 2);
    expect(c.contractExVat).not.toBeCloseTo(195_761_164.75 * 0.82, 0);
  });

  it("VAT portion and net add back to the total", () => {
    expect((c.contractExVat ?? 0) + (c.vatPortion ?? 0)).toBeCloseTo(195_761_164.75, 6);
  });
});

describe("what is NOT known yet stays unknown", () => {
  it("returns null — never zero — for figures awaiting Phase 2", () => {
    // The budget is not supplied. A zero here would render as a 100% margin and
    // read as a fact. Null renders as "—" and reads as a question.
    const c = contract(PATAMELA);
    expect(c.budgetedProfit).toBeNull();
    expect(c.projectedMargin).toBeNull();
    expect(c.profitAfterWht).toBeNull();
    expect(c.marginAfterWht).toBeNull();
  });

  it("still gives the figures that need no budget", () => {
    const c = contract(PATAMELA);
    expect(c.totalContract).toBeCloseTo(195_761_164.75, 2);
    expect(c.withholdingTax).toBeCloseTo(16_589_929.22, 2);
  });

  it("distinguishes a real zero budget from an absent one", () => {
    const zero = contract(PATAMELA, { budget: 0 });
    expect(zero.budgetedProfit).toBeCloseTo(165_899_292.12, 2); // all of it is profit
    expect(contract(PATAMELA, { budget: null }).budgetedProfit).toBeNull();
  });
});

describe("corrections shown side by side", () => {
  const rows = contractCorrections(PATAMELA, { stagePlanTotal: 195_761_164.75 }); // C46

  it("agrees with the workbook on this project, today", () => {
    // The promise made when the fix was agreed: nothing silently moves. Both
    // corrections land on the same number the spreadsheet already shows.
    for (const r of rows) expect(r.same).toBe(true);
  });

  it("reports the old figure as well as the new one", () => {
    const wht = rows.find((r) => r.label === "Withholding tax")!;
    expect(wht.excel).toBeCloseTo(16_589_929.22, 2);
    expect(wht.corrected).toBeCloseTo(16_589_929.22, 2);
    expect(wht.excelFormula).toBe("=(C46/1.18)*10%");
  });

  it("diverges exactly when additional work is agreed — the trap being closed", () => {
    // The workbook taxes the payment-plan total, which never includes variations.
    // Add 10m of extra works and the spreadsheet under-declares the tax due.
    const withExtra = { ...PATAMELA, additionalWork: "10000000" };
    const [wht] = contractCorrections(withExtra, { stagePlanTotal: 195_761_164.75 });
    expect(wht.same).toBe(false);
    expect(wht.corrected! - wht.excel!).toBeCloseTo(10_000_000 / 1.18 * 0.1, 2);
  });

  it("honours a changed rate instead of the hard-coded 1.18", () => {
    // A zero-rated contract: the workbook would still divide by 1.18 and deduct.
    const zeroRated = { ...PATAMELA, vatRate: "0" };
    expect(contract(zeroRated).withholdingTax).toBeCloseTo(195_761_164.75 * 0.1, 2);
  });
});

describe("reading stored values", () => {
  it("accepts the strings Postgres returns for numeric columns", () => {
    expect(num("195761164.75")).toBe(195_761_164.75);
    expect(num(42)).toBe(42);
  });

  it("treats absent as absent, but keeps a real zero", () => {
    expect(num(null)).toBeNull();
    expect(num("")).toBeNull();
    expect(num("nonsense")).toBeNull();
    expect(num(0)).toBe(0);
    expect(num("0")).toBe(0);
  });
});

describe("formatting", () => {
  it("shows money in whole shillings with separators", () => {
    expect(money(195_761_164.75)).toBe("195,761,165");
    expect(money(null)).toBeNull();
  });

  it("shows a fraction as a percentage", () => {
    expect(pct(0.1151164413)).toBe("11.5%");
    expect(pct(0.01511644126)).toBe("1.5%");
    expect(pct(null)).toBeNull();
  });

  it("shows dates British-style", () => {
    expect(fmtDate("2026-05-19")).toBe("19 May 2026");
    expect(fmtDate(null)).toBeNull();
  });
});

describe("status", () => {
  it("treats open as anything but Completed/Closed, as tasks do", () => {
    expect(isOpen("Active")).toBe(true);
    expect(isOpen("On hold")).toBe(true);
    expect(isOpen("Completed")).toBe(false);
    expect(isOpen("Closed")).toBe(false);
  });

  it("flags an overdue open project and stays quiet on a finished one", () => {
    const pr = programme(PATAMELA, { today: AS_AT });
    expect(scheduleTone(pr, "Active")).toBe("danger");
    expect(scheduleTone(pr, "Completed")).toBe("muted");
  });

  it("warns in the fortnight before the deadline", () => {
    const soon = programme(PATAMELA, { today: new Date("2026-05-10T00:00:00Z") });
    expect(soon.daysRemaining).toBe(9);
    expect(scheduleTone(soon, "Active")).toBe("warn");
  });
});

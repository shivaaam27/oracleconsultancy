// The site tick-sheets, and the two workbook faults they fix.

import { describe, it, expect } from "vitest";
import {
  dateRange, isSunday, personTotals, siteTotals, fedOnDay, paidOnDay,
  type SitePerson, type SiteDay,
} from "./project-site-shared";

function person(id: number, over: Partial<SitePerson> = {}): SitePerson {
  return {
    id, projectId: 1, name: `P${id}`, designation: null,
    kind: "CASUAL LABOUR", dailyRate: "18000", phone: null,
    mealsEligible: true, active: true, sortOrder: id, ...over,
  };
}
function day(personId: number, d: string, over: Partial<SiteDay> = {}): SiteDay {
  return { id: Math.random(), personId, day: d, meal: false, labourAmount: null, ...over };
}

describe("the calendar strip", () => {
  it("lists every day between two dates, inclusive", () => {
    const r = dateRange("2026-02-08", "2026-02-12");
    expect(r).toEqual(["2026-02-08", "2026-02-09", "2026-02-10", "2026-02-11", "2026-02-12"]);
  });

  it("crosses a month end", () => {
    expect(dateRange("2026-01-30", "2026-02-02")).toEqual(
      ["2026-01-30", "2026-01-31", "2026-02-01", "2026-02-02"],
    );
  });

  it("knows a Sunday", () => {
    expect(isSunday("2026-02-08")).toBe(true);    // the workbook's first column
    expect(isSunday("2026-02-09")).toBe(false);
  });
});

describe("per-person totals", () => {
  const people = [person(1), person(2, { kind: "PERMANENT", mealsEligible: false })];
  const days = [
    day(1, "2026-02-08", { meal: true, labourAmount: "18000" }),
    day(1, "2026-02-09", { meal: true, labourAmount: "18000" }),
    day(1, "2026-02-10", { meal: true }),               // fed but not paid
    day(2, "2026-02-08", { labourAmount: "25000" }),    // paid but not fed
  ];

  it("counts meal days and adds up wages separately", () => {
    const t = personTotals(people, days);
    expect(t[0].mealDays).toBe(3);
    expect(t[0].labourPaid).toBe(36_000);
    expect(t[0].workedDays).toBe(2);
    expect(t[1].mealDays).toBe(0);
    expect(t[1].labourPaid).toBe(25_000);
  });

  it("does not count a zero-pay day as worked", () => {
    const t = personTotals([person(1)], [day(1, "2026-02-08", { labourAmount: "0" })]);
    expect(t[0].workedDays).toBe(0);
    expect(t[0].labourPaid).toBe(0);
  });

  it("gives a person with no days recorded a clean zero", () => {
    const t = personTotals([person(9)], []);
    expect(t[0]).toMatchObject({ mealDays: 0, labourPaid: 0, workedDays: 0 });
  });
});

describe("the sheet totals", () => {
  const people = [person(1), person(2)];
  const days = [
    day(1, "2026-02-08", { meal: true, labourAmount: "18000" }),
    day(2, "2026-02-08", { meal: true, labourAmount: "18000" }),
    day(1, "2026-02-09", { meal: true }),
  ];
  const totals = personTotals(people, days);

  it("prices meals at headcount-days times the rate", () => {
    // MEALS!C40 = C38 * C39.
    const s = siteTotals(totals, { mealRate: 7000 });
    expect(s.headcountDays).toBe(3);
    expect(s.mealsPayable).toBe(21_000);
    expect(s.labourPayable).toBe(36_000);
  });

  it("says nothing about meal cost when no rate has been set", () => {
    expect(siteTotals(totals, { mealRate: null }).mealsPayable).toBeNull();
  });

  it("finds each budget BY NAME, not by a row number", () => {
    // The fault being fixed: MEALS!C42 = SNAPSHOT!E13 and LABOUR!C39 =
    // SNAPSHOT!E8 point at fixed rows of a gauge sorted by size, so meals reads
    // SAND's budget and labour reads CEMENT's. A name cannot be re-sorted.
    const budget = new Map([
      ["SAND", 5_352_500], ["CEMENT", 12_572_000],
      ["MEALS", 3_860_000], ["LABOUR", 21_759_256],
    ]);
    const s = siteTotals(totals, { mealRate: 7000, budgetByCategory: budget });
    expect(s.mealsBudget).toBe(3_860_000);
    expect(s.labourBudget).toBe(21_759_256);
    expect(s.mealsBudget).not.toBe(5_352_500);    // not SAND
    expect(s.labourBudget).not.toBe(12_572_000);  // not CEMENT
  });

  it("reads spend from the amounts, not the phone-number column", () => {
    // MEALS!C41 and LABOUR!C38 sum EXPENDITURES!L — the MOBILE NUMBER column —
    // and so always report 0.
    const spent = new Map([["MEALS", 3_299_000], ["LABOUR", 2_748_600]]);
    const s = siteTotals(totals, { mealRate: 7000, spentByCategory: spent });
    expect(s.mealsSpent).toBe(3_299_000);
    expect(s.labourSpent).toBe(2_748_600);
  });

  it("leaves budget and spend null when they are not supplied", () => {
    const s = siteTotals(totals, { mealRate: 7000 });
    expect(s.mealsBudget).toBeNull();
    expect(s.labourSpent).toBeNull();
  });
});

describe("per-day columns", () => {
  const days = [
    day(1, "2026-02-08", { meal: true, labourAmount: "18000" }),
    day(2, "2026-02-08", { meal: true, labourAmount: "20000" }),
    day(3, "2026-02-08", { meal: false }),
    day(1, "2026-02-09", { meal: true }),
  ];

  it("counts who was fed on a day", () => {
    expect(fedOnDay(days, "2026-02-08")).toBe(2);
    expect(fedOnDay(days, "2026-02-09")).toBe(1);
    expect(fedOnDay(days, "2026-02-10")).toBe(0);
  });

  it("adds up what was paid on a day", () => {
    expect(paidOnDay(days, "2026-02-08")).toBe(38_000);
    expect(paidOnDay(days, "2026-02-09")).toBe(0);
  });
});

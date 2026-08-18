// ─────────────────────────────────────────────────────────────────────────────
// SITE DAYS — the MEALS and LABOUR tick-sheets (Phase 6). Client-safe half.
//
// Both workbook sheets are the same grid: names down the side, one column per
// calendar day across the top. MEALS ticks a box; LABOUR types the day's pay.
// One row per person per day carries both, so the two sheets become two views
// of one thing.
//
// ⚠️ WHAT IS FIXED HERE. In the workbook:
//   · `MEALS!C42 = SNAPSHOT!E13` and `LABOUR!C39 = SNAPSHOT!E8` point at fixed
//     ROWS of a gauge that is SORTED BY SIZE — so meals reads Sand's budget and
//     labour reads Cement's. Here a budget is looked up BY CATEGORY NAME.
//   · `MEALS!C41` and `LABOUR!C38` sum `EXPENDITURES!L`, the MOBILE NUMBER
//     column, and therefore always report 0 spent. Here spend comes from the
//     expenditure amounts.
// ─────────────────────────────────────────────────────────────────────────────

import { num } from "@/lib/projects-shared";

export const SITE_PERSON_KINDS = ["PERMANENT", "CASUAL LABOUR"] as const;
export type SitePersonKind = (typeof SITE_PERSON_KINDS)[number];

export type SitePerson = {
  id: number;
  projectId: number;
  name: string;
  designation: string | null;
  kind: string;
  dailyRate: string | null;
  phone: string | null;
  mealsEligible: boolean;
  active: boolean;
  sortOrder: number;
};

export type SiteDay = {
  id: number;
  personId: number;
  /** yyyy-mm-dd. */
  day: string;
  meal: boolean;
  labourAmount: string | null;
};

/** yyyy-mm-dd for a Date, in UTC — days here are calendar days, not instants. */
export function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Every date from `from` to `to` inclusive. */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  for (let d = start; d <= end; d = new Date(d.getTime() + 86_400_000)) {
    out.push(dayKey(d));
  }
  return out;
}

/** Sunday is not a working day on this site; used to shade the grid. */
export function isSunday(day: string): boolean {
  return new Date(`${day}T00:00:00Z`).getUTCDay() === 0;
}

/* ───────────────────────────────────────────────────────────────── totals ── */

export type PersonTotals = {
  person: SitePerson;
  /** Days this person was fed — MEALS column F, `COUNTIF(...,TRUE)`. */
  mealDays: number;
  /** What this person was paid — LABOUR column G, `SUM(...)`. */
  labourPaid: number;
  /** Days with any labour recorded. */
  workedDays: number;
};

export function personTotals(people: SitePerson[], days: SiteDay[]): PersonTotals[] {
  const byPerson = new Map<number, SiteDay[]>();
  for (const d of days) {
    const list = byPerson.get(d.personId) ?? [];
    list.push(d);
    byPerson.set(d.personId, list);
  }
  return people.map((person) => {
    const mine = byPerson.get(person.id) ?? [];
    let mealDays = 0, labourPaid = 0, workedDays = 0;
    for (const d of mine) {
      if (d.meal) mealDays += 1;
      const amt = num(d.labourAmount);
      if (amt !== null && amt !== 0) { labourPaid += amt; workedDays += 1; }
    }
    return { person, mealDays, labourPaid, workedDays };
  });
}

export type SiteTotals = {
  /** Total person-days fed — MEALS!C38. */
  headcountDays: number;
  /** headcountDays × meal rate — MEALS!C40. */
  mealsPayable: number | null;
  /** Total wages recorded — LABOUR!C37. */
  labourPayable: number;
  /** Budget for the MEALS category, looked up BY NAME. */
  mealsBudget: number | null;
  labourBudget: number | null;
  /** Actually spent, from the expenditure ledger — NOT the phone-number column. */
  mealsSpent: number | null;
  labourSpent: number | null;
};

/**
 * The bottom-of-sheet summary from both tick-sheets.
 *
 * `mealRate` is MEALS!C39 (7,000/day on Patamela), typed on the project.
 * Budgets are looked up by CATEGORY NAME so a re-sorted dashboard cannot
 * silently repoint them, which is the fault this replaces.
 */
export function siteTotals(
  totals: PersonTotals[],
  opts: {
    mealRate: number | null;
    budgetByCategory?: Map<string, number>;
    spentByCategory?: Map<string, number>;
  },
): SiteTotals {
  const headcountDays = totals.reduce((s, t) => s + t.mealDays, 0);
  const labourPayable = totals.reduce((s, t) => s + t.labourPaid, 0);
  const budget = opts.budgetByCategory;
  const spent = opts.spentByCategory;
  return {
    headcountDays,
    mealsPayable: opts.mealRate === null ? null : headcountDays * opts.mealRate,
    labourPayable,
    mealsBudget: budget?.get("MEALS") ?? null,
    labourBudget: budget?.get("LABOUR") ?? null,
    mealsSpent: spent?.get("MEALS") ?? null,
    labourSpent: spent?.get("LABOUR") ?? null,
  };
}

/** People fed on a given day — MEALS row 34, `COUNTIF(column, TRUE)`. */
export function fedOnDay(days: SiteDay[], day: string): number {
  return days.filter((d) => d.day === day && d.meal).length;
}

/** Wages recorded on a given day — LABOUR row 33. */
export function paidOnDay(days: SiteDay[], day: string): number {
  return days
    .filter((d) => d.day === day)
    .reduce((s, d) => s + (num(d.labourAmount) ?? 0), 0);
}

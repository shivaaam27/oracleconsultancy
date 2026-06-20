// ============================================================================
// Command Centre — shared flag + date engine.
// Adopted from the owner's COS handover (cosTypes.ts), mapped to our design
// tokens. Flags are DERIVED, never stored — recompute from dates on render so
// they're always correct relative to today. Bands differ by risk class:
//   deadlines    : <0 overdue · ≤7 dueNow · ≤30 soon · else later
//   permits      : <0 overdue · ≤60 dueNow · ≤90 soon (wider — higher stakes)
//   registrations: <0 overdue · ≤30 dueNow · ≤60 soon
// ============================================================================

export type CcFlag = "overdue" | "dueNow" | "soon" | "later" | "done" | "none";

const DAY = 24 * 60 * 60 * 1000;

function midnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Whole days from today to a target date. Negative = in the past. */
export function daysUntil(target: Date | null, today: Date = new Date()): number | null {
  if (!target) return null;
  return Math.round((midnight(target).getTime() - midnight(today).getTime()) / DAY);
}

export function deadlineFlag(date: Date | null, done: boolean, today: Date = new Date()): CcFlag {
  if (done) return "done";
  const d = daysUntil(date, today);
  if (d === null) return "none";
  if (d < 0) return "overdue";
  if (d <= 7) return "dueNow";
  if (d <= 30) return "soon";
  return "later";
}

export function permitFlag(expiry: Date | null, issued: boolean, today: Date = new Date()): CcFlag {
  if (issued) return "done";
  const d = daysUntil(expiry, today);
  if (d === null) return "none";
  if (d < 0) return "overdue";
  if (d <= 60) return "dueNow";
  if (d <= 90) return "soon";
  return "later";
}

export function renewalFlag(expiry: Date | null, today: Date = new Date()): CcFlag {
  const d = daysUntil(expiry, today);
  if (d === null) return "none";
  if (d < 0) return "overdue";
  if (d <= 30) return "dueNow";
  if (d <= 60) return "soon";
  return "later";
}

/** Human "in 5d / today / 3d ago / —" label from a day delta. */
export function daysLabel(n: number | null): string {
  if (n === null) return "—";
  if (n < 0) return `${Math.abs(n)}d ago`;
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  return `in ${n}d`;
}

/** Tailwind token classes per flag, matching the needs-attention panel. */
export const FLAG_META: Record<CcFlag, { label: string; text: string; bg: string; ring: string; rank: number }> = {
  overdue: { label: "Overdue", text: "text-danger", bg: "bg-danger-soft/60", ring: "ring-danger/25", rank: 0 },
  dueNow: { label: "Due now", text: "text-danger", bg: "bg-danger-soft/60", ring: "ring-danger/25", rank: 1 },
  soon: { label: "Soon", text: "text-warn", bg: "bg-warn-soft/60", ring: "ring-warn/25", rank: 2 },
  later: { label: "Later", text: "text-success", bg: "bg-success-soft/60", ring: "ring-success/20", rank: 3 },
  done: { label: "Done", text: "text-fg-subtle", bg: "bg-bg-muted/70", ring: "ring-border/50", rank: 4 },
  none: { label: "—", text: "text-fg-subtle", bg: "bg-bg-subtle/50", ring: "ring-border/40", rank: 5 },
};

// ============================================================================
// Next-due computation — turn a recurring obligation into its next dated
// instance. Date rules lifted from the handover seed (cosSeed.ts).
//
// Tanzania financial year runs 1 July – 30 June (confirmed by owner). So the
// year-end is 30 June, and returns due "within 6 months of year-end" fall on
// 31 December. To shift the whole system to a different year-end, change
// FY_END_MONTH/FY_END_DAY in one place. daily/weekly habits and event-driven
// duties have no meaningful single date → null.
// ============================================================================

// 0-based month. June = 5. The "6 months after year-end" filing anchor is
// therefore 31 December.
const FY_END_MONTH = 5;
const FY_END_DAY = 30;
const FILING_ANCHOR_MONTH = (FY_END_MONTH + 6) % 12; // December (11)
const FILING_ANCHOR_DAY = 31;

export type ObligationFrequency = "daily" | "weekly" | "monthly" | "quarterly" | "annual" | "event";

/** Next occurrence of a given day-of-month, today or later. */
function nextDayOfMonth(day: number, today: Date): Date {
  const y = today.getFullYear();
  const m = today.getMonth();
  const candidate = new Date(y, m, day);
  if (midnight(candidate) >= midnight(today)) return candidate;
  return new Date(y, m + 1, day);
}

/** Last day of a month (0-based month index). */
function monthEnd(year: number, month: number): Date {
  return new Date(year, month + 1, 0);
}

/** Next month-end, today or later. */
function nextMonthEnd(today: Date): Date {
  const end = monthEnd(today.getFullYear(), today.getMonth());
  if (midnight(end) >= midnight(today)) return end;
  return monthEnd(today.getFullYear(), today.getMonth() + 1);
}

/** Next quarter-end (31 Mar / 30 Jun / 30 Sep / 31 Dec), today or later. */
function nextQuarterEnd(today: Date): Date {
  const ends = [2, 5, 8, 11]; // Mar, Jun, Sep, Dec (0-based)
  const y = today.getFullYear();
  for (const m of ends) {
    const e = monthEnd(y, m);
    if (midnight(e) >= midnight(today)) return e;
  }
  return monthEnd(y + 1, 2);
}

/** Next occurrence of a specific (month, day) anchor, today or later. */
function nextAnnualAnchor(month: number, day: number, today: Date): Date {
  const candidate = new Date(today.getFullYear(), month, day);
  if (midnight(candidate) >= midnight(today)) return candidate;
  return new Date(today.getFullYear() + 1, month, day);
}

/**
 * Start of the current cadence period — used to decide whether a per-company
 * completion (lastDone) counts for "this period". Ticking sets lastDone=now;
 * once the next period begins, lastDone falls before this boundary and the item
 * shows outstanding again. This is the "it always reappears" guarantee.
 */
export function periodStart(frequency: ObligationFrequency, today: Date = new Date()): Date | null {
  const y = today.getFullYear();
  const m = today.getMonth();
  const d = today.getDate();
  switch (frequency) {
    case "daily":
      return new Date(y, m, d);
    case "weekly": {
      // Week starts Monday.
      const dow = today.getDay(); // 0 Sun … 6 Sat
      const back = dow === 0 ? 6 : dow - 1;
      return new Date(y, m, d - back);
    }
    case "monthly":
      return new Date(y, m, 1);
    case "quarterly":
      return new Date(y, Math.floor(m / 3) * 3, 1);
    case "annual": {
      // Financial year starts the month after FY_END_MONTH (1 July).
      const fyStartMonth = (FY_END_MONTH + 1) % 12; // July (6)
      const afterStart = m > fyStartMonth || (m === fyStartMonth && d >= 1);
      return new Date(afterStart ? y : y - 1, fyStartMonth, 1);
    }
    case "event":
    default:
      return null;
  }
}

/** Whether a per-company lastDone counts as done within the current period. */
export function doneThisPeriod(frequency: ObligationFrequency, lastDone: Date | null, today: Date = new Date()): boolean {
  if (!lastDone) return false;
  const start = periodStart(frequency, today);
  if (!start) return false;
  return lastDone.getTime() >= start.getTime();
}

/**
 * A stable identifier for the current cadence period — derived from periodStart
 * so it rolls over exactly when "done this period" does. Used to key one-task-per-
 * obligation-period dedup (e.g. "annual:2025-07-01"). Null for undated cadences.
 */
export function periodKey(frequency: ObligationFrequency, today: Date = new Date()): string | null {
  const start = periodStart(frequency, today);
  if (!start) return null;
  const y = start.getFullYear();
  const m = String(start.getMonth() + 1).padStart(2, "0");
  const d = String(start.getDate()).padStart(2, "0");
  return `${frequency}:${y}-${m}-${d}`;
}

export type NextDueInput = {
  frequency: ObligationFrequency;
  dueDay?: number | null;
  dueRule?: string | null;
};

/**
 * Compute the next concrete due date for an obligation, or null when the
 * cadence has no meaningful single date (daily/weekly habits, event-driven).
 */
export function computeNextDue(ob: NextDueInput, today: Date = new Date()): Date | null {
  const rule = (ob.dueRule ?? "").toLowerCase();
  switch (ob.frequency) {
    case "daily":
    case "weekly":
    case "event":
      return null;
    case "monthly":
      if (ob.dueDay) return nextDayOfMonth(ob.dueDay, today);
      return nextMonthEnd(today); // "by month-end"
    case "quarterly":
      return nextQuarterEnd(today);
    case "annual": {
      if (rule.includes("31 mar")) return nextAnnualAnchor(2, 31, today); // e.g. WCF annual return
      if (rule.includes("start of year of income")) return nextAnnualAnchor(FY_END_MONTH + 1 > 11 ? 0 : FY_END_MONTH + 1, 1, today); // 1 Jul
      // "within 6 months of year-end" / "by tax-return due date" → 31 Dec.
      if (rule.includes("year-end") || rule.includes("tax-return") || rule.includes("6 months")) {
        return nextAnnualAnchor(FILING_ANCHOR_MONTH, FILING_ANCHOR_DAY, today);
      }
      if (rule.includes("30 jun")) return nextAnnualAnchor(FY_END_MONTH, FY_END_DAY, today);
      if (rule.includes("per licence") || rule.includes("per brela")) return null; // date varies per entity
      return null; // unknown annual rule: leave undated rather than guess
    }
    default:
      return null;
  }
}

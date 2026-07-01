/**
 * kpi.ts — per-person task KPI (simple union-count model).
 *
 * Owner's rule: when a task is COMPLETED, one credit goes to everyone connected
 * to it — the creator AND every assignee (lead or working, treated the same) —
 * but each person is counted ONCE per task (creator + assignee ≠ two credits).
 *
 * So a person's monthly KPI = the number of completed tasks they were part of
 * (as creator OR assignee), counted once each. The score IS that count — no
 * on-time weighting, no overdue penalty. Directors are excluded.
 *
 * Period = calendar month, keyed off `tasks.closed_date`. "done" = Completed OR
 * Closed. Pure over TaskRow[] — no DB. Archived tasks are already excluded by
 * getAllTasks.
 */
import type { TaskRow } from "./queries";

export type PersonKpi = {
  personId: number;
  year: number;
  /** 1-based month (1 = January). */
  month: number;
  monthLabel: string;
  /** Completed tasks this person was part of (creator OR assignee), counted once
   *  each. This is the headline number AND the score. */
  completed: number;
  /** Open tasks this person is assigned to right now — context only, not scored. */
  openInvolved: number;
  /** The KPI score = completed. */
  score: number;
  /** Directors are excluded from KPI (set by the caller; defaults false). */
  excluded: boolean;
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function isDone(status: string): boolean {
  return status === "Completed" || status === "Closed";
}

/** True if the task closed within the given 1-based month/year (local time). */
function closedInMonth(t: TaskRow, year: number, month: number): boolean {
  const d = t.closedDate;
  if (!d) return false;
  return d.getFullYear() === year && d.getMonth() + 1 === month;
}

/** Assigned to the task in any capacity — lead, working, or owner. */
function isInvolved(t: TaskRow, personId: number): boolean {
  return t.ownerId === personId || t.assigneeIds.includes(personId) || t.leadIds.includes(personId);
}

/** Earns a completion credit — as the creator OR as an assignee (counted once). */
function hasCredit(t: TaskRow, personId: number): boolean {
  return t.createdByPersonId === personId || isInvolved(t, personId);
}

/**
 * Compute one person's KPI for a given month (1-based). Defaults to the current
 * calendar month.
 */
export function computePersonKpi(
  personId: number,
  tasks: TaskRow[],
  year?: number,
  month?: number,
): PersonKpi {
  const now = new Date();
  const y = year ?? now.getFullYear();
  const m = month ?? now.getMonth() + 1;

  const completed = tasks.filter(
    (t) => hasCredit(t, personId) && isDone(t.status) && closedInMonth(t, y, m),
  ).length;

  const openInvolved = tasks.filter((t) => isInvolved(t, personId) && !isDone(t.status)).length;

  return {
    personId,
    year: y,
    month: m,
    monthLabel: `${MONTHS[m - 1]} ${y}`,
    completed,
    openInvolved,
    score: completed,
    excluded: false,
  };
}

/** Compute KPI for many people at once (e.g. an Insights leaderboard). */
export function computeKpiLeaderboard(
  personIds: number[],
  tasks: TaskRow[],
  year?: number,
  month?: number,
): PersonKpi[] {
  return personIds
    .map((id) => computePersonKpi(id, tasks, year, month))
    .sort((a, b) => b.score - a.score);
}

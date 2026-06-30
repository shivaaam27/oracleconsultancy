/**
 * kpi.ts — per-person task KPI scorecard.
 *
 * Credit model (owner's rule): EVERYONE on a completed task earns the credit —
 * the lead (accountable) AND the working contributors alike. "Lead" only marks
 * who is in charge; it does not change who scores. Plus a separate creator line.
 *   - involvedDone — tasks this person worked on (lead OR working OR owner) that
 *     reached done this month. THIS is the headline delivery number.
 *   - ledDone      — subset of involvedDone where they were the lead (for display).
 *   - createdDone  — tasks this person CREATED that reached done this month (a
 *     separate counter, never summed into delivery; creating ≠ delivering).
 * The same task credits every participant + its creator — intended, not a bug.
 *
 * Decisions (see memory/kpi_task_attribution.md):
 *   - "done" = Completed OR Closed (Closed→Completed unification deferred; both
 *     stamp `closed_date`).
 *   - Period = calendar month, keyed off `tasks.closed_date`.
 *   - Lead = `leadIds` (task_assignees.role='accountable', falling back to owner).
 *   - Headline score is DELIVERY-based (involvedDone × on-time − overdue), so a
 *     manager can't inflate it just by creating tasks.
 *
 * Pure over TaskRow[] — no DB. Archived tasks are already excluded by getAllTasks.
 */
import type { TaskRow } from "./queries";

export type PersonKpi = {
  personId: number;
  year: number;
  /** 1-based month (1 = January). */
  month: number;
  monthLabel: string;
  /** Tasks this person created that were completed/closed in the month. */
  createdDone: number;
  /** Tasks this person worked on (lead OR working OR owner) done in the month —
   *  the headline delivery number. */
  involvedDone: number;
  /** Subset of involvedDone where this person was the lead (display only). */
  ledDone: number;
  /** Of the involved-done tasks WITH a deadline, how many landed on time / late. */
  onTimeCount: number;
  lateCount: number;
  /** Share of deadline-bearing involved-done tasks that were on time (0..1), or
   *  null when none of them had a deadline (can't be early or late without one). */
  onTimeRate: number | null;
  /** Open tasks this person is on right now (the live workload they carry). */
  openInvolved: number;
  /** …of which are overdue right now (the drag signal). */
  overdueOpen: number;
  /** Headline delivery score: involvedDone × on-time-rate − overdue penalty.
   *  Rounded; can be negative when overdue work outweighs delivery. */
  score: number;
  /** Directors are excluded from KPI (they set the work, not deliver it). The
   *  engine never knows portal roles, so this is set by the caller and defaults
   *  to false; surfaces hide the scorecard when true. */
  excluded: boolean;
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function isDone(status: string): boolean {
  return status === "Completed" || status === "Closed";
}

/** Did this person work on the task in any capacity — lead, working, or owner? */
function isInvolved(t: TaskRow, personId: number): boolean {
  return t.ownerId === personId || t.assigneeIds.includes(personId) || t.leadIds.includes(personId);
}

/**
 * Does an OPEN, overdue task count as an overdue penalty against this person?
 * Mirrors the owner's fairness rules:
 *   - a documented blocker (blockedOnPersonId set) SUSPENDS blame for everyone;
 *   - a person who marked "my part is done" is spared;
 *   - "lead" mode blames only the accountable lead(s) — but falls back to SHARED
 *     when no lead is named, so a task can't dodge accountability by being blank;
 *   - "shared" mode blames everyone involved.
 */
function carriesOverdue(t: TaskRow, personId: number): boolean {
  if (!isInvolved(t, personId)) return false;
  if (t.blockedOnPersonId != null) return false; // documented blocker → suspended
  if (t.partDoneIds.includes(personId)) return false; // did their part
  if (t.accountability === "lead" && t.leadIds.length > 0) return t.leadIds.includes(personId);
  return true; // shared, or lead-mode with no named lead (fallback shared)
}

/** True if the task closed within the given 1-based month/year (local time). */
function closedInMonth(t: TaskRow, year: number, month: number): boolean {
  const d = t.closedDate;
  if (!d) return false;
  return d.getFullYear() === year && d.getMonth() + 1 === month;
}

/** On time = closed on or before the end of the deadline day. */
function wasOnTime(t: TaskRow): boolean {
  if (!t.deadline || !t.closedDate) return false;
  const endOfDeadline = new Date(t.deadline);
  endOfDeadline.setHours(23, 59, 59, 999);
  return t.closedDate.getTime() <= endOfDeadline.getTime();
}

/**
 * Compute one person's KPI scorecard for a given month (1-based).
 * Defaults to the current calendar month.
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

  const createdDone = tasks.filter(
    (t) => t.createdByPersonId === personId && isDone(t.status) && closedInMonth(t, y, m),
  ).length;

  const involvedDoneTasks = tasks.filter(
    (t) => isInvolved(t, personId) && isDone(t.status) && closedInMonth(t, y, m),
  );
  const involvedDone = involvedDoneTasks.length;
  const ledDone = involvedDoneTasks.filter((t) => t.leadIds.includes(personId)).length;

  const withDeadline = involvedDoneTasks.filter((t) => t.deadline);
  const onTimeCount = withDeadline.filter(wasOnTime).length;
  const lateCount = withDeadline.length - onTimeCount;
  const onTimeRate = withDeadline.length === 0 ? null : onTimeCount / withDeadline.length;

  const involvedOpen = tasks.filter((t) => isInvolved(t, personId) && !isDone(t.status));
  const openInvolved = involvedOpen.length;
  // Overdue penalty respects accountability mode, documented blockers and
  // per-person "my part done" — see carriesOverdue.
  const overdueOpen = involvedOpen.filter(
    (t) => (t.flag === "overdue" || t.flag === "escalate-now") && carriesOverdue(t, personId),
  ).length;

  // Delivery score: completed work weighted by reliability, minus overdue drag.
  // Missing on-time rate (no deadlines) is treated as neutral (1.0) so delivery
  // still counts; the overdue penalty keeps a growing late pile honest.
  const rateFactor = onTimeRate ?? 1;
  const score = Math.round(involvedDone * rateFactor - overdueOpen);

  return {
    personId,
    year: y,
    month: m,
    monthLabel: `${MONTHS[m - 1]} ${y}`,
    createdDone,
    involvedDone,
    ledDone,
    onTimeCount,
    lateCount,
    onTimeRate,
    openInvolved,
    overdueOpen,
    score,
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
    .sort((a, b) => b.score - a.score || b.involvedDone - a.involvedDone);
}

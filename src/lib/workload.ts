import type { TaskRow } from "@/lib/queries";

/**
 * workload.ts — pure, deterministic per-person OPEN-task distribution. No DB, no
 * AI. Feeds both the Insights "Workload" panel and the smart-answer resolver, so
 * they always agree. Derived entirely from the already-memoised getAllTasks()
 * read (owner + assignees), grouped per person — no new heavy query.
 *
 *   open    = a task not Completed/Closed that the person owns or is assigned to
 *   overdue = an open task on them whose deadline is in the past
 *
 * A person carries a task if they are its owner OR one of its assignees; each
 * task counts once per person (owner and assignee dedupe).
 */

export type WorkloadPerson = {
  id: number;
  name: string;
  companyId: number | null;
  companyName: string | null;
  companyAccent: string | null;
  open: number;
  overdue: number;
  /** ≥ mean + the absolute floor AND ≥ 1.5× the mean — a genuine outlier. */
  overloaded: boolean;
};

export type WorkloadSummary = {
  people: WorkloadPerson[]; // heaviest-first, idle (0 open) quiet at the bottom
  totalOpen: number;
  /** Mean open-count over people who carry at least one open task (0 if none). */
  average: number;
  /** Max open-count — drives the share bars. */
  maxOpen: number;
  overloaded: WorkloadPerson[]; // the flagged outliers, heaviest-first
};

/** A person's own task is OPEN when it is neither Completed nor Closed. */
export const isOpenTask = (t: TaskRow): boolean => t.status !== "Completed" && t.status !== "Closed";

/** Imbalance rule: a person is "overloaded" when they sit well above the team —
 *  ≥ 1.5× the mean open-count AND at least mean + 3 (so a small team where the
 *  mean is 1 doesn't flag someone with 2). Both gates must pass. */
export function isOverloaded(open: number, average: number): boolean {
  if (open <= 0 || average <= 0) return false;
  return open >= average * 1.5 && open >= average + 3;
}

export type WorkloadInput = {
  id: number;
  name: string;
  companyId?: number | null;
  companyName?: string | null;
  companyAccent?: string | null;
};

/** Build the workload distribution from the (memoised) task rows + the set of
 *  active people. People with no open tasks are still listed (quiet, at the
 *  bottom) so the operator can see idle capacity. */
export function computeWorkload(rows: TaskRow[], people: WorkloadInput[]): WorkloadSummary {
  const open = new Map<number, number>();
  const overdue = new Map<number, number>();

  for (const t of rows) {
    if (!isOpenTask(t)) continue;
    const isOverdue = t.flag === "overdue" || t.flag === "escalate-now";
    // Everyone on the task carries it once (owner + assignees, deduped).
    const ids = new Set<number>();
    if (t.ownerId != null) ids.add(t.ownerId);
    for (const pid of t.assigneeIds) ids.add(pid);
    for (const pid of ids) {
      open.set(pid, (open.get(pid) ?? 0) + 1);
      if (isOverdue) overdue.set(pid, (overdue.get(pid) ?? 0) + 1);
    }
  }

  const withLoad = people.filter((p) => (open.get(p.id) ?? 0) > 0);
  const totalOpen = withLoad.reduce((s, p) => s + (open.get(p.id) ?? 0), 0);
  const average = withLoad.length ? totalOpen / withLoad.length : 0;

  const built: WorkloadPerson[] = people.map((p) => {
    const o = open.get(p.id) ?? 0;
    return {
      id: p.id,
      name: p.name,
      companyId: p.companyId ?? null,
      companyName: p.companyName ?? null,
      companyAccent: p.companyAccent ?? null,
      open: o,
      overdue: overdue.get(p.id) ?? 0,
      overloaded: isOverloaded(o, average),
    };
  });

  // Heaviest-first; ties broken by more overdue, then name. Idle (0 open) sink
  // to the bottom (their open is 0, so the sort already parks them last).
  built.sort((a, b) => b.open - a.open || b.overdue - a.overdue || a.name.localeCompare(b.name));

  return {
    people: built,
    totalOpen,
    average,
    maxOpen: Math.max(...built.map((p) => p.open), 1),
    overloaded: built.filter((p) => p.overloaded),
  };
}

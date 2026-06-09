import { sb } from "@/db/supabase";
import {
  computeNextDue,
  deadlineFlag,
  daysUntil,
  type CcFlag,
  type ObligationFrequency,
} from "@/lib/command-centre";

/* ------------------------------------------------------------------ */
/* Recurring obligations — the cadence master list (recurring_obligations). */
/* See memory/project_recurring_obligations. Each row is a repeating duty,   */
/* not an instance. Deadlines are derived from the next computed due date.   */
/* ------------------------------------------------------------------ */

export type RecurringObligation = {
  id: number;
  label: string;
  companyId: number | null;
  frequency: ObligationFrequency;
  dueRule: string | null;
  dueDay: number | null;
  category: string;
  why: string | null;
  leadDays: number;
  owner: string | null;
  notes: string | null;
  lastDone: Date | null;
  nextDue: Date | null;
  active: boolean;
  sortOrder: number;
};

type Row = Record<string, unknown>;

function mapRow(r: Row): RecurringObligation {
  return {
    id: r.id as number,
    label: r.label as string,
    companyId: (r.company_id as number | null) ?? null,
    frequency: r.frequency as ObligationFrequency,
    dueRule: (r.due_rule as string | null) ?? null,
    dueDay: (r.due_day as number | null) ?? null,
    category: (r.category as string) ?? "Admin",
    why: (r.why as string | null) ?? null,
    leadDays: (r.lead_days as number) ?? 14,
    owner: (r.owner as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    lastDone: r.last_done ? new Date(r.last_done as string) : null,
    nextDue: r.next_due ? new Date(r.next_due as string) : null,
    active: (r.active as boolean) ?? true,
    sortOrder: (r.sort_order as number) ?? 0,
  };
}

export async function listObligations(): Promise<RecurringObligation[]> {
  const { data } = await sb
    .from("recurring_obligations")
    .select("*")
    .eq("active", true)
    .order("sort_order");
  return (data ?? []).map(mapRow);
}

/** A daily/weekly routine — ticked off in place rather than turned into a task. */
export type Habit = {
  id: number;
  label: string;
  frequency: "daily" | "weekly";
  dueRule: string | null;
  why: string | null;
  lastDone: Date | null;
  /** Whether it's been ticked within its cadence window (1d / 7d). */
  fresh: boolean;
};

/** A dated obligation instance with a derived urgency flag. */
export type Deadline = {
  id: number;
  label: string;
  companyId: number | null;
  frequency: ObligationFrequency;
  category: string;
  why: string | null;
  dueDate: Date | null;
  daysLeft: number | null;
  flag: CcFlag;
  /** Statutory monthly+ items are eligible to be promoted to a task. */
  taskable: boolean;
};

/** Split obligations into in-place habits (daily/weekly) and dated deadlines. */
export function splitObligations(
  obligations: RecurringObligation[],
  today: Date = new Date(),
): { habits: Habit[]; deadlines: Deadline[] } {
  const habits: Habit[] = [];
  const deadlines: Deadline[] = [];

  for (const ob of obligations) {
    if (ob.frequency === "daily" || ob.frequency === "weekly") {
      const windowDays = ob.frequency === "daily" ? 1 : 7;
      const sinceDone = ob.lastDone ? Math.abs(daysUntil(ob.lastDone, today) ?? -999) : Infinity;
      habits.push({
        id: ob.id,
        label: ob.label,
        frequency: ob.frequency,
        dueRule: ob.dueRule,
        why: ob.why,
        lastDone: ob.lastDone,
        fresh: sinceDone <= windowDays,
      });
      continue;
    }
    if (ob.frequency === "event") continue; // event-driven: no date, fired by their trigger flows

    const dueDate = ob.nextDue ?? computeNextDue(ob, today);
    deadlines.push({
      id: ob.id,
      label: ob.label,
      companyId: ob.companyId,
      frequency: ob.frequency,
      category: ob.category,
      why: ob.why,
      dueDate,
      daysLeft: daysUntil(dueDate, today),
      flag: deadlineFlag(dueDate, false, today),
      taskable: ob.frequency === "monthly" || ob.frequency === "quarterly" || ob.frequency === "annual",
    });
  }

  // Soonest first; undated annual anchors (per-entity) sink to the bottom.
  deadlines.sort((a, b) => {
    if (a.daysLeft === null && b.daysLeft === null) return 0;
    if (a.daysLeft === null) return 1;
    if (b.daysLeft === null) return -1;
    return a.daysLeft - b.daysLeft;
  });
  return { habits, deadlines };
}

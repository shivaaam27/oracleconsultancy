import { sb } from "@/db/supabase";
import {
  computeNextDue,
  deadlineFlag,
  daysUntil,
  doneThisPeriod,
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

/* ------------------------------------------------------------------ */
/* Per-company applicability + completion (obligation_company).        */
/* An obligation is a portfolio template; each company applies to it by */
/* default unless opted out, and completes it per period (tick grid).   */
/* ------------------------------------------------------------------ */

export type CompanyLite = { id: number; name: string; accent: string | null; vatRegistered: boolean };

export type CompanyStatus = {
  companyId: number;
  name: string;
  accent: string | null;
  applicable: boolean;
  /** Set when applicability is forced off automatically (not an operator opt-out). */
  autoReason: string | null;
  done: boolean;
};

export type DeadlineWithCompanies = Deadline & {
  companies: CompanyStatus[];
  applicableCount: number;
  doneCount: number;
};

type OcState = { applicable: boolean; lastDone: Date | null };

/** Load the per-(obligation,company) state as a lookup keyed "obId:coId". */
export async function loadObligationCompany(): Promise<Map<string, OcState>> {
  const { data } = await sb.from("obligation_company").select("obligation_id,company_id,applicable,last_done");
  const map = new Map<string, OcState>();
  for (const r of data ?? []) {
    map.set(`${r.obligation_id}:${r.company_id}`, {
      applicable: (r.applicable as boolean) ?? true,
      lastDone: r.last_done ? new Date(r.last_done as string) : null,
    });
  }
  return map;
}

/** An obligation is VAT-specific if its label mentions VAT (only VAT-registered companies apply). */
function isVatObligation(ob: RecurringObligation): boolean {
  return /\bvat\b/i.test(ob.label);
}

/** Build per-company status for one obligation. */
export function companyStatuses(
  ob: RecurringObligation,
  companies: CompanyLite[],
  ocMap: Map<string, OcState>,
  today: Date = new Date(),
): CompanyStatus[] {
  const vat = isVatObligation(ob);
  // A company-scoped obligation (company_id set) only applies to that company.
  const scoped = ob.companyId != null;
  return companies
    .filter((c) => !scoped || c.id === ob.companyId)
    .map((c) => {
      const oc = ocMap.get(`${ob.id}:${c.id}`);
      let applicable = oc?.applicable ?? true;
      let autoReason: string | null = null;
      if (vat && !c.vatRegistered) {
        applicable = false;
        autoReason = "Not VAT-registered";
      }
      return {
        companyId: c.id,
        name: c.name,
        accent: c.accent,
        applicable,
        autoReason,
        done: doneThisPeriod(ob.frequency, oc?.lastDone ?? null, today),
      };
    });
}

/** Dated deadlines enriched with per-company applicability + completion. */
export function buildDeadlinesWithCompanies(
  obligations: RecurringObligation[],
  companies: CompanyLite[],
  ocMap: Map<string, OcState>,
  today: Date = new Date(),
): DeadlineWithCompanies[] {
  const { deadlines } = splitObligations(obligations, today);
  const byId = new Map(obligations.map((o) => [o.id, o]));
  return deadlines.map((d) => {
    const ob = byId.get(d.id)!;
    const companyList = companyStatuses(ob, companies, ocMap, today);
    const applicable = companyList.filter((c) => c.applicable);
    return {
      ...d,
      companies: companyList,
      applicableCount: applicable.length,
      doneCount: applicable.filter((c) => c.done).length,
    };
  });
}

/**
 * Self-contained: dated obligations inside their warning window that still have
 * at least one applicable company NOT done this period. Loads companies +
 * obligation_company itself so call sites (Home, Brief) stay one line and share
 * exactly the same definition of "outstanding". Soonest first.
 */
export async function outstandingDeadlines(
  obligations: RecurringObligation[],
  today: Date = new Date(),
): Promise<DeadlineWithCompanies[]> {
  const [{ data: companiesRaw }, ocMap] = await Promise.all([
    sb.from("companies").select("id,name,accent_color,vrn").eq("active", true).order("name"),
    loadObligationCompany(),
  ]);
  const companies: CompanyLite[] = (companiesRaw ?? []).map((c) => ({
    id: c.id as number,
    name: c.name as string,
    accent: (c.accent_color as string | null) ?? null,
    vatRegistered: !!(c.vrn as string | null),
  }));
  return buildDeadlinesWithCompanies(obligations, companies, ocMap, today)
    .filter((d) => (d.flag === "overdue" || d.flag === "dueNow" || d.flag === "soon")
      && d.applicableCount > 0 && d.doneCount < d.applicableCount);
}

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

// Portfolio flowchart — pure helpers (client-safe, no server imports).
// Turns the flat people list into a multi-parent layered graph: each person can
// have a primary boss (manager_id, solid line) AND extra bosses (reporting_lines,
// dashed lines). Levels are assigned by role/seniority so the chart reads as a
// classic org chart (Directors top, Managers + shared-service heads next,
// employees below). The actual layered layout is computed by ELK in org-flow.tsx.

export type FlowPerson = {
  id: number;
  name: string;
  role: string | null;
  personType: string;
  staffCategory: string | null;
  companyId: number | null;
  companyName: string | null;
  accentColor: string | null;
  /** Primary boss (solid line) — null for the top of a chain. */
  managerId: number | null;
  /** Extra bosses this person also reports to (dashed lines). */
  secondary: number[];
};

const DIRECTOR_RE = /\b(director|ceo|chief executive|owner|chair(man|person)?|managing director|founder|partner|principal)\b/i;
const MANAGER_RE = /\b(manager|head|lead|chief|officer|cfo|coo|cto|c[a-z]o|supervisor|co-?ordinator|controller|in[- ]?charge)\b/i;

export type Tier = 0 | 1 | 2;
export const TIER_LABELS: Record<Tier, string> = {
  0: "Leadership",
  1: "Managers & shared services",
  2: "Team",
};

/**
 * Decide a person's level (row) by role/seniority. `hasReports` = someone lists
 * this person as their primary manager (so they manage at least one person).
 */
export function personTier(p: FlowPerson, hasReports: boolean): Tier {
  const cat = (p.staffCategory || "").toLowerCase();
  if (cat === "director") return 0;
  if (cat === "manager" || cat === "admin_hr") return 1;
  const role = p.role || "";
  if (DIRECTOR_RE.test(role)) return 0;
  if (MANAGER_RE.test(role) || hasReports) return 1;
  return 2;
}

/** Ids that are someone's PRIMARY manager (i.e. they manage at least one person). */
export function managerIdSet(people: FlowPerson[]): Set<number> {
  const s = new Set<number>();
  for (const p of people) if (p.managerId != null) s.add(p.managerId);
  return s;
}

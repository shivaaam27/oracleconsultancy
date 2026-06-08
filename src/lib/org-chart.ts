// Organogram — pure tree-building logic (client-safe, no server imports).
// Turns the flat people list into per-company reporting trees, using
// people.manager_id as the solid (primary) line. Secondary/dotted-line
// managers ride along on each node for the chart to overlay.
import type { Person, PersonType } from "./people-queries";

export type OrgNode = {
  id: number;
  name: string;
  role: string | null;
  personType: PersonType;
  departmentName: string | null;
  /** Primary manager (solid line) — null for roots. */
  managerId: number | null;
  /** Additional dotted-line managers this person also reports to. */
  secondaryManagers: Array<{ id: number; name: string | null }>;
  /** Count of open tasks this person carries (badge on the node). */
  openTasks: number;
  children: OrgNode[];
};

/** Input shape — Person, optionally carrying workload (for the task badge). */
type PersonWithWorkload = Person & { workload?: { open: number } };

export type CompanyTree = {
  /** Top of an in-company hierarchy: people who have reports but aren't
   *  themselves someone's in-company report. */
  roots: OrgNode[];
  /** People with no place in an in-company hierarchy (no in-company reports
   *  and not reporting to anyone inside the company). */
  unassigned: OrgNode[];
  total: number;
  withManager: number;
};

function toNode(p: PersonWithWorkload): OrgNode {
  return {
    id: p.id,
    name: p.name,
    role: p.role,
    personType: p.personType,
    departmentName: p.departmentName,
    managerId: p.managerId,
    secondaryManagers: p.secondaryManagers ?? [],
    openTasks: p.workload?.open ?? 0,
    children: [],
  };
}

/**
 * Build the reporting tree for a single company from the full people list.
 *
 * A person belongs to the company via `companyId`. They nest under their
 * primary manager **only if that manager is also in this company**. After
 * nesting, the top level splits in two: a "root" is anyone with in-company
 * reports (the real top of a hierarchy); everyone else with no in-company
 * position — whether they have no manager, or a manager who works elsewhere —
 * is listed as "unassigned" so the chart never invents a hierarchy.
 *
 * Cycle-safe: if manager links form a loop, the offending link is dropped.
 */
export function buildCompanyTree(people: PersonWithWorkload[], companyId: number): CompanyTree {
  const members = people.filter((p) => p.active && p.companyId === companyId);
  const memberIds = new Set(members.map((m) => m.id));
  const nodes = new Map<number, OrgNode>(members.map((m) => [m.id, toNode(m)]));

  let withManager = 0;
  const nestedIds = new Set<number>(); // people placed under an in-company manager

  // Pass 1 — nest each person under their in-company primary manager.
  for (const m of members) {
    const mgrId = m.managerId;
    if (mgrId != null) withManager++;
    const mgrInCompany = mgrId != null && memberIds.has(mgrId) && mgrId !== m.id;
    if (mgrInCompany && !createsCycle(nodes, m.id, mgrId!)) {
      nodes.get(mgrId!)!.children.push(nodes.get(m.id)!);
      nestedIds.add(m.id);
    }
  }

  // Pass 2 — partition the top level: has reports → root, else → unassigned.
  const roots: OrgNode[] = [];
  const unassigned: OrgNode[] = [];
  for (const m of members) {
    if (nestedIds.has(m.id)) continue;
    const node = nodes.get(m.id)!;
    (node.children.length > 0 ? roots : unassigned).push(node);
  }

  const byName = (a: OrgNode, b: OrgNode) => a.name.localeCompare(b.name);
  const sortDeep = (n: OrgNode) => { n.children.sort(byName); n.children.forEach(sortDeep); };
  roots.sort(byName); roots.forEach(sortDeep);
  unassigned.sort(byName);

  return { roots, unassigned, total: members.length, withManager };
}

/** Would making `managerId` the parent of `personId` create a cycle? */
function createsCycle(nodes: Map<number, OrgNode>, personId: number, managerId: number): boolean {
  let cursor: number | null = managerId;
  const seen = new Set<number>();
  while (cursor != null) {
    if (cursor === personId) return true;
    if (seen.has(cursor)) return true;
    seen.add(cursor);
    cursor = nodes.get(cursor)?.managerId ?? null;
  }
  return false;
}

/** Count every node in a list of trees (for headcount labels). */
export function countNodes(roots: OrgNode[]): number {
  return roots.reduce((sum, n) => sum + 1 + countNodes(n.children), 0);
}

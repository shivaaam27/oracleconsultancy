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
  children: OrgNode[];
};

export type CompanyTree = {
  /** People whose primary manager sits inside this company (proper tree). */
  roots: OrgNode[];
  /** Active people in the company with no manager set at all. */
  unassigned: OrgNode[];
  total: number;
  withManager: number;
};

function toNode(p: Person): OrgNode {
  return {
    id: p.id,
    name: p.name,
    role: p.role,
    personType: p.personType,
    departmentName: p.departmentName,
    managerId: p.managerId,
    secondaryManagers: p.secondaryManagers ?? [],
    children: [],
  };
}

/**
 * Build the reporting tree for a single company from the full people list.
 *
 * A person belongs to the company via `companyId`. Their parent is their
 * primary manager **only if that manager is also in this company** — otherwise
 * they surface as a root (their line leads outside, e.g. to a group director).
 * People with no manager at all are listed separately as "unassigned" so the
 * chart doesn't pretend they sit at the top of a hierarchy.
 *
 * Cycle-safe: if manager links form a loop, the offending link is dropped and
 * the person becomes a root rather than vanishing.
 */
export function buildCompanyTree(people: Person[], companyId: number): CompanyTree {
  const members = people.filter((p) => p.active && p.companyId === companyId);
  const memberIds = new Set(members.map((m) => m.id));
  const nodes = new Map<number, OrgNode>(members.map((m) => [m.id, toNode(m)]));

  const roots: OrgNode[] = [];
  const unassigned: OrgNode[] = [];
  let withManager = 0;

  for (const m of members) {
    const node = nodes.get(m.id)!;
    const mgrId = m.managerId;
    const mgrInCompany = mgrId != null && memberIds.has(mgrId) && mgrId !== m.id;

    if (mgrId != null) withManager++;

    if (mgrInCompany && !createsCycle(nodes, m.id, mgrId!)) {
      nodes.get(mgrId!)!.children.push(node);
    } else if (mgrId == null) {
      unassigned.push(node);
    } else {
      // Manager is outside this company (or a cycle) → this person heads a branch.
      roots.push(node);
    }
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

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
  departmentId: number | null;
  departmentName: string | null;
  /** The node's own company (used by the portfolio tree, which spans companies). */
  companyName: string | null;
  companyAccent: string | null;
  /** Primary manager (solid line) — null for roots. */
  managerId: number | null;
  /** Primary manager's name + company, for annotating cross-company lines. */
  managerName: string | null;
  managerCompanyName: string | null;
  /** True when the primary manager works in a *different* company, so the
   *  reporting line can't be drawn in this company's tree — we annotate instead. */
  reportsOutOfCompany: boolean;
  /** Additional dotted-line managers this person also reports to. */
  secondaryManagers: Array<{ id: number; name: string | null }>;
  /** Contact handles for the card's quick actions. */
  whatsapp: string | null;
  phone: string | null;
  email: string | null;
  preferredChannel: string | null;
  children: OrgNode[];
};

export type CompanyTree = {
  /** Top of an in-company hierarchy: people who have reports but aren't
   *  themselves someone's in-company report. */
  roots: OrgNode[];
  /** People with no place in an in-company hierarchy (no in-company reports
   *  and not reporting to anyone inside the company). */
  unassigned: OrgNode[];
  total: number;
  /** People with any primary manager set (in or out of company). */
  withManager: number;
  /** People nested under an in-company manager (the lines the tree can draw). */
  linesInTree: number;
  /** People whose primary manager works in another company (drawn as annotation). */
  reportingOut: number;
};

function toNode(p: Person, managerName: string | null, managerCompanyName: string | null, reportsOutOfCompany: boolean, companyAccent: string | null = null): OrgNode {
  return {
    id: p.id,
    name: p.name,
    role: p.role,
    personType: p.personType,
    departmentId: p.departmentId,
    departmentName: p.departmentName,
    companyName: p.companyName,
    companyAccent,
    managerId: p.managerId,
    managerName,
    managerCompanyName,
    reportsOutOfCompany,
    secondaryManagers: p.secondaryManagers ?? [],
    whatsapp: p.whatsapp,
    phone: p.phone,
    email: p.email,
    preferredChannel: p.preferredChannel,
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
export function buildCompanyTree(people: Person[], companyId: number): CompanyTree {
  // Look up any person (incl. those in other companies) to resolve a manager's
  // name + home company for cross-company annotations.
  const personById = new Map(people.map((p) => [p.id, p]));
  const members = people.filter((p) => p.active && p.companyId === companyId);
  const memberIds = new Set(members.map((m) => m.id));
  const nodes = new Map<number, OrgNode>(
    members.map((m) => {
      const mgr = m.managerId != null ? personById.get(m.managerId) : undefined;
      const reportsOut = m.managerId != null && (!mgr || mgr.companyId !== companyId);
      return [m.id, toNode(m, mgr?.name ?? m.managerName ?? null, reportsOut ? mgr?.companyName ?? null : null, !!reportsOut)];
    })
  );

  let withManager = 0;
  let reportingOut = 0;
  const nestedIds = new Set<number>(); // people placed under an in-company manager

  // Pass 1 — nest each person under their in-company primary manager.
  for (const m of members) {
    const mgrId = m.managerId;
    if (mgrId != null) withManager++;
    const mgrInCompany = mgrId != null && memberIds.has(mgrId) && mgrId !== m.id;
    if (mgrInCompany && !createsCycle(nodes, m.id, mgrId!)) {
      nodes.get(mgrId!)!.children.push(nodes.get(m.id)!);
      nestedIds.add(m.id);
    } else if (mgrId != null) {
      reportingOut++;
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

  return { roots, unassigned, total: members.length, withManager, linesInTree: nestedIds.size, reportingOut };
}

/**
 * Build ONE reporting tree across the whole portfolio, nesting by primary
 * manager regardless of company — the real chain of command (everyone up to
 * the owner). Each node carries its own company name/accent so the chart can
 * colour mixed-company branches. Cycle-safe.
 */
export function buildPortfolioTree(people: Person[], accentById?: Map<number, string | null>): CompanyTree {
  const active = people.filter((p) => p.active);
  const ids = new Set(active.map((p) => p.id));
  const personById = new Map(active.map((p) => [p.id, p]));
  const nodes = new Map<number, OrgNode>(
    active.map((m) => {
      const mgr = m.managerId != null ? personById.get(m.managerId) : undefined;
      const accent = m.companyId != null ? accentById?.get(m.companyId) ?? null : null;
      return [m.id, toNode(m, mgr?.name ?? m.managerName ?? null, null, false, accent)];
    })
  );

  let withManager = 0;
  const nestedIds = new Set<number>();
  for (const m of active) {
    const mgrId = m.managerId;
    if (mgrId != null) withManager++;
    if (mgrId != null && ids.has(mgrId) && mgrId !== m.id && !createsCycle(nodes, m.id, mgrId)) {
      nodes.get(mgrId)!.children.push(nodes.get(m.id)!);
      nestedIds.add(m.id);
    }
  }

  const roots: OrgNode[] = [];
  const unassigned: OrgNode[] = [];
  for (const m of active) {
    if (nestedIds.has(m.id)) continue;
    const node = nodes.get(m.id)!;
    (node.children.length > 0 ? roots : unassigned).push(node);
  }

  const byName = (a: OrgNode, b: OrgNode) => a.name.localeCompare(b.name);
  const sortDeep = (n: OrgNode) => { n.children.sort(byName); n.children.forEach(sortDeep); };
  roots.sort(byName); roots.forEach(sortDeep);
  unassigned.sort(byName);

  return { roots, unassigned, total: active.length, withManager, linesInTree: nestedIds.size, reportingOut: 0 };
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

/**
 * Would setting `managerId` as `personId`'s primary manager create a reporting
 * loop? Walks the EXISTING primary-manager chain (a map of person → their
 * current primary manager) up from the proposed manager; if it reaches the
 * person, the line would close a cycle. Used by the write paths so a loop is
 * rejected up-front with a clear message rather than silently dropped at render.
 */
export function wouldCreateReportingCycle(
  primaryManagerOf: Map<number, number | null>,
  personId: number,
  managerId: number,
): boolean {
  if (managerId === personId) return true;
  let cursor: number | null = managerId;
  const seen = new Set<number>();
  while (cursor != null) {
    if (cursor === personId) return true;
    if (seen.has(cursor)) return true;
    seen.add(cursor);
    cursor = primaryManagerOf.get(cursor) ?? null;
  }
  return false;
}

/** Count every node in a list of trees (for headcount labels). */
export function countNodes(roots: OrgNode[]): number {
  return roots.reduce((sum, n) => sum + 1 + countNodes(n.children), 0);
}

import "server-only";

import { sb } from "@/db/supabase";
import { escapeLike } from "@/lib/db-helpers";
import {
  getPortalPerson,
  seesAllCompanies,
  isScopedDirector,
  colleagueCompanyScope,
  commandCentrePersonIds,
  managerTeamIds,
  visibleTaskIds,
  type PortalPerson,
} from "@/lib/portal-auth";
import { getPersonCompaniesMap } from "@/lib/people-queries";

/* ------------------------------------------------------------------ *
 * Scoped portal search CORE (Ctrl+K / ⌘K).
 *
 * SECURITY: this is the ONLY data path for the portal search overlay.
 * Every result is re-scoped server-side to what the signed-in person is
 * ALREADY allowed to see — exactly the same scope rules the rest of the
 * portal enforces (visibleTaskIds for tasks, the directory's company-set
 * intersection for people). It can never surface another company's or
 * another person's private data, and it never throws to the client.
 *
 * This is a PLAIN server lib (NOT "use server"): it is called from the
 * lightweight Route Handler /api/portal/search so a keystroke never
 * re-renders the (force-dynamic) portal page that a server action would.
 *
 * This wave: tasks + people only. No documents, governance, facts,
 * meetings, company detail or anything admin-only.
 * ------------------------------------------------------------------ */

export type PortalSearchTask = {
  code: string;
  actionItem: string;
  companyName: string | null;
  status: string;
};

export type PortalSearchPerson = {
  id: number;
  name: string;
  role: string | null;
  company: string | null;
  /** Staff get false → the row links to contact only, not the profile page. */
  canOpenProfile: boolean;
};

export type PortalSearchResult = {
  tasks: PortalSearchTask[];
  people: PortalSearchPerson[];
};

const EMPTY: PortalSearchResult = { tasks: [], people: [] };
const TASK_CAP = 8;
const PEOPLE_CAP = 8;

/** Build a safe ilike pattern from a raw query. Two layers of guarding:
 *   1. Strip characters that would corrupt a PostgREST `.or()` filter string
 *      (comma, parentheses, dot) — these are structural separators there.
 *   2. escapeLike the remainder so LIKE metacharacters (% _ \) match literally.
 *  The result can never broaden the search beyond what the viewer typed, nor
 *  break the query (which would otherwise leak an error or an unscoped result). */
function safePattern(q: string): string {
  const stripped = q.replace(/[(),.]/g, " ").replace(/\s+/g, " ").trim();
  return `%${escapeLike(stripped)}%`;
}

export async function runPortalSearch(query: string): Promise<PortalSearchResult> {
  // Never throw to the client — a blip just shows "no results".
  try {
    const me = await getPortalPerson();
    if (!me) return EMPTY;

    const q = (query ?? "").trim();
    if (q.length < 1) return EMPTY;

    const pattern = safePattern(q);
    // Nothing usable left after stripping structural characters → no results.
    if (pattern === "%%") return EMPTY;
    // Normalised needle for the in-memory people filter — same shape as the DB
    // pattern (punctuation stripped, collapsed whitespace) so the two agree.
    const ql = q.replace(/[(),.]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();

    const [tasks, people] = await Promise.all([
      searchTasks(me, pattern),
      searchPeople(me, pattern, ql),
    ]);

    return { tasks, people };
  } catch {
    return EMPTY;
  }
}

/** TASKS — scoped to the viewer's visible set, matched against task code +
 *  action_item (case-insensitive).
 *
 *  OPTIMISATION: a group-wide viewer (director/HR) can see EVERY non-archived
 *  task, so there is no point materialising the full id list with
 *  visibleTaskIds() and then re-querying `.in("id", [huge list])`. We query the
 *  tasks table directly, filtered to archived=false + the ilike — same result
 *  set, one cheap query. Non-group-wide viewers keep the existing
 *  visibleTaskIds() path (their visible set is genuinely a bounded subset). */
async function searchTasks(
  me: PortalPerson,
  pattern: string
): Promise<PortalSearchTask[]> {
  let queryBuilder = sb
    .from("tasks")
    .select("code,action_item,status,companies(name)")
    .eq("archived", false)
    .or(`code.ilike.${pattern},action_item.ilike.${pattern}`)
    .order("last_updated_at", { ascending: false, nullsFirst: false })
    .limit(TASK_CAP);

  if (!seesAllCompanies(me)) {
    // Non-all-companies viewers (managers, staff, AND company-scoped directors) are
    // bounded by their visible set — for a scoped director that's their one company.
    const ids = await visibleTaskIds(me);
    if (ids.length === 0) return [];
    queryBuilder = queryBuilder.in("id", ids);
  }

  const { data } = await queryBuilder;

  return (data ?? []).map((t) => {
    const company = (Array.isArray(t.companies) ? t.companies[0] : t.companies) as { name: string } | null;
    return {
      code: t.code as string,
      actionItem: t.action_item as string,
      companyName: company?.name ?? null,
      status: t.status as string,
    };
  });
}

/** PEOPLE — only people the viewer may see.
 *  director/HR (group-wide) → any active person.
 *  manager/staff → people whose company set intersects myCompanyIds(me)
 *    (via getPersonCompaniesMap, to include multi-company colleagues —
 *    mirrors the directory).
 *  Match name / role / company. canOpenProfile mirrors personCanSeePerson(me, id). */
async function searchPeople(
  me: PortalPerson,
  pattern: string,
  ql: string
): Promise<PortalSearchPerson[]> {
  const groupWide = seesAllCompanies(me);

  // Build the id allow-list for non-all-companies viewers BEFORE any read, so we
  // can never accidentally return a colleague outside the viewer's company scope.
  // Scope = the companies the viewer BELONGS to (colleague contact scope): scoped
  // director → their one company, manager/staff → their memberships. (NOT plain
  // `companyScope`, which is governance-only and returns [] for staff — that made
  // the directory + people search empty for staff.)
  let allowedIds: Set<number> | null = null;
  if (!groupWide) {
    const cids = (await colleagueCompanyScope(me)) ?? [];
    // An unscoped viewer (no company at all) sees nobody but themselves.
    const cidSet = new Set(cids);
    const map = await getPersonCompaniesMap();
    allowedIds = new Set<number>();
    if (cids.length > 0) {
      for (const [pid, theirCids] of map.entries()) {
        if (theirCids.some((c) => cidSet.has(c))) allowedIds.add(pid);
      }
    }
    // The viewer can always find themselves + the universal Command Centre contact.
    allowedIds.add(me.id);
    for (const id of await commandCentrePersonIds()) allowedIds.add(id);
    if (allowedIds.size === 0) return [];
  }

  // canOpenProfile allow-set — computed ONCE here (no per-row DB query), mirroring
  // personCanSeePerson exactly:
  //   • group-wide  → every active person in the result is openable (all result
  //     rows are active=true, so we can return true without a per-row read).
  //   • manager     → managerTeamIds(me) (direct reports + company colleagues),
  //     PLUS self.
  //   • staff       → self only.
  // NB: the manager team set is DISTINCT from the people allow-list above (that
  // one is a company-set intersection for who appears at all); canOpenProfile
  // must use managerTeamIds to keep the original personCanSeePerson semantics.
  let openableIds: Set<number> | null = null;
  if (!groupWide) {
    openableIds = new Set<number>();
    if (isScopedDirector(me)) {
      // A company director has full rights over their company → may open any
      // in-scope profile (mirrors personCanSeePerson for a scoped director).
      for (const id of allowedIds!) openableIds.add(id);
    } else if (me.portalRole === "manager") {
      for (const id of await managerTeamIds(me)) openableIds.add(id);
    }
    openableIds.add(me.id); // self is always openable
  }
  const canOpen = (id: number): boolean =>
    groupWide ? true : openableIds!.has(id);

  // Match name / role on the DB (case-insensitive, escaped). Company name lives
  // on the join, so we also keep rows whose company name contains the query —
  // filtered in memory after the read. We over-fetch a little, then cap.
  let queryBuilder = sb
    .from("people")
    .select("id,name,role,company_id,companies!company_id(name)")
    .eq("active", true)
    .or(`name.ilike.${pattern},role.ilike.${pattern}`)
    .order("name")
    .limit(PEOPLE_CAP * 3);

  if (!groupWide) {
    // .in([]) returns nothing — exactly right for an unscoped viewer.
    queryBuilder = queryBuilder.in("id", [...allowedIds!]);
  }

  const { data } = await queryBuilder;

  // Company-name matches: a separate scoped read so "Dar Spices" finds people in
  // that company even when their name/role don't contain the query. We resolve
  // matching company ids first (avoids PostgREST's fragile embedded-column
  // filtering), then read people in those companies — still scoped to the
  // viewer's allow-list for non-group-wide roles.
  let byCompany: typeof data = [];
  {
    const { data: matchCompanies } = await sb
      .from("companies")
      .select("id")
      .ilike("name", pattern)
      .limit(20);
    const matchCompanyIds = (matchCompanies ?? []).map((c) => c.id as number);
    if (matchCompanyIds.length > 0) {
      let cQuery = sb
        .from("people")
        .select("id,name,role,company_id,companies!company_id(name)")
        .eq("active", true)
        .in("company_id", matchCompanyIds)
        .order("name")
        .limit(PEOPLE_CAP * 3);
      if (!groupWide) cQuery = cQuery.in("id", [...allowedIds!]);
      const { data: cData } = await cQuery;
      byCompany = cData ?? [];
    }
  }

  // Merge + dedupe by id, keep only rows whose name/role/company actually match
  // (the company-join read above can return null companies through the embed).
  const seen = new Set<number>();
  const merged: NonNullable<typeof data> = [];
  for (const r of [...(data ?? []), ...byCompany]) {
    const id = r.id as number;
    if (seen.has(id)) continue;
    const company = (Array.isArray(r.companies) ? r.companies[0] : r.companies) as { name: string } | null;
    const hay = `${r.name ?? ""} ${r.role ?? ""} ${company?.name ?? ""}`.toLowerCase();
    if (!hay.includes(ql)) continue;
    seen.add(id);
    merged.push(r);
  }

  const top = merged.slice(0, PEOPLE_CAP);

  // canOpenProfile per person — resolved in memory from the pre-computed allow-set
  // (self / group-wide / manager-team). Staff get false everywhere but themselves.
  return top.map((r) => {
    const id = r.id as number;
    const company = (Array.isArray(r.companies) ? r.companies[0] : r.companies) as { name: string } | null;
    return {
      id,
      name: r.name as string,
      role: (r.role as string | null) ?? null,
      company: company?.name ?? null,
      canOpenProfile: canOpen(id),
    };
  });
}

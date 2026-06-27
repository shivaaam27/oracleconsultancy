"use server";

import { sb } from "@/db/supabase";
import { escapeLike } from "@/lib/db-helpers";
import {
  getPortalPerson,
  isGroupWide,
  myCompanyIds,
  personCanSeePerson,
  visibleTaskIds,
} from "@/lib/portal-auth";
import { getPersonCompaniesMap } from "@/lib/people-queries";

/* ------------------------------------------------------------------ *
 * Scoped portal search (Ctrl+K / ⌘K).
 *
 * SECURITY: this is the ONLY data path for the portal search overlay.
 * Every result is re-scoped server-side to what the signed-in person is
 * ALREADY allowed to see — exactly the same scope rules the rest of the
 * portal enforces (visibleTaskIds for tasks, the directory's company-set
 * intersection for people). It can never surface another company's or
 * another person's private data, and it never throws to the client.
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

export async function portalSearch(query: string): Promise<PortalSearchResult> {
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

/** TASKS — only ids from visibleTaskIds(me) (already multi-company-aware).
 *  Match the query against task code + action_item (case-insensitive). */
async function searchTasks(
  me: NonNullable<Awaited<ReturnType<typeof getPortalPerson>>>,
  pattern: string
): Promise<PortalSearchTask[]> {
  const ids = await visibleTaskIds(me);
  if (ids.length === 0) return [];

  const { data } = await sb
    .from("tasks")
    .select("code,action_item,status,companies(name)")
    .in("id", ids)
    .eq("archived", false)
    .or(`code.ilike.${pattern},action_item.ilike.${pattern}`)
    .order("last_updated_at", { ascending: false, nullsFirst: false })
    .limit(TASK_CAP);

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
 *  Match name / role / company. canOpenProfile = personCanSeePerson(me, id). */
async function searchPeople(
  me: NonNullable<Awaited<ReturnType<typeof getPortalPerson>>>,
  pattern: string,
  ql: string
): Promise<PortalSearchPerson[]> {
  const groupWide = isGroupWide(me.portalRole);

  // Build the id allow-list for non-group-wide viewers BEFORE any read, so we
  // can never accidentally return a colleague outside the viewer's companies.
  let allowedIds: Set<number> | null = null;
  if (!groupWide) {
    const cids = await myCompanyIds(me);
    // An unscoped viewer (no company at all) sees nobody but themselves.
    const cidSet = new Set(cids);
    const map = await getPersonCompaniesMap();
    allowedIds = new Set<number>();
    if (cids.length > 0) {
      for (const [pid, theirCids] of map.entries()) {
        if (theirCids.some((c) => cidSet.has(c))) allowedIds.add(pid);
      }
    }
    // The viewer can always find themselves.
    allowedIds.add(me.id);
    if (allowedIds.size === 0) return [];
  }

  // Match name / role on the DB (case-insensitive, escaped). Company name lives
  // on the join, so we also keep rows whose company name contains the query —
  // filtered in memory after the read. We over-fetch a little, then cap.
  let queryBuilder = sb
    .from("people")
    .select("id,name,role,company_id,companies(name)")
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
        .select("id,name,role,company_id,companies(name)")
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

  // canOpenProfile per person — re-checks scope server-side (self/group-wide/
  // manager-team). Staff get false everywhere but themselves.
  const out = await Promise.all(
    top.map(async (r) => {
      const id = r.id as number;
      const company = (Array.isArray(r.companies) ? r.companies[0] : r.companies) as { name: string } | null;
      return {
        id,
        name: r.name as string,
        role: (r.role as string | null) ?? null,
        company: company?.name ?? null,
        canOpenProfile: await personCanSeePerson(me, id),
      };
    })
  );

  return out;
}

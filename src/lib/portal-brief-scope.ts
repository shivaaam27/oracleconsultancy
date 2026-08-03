import "server-only";
import { sb } from "@/db/supabase";
import { companyScope, type PortalPerson } from "@/lib/portal-auth";
import { parseBriefIdList, type BriefPersonRole } from "@/lib/brief-links";

/**
 * Scope guard for the portal's Director Brief.
 *
 * Everything a portal user may narrow the brief by is resolved HERE, against
 * their own scope — never from the query string alone. A company-scoped
 * director (four of the five directors are locked to one company) must not be
 * able to widen the report by hand-editing a link, nor see the names of staff
 * at companies they have no business seeing.
 *
 * Company scope routes through `companyScope` per the forward rule in
 * CLAUDE.md — never a raw `=== "director"` check.
 */

/** Portal roles left OUT of the director's person filter. Kept as a role rule
 *  rather than a hard-coded name so a second receptionist behaves the same. */
const EXCLUDED_PORTAL_ROLES = new Set(["receptionist"]);

export type PortalBriefOptions = {
  /** Companies this person may filter by (empty = the picker is pointless). */
  companies: Array<{ id: number; name: string; accent: string | null }>;
  /** Active people inside those companies only. */
  people: Array<{ id: number; name: string }>;
};

/** The company ids this person may see, or null for the whole portfolio. */
async function scopeIds(me: PortalPerson): Promise<number[] | null> {
  return await companyScope(me);
}

/** Companies + people a portal person may narrow their brief by. */
export async function portalBriefOptions(me: PortalPerson): Promise<PortalBriefOptions> {
  const scope = await scopeIds(me);

  let companyQuery = sb.from("companies").select("id,name,accent_color").eq("active", true).order("name");
  if (scope) companyQuery = companyQuery.in("id", scope.length ? scope : [-1]);
  const { data: companyRows } = await companyQuery;
  const companies = (companyRows ?? []).map((c) => ({
    id: c.id as number,
    name: c.name as string,
    accent: (c.accent_color as string | null) ?? null,
  }));

  // People are limited to the companies in scope. Membership is checked through
  // person_companies as well as people.company_id, so someone attached to a
  // scoped company but "based" elsewhere still appears.
  let allowedPeopleIds: Set<number> | null = null;
  if (scope) {
    const ids = scope.length ? scope : [-1];
    const [{ data: links }, { data: primary }] = await Promise.all([
      sb.from("person_companies").select("person_id").in("company_id", ids),
      sb.from("people").select("id").in("company_id", ids),
    ]);
    allowedPeopleIds = new Set([
      ...(links ?? []).map((r) => r.person_id as number),
      ...(primary ?? []).map((r) => r.id as number),
    ]);
  }

  const { data: peopleRows } = await sb
    .from("people")
    .select("id,name,portal_role")
    .eq("active", true)
    .order("name");
  const people = (peopleRows ?? [])
    .filter((p) => p.name && (allowedPeopleIds == null || allowedPeopleIds.has(p.id as number)))
    // Front-desk staff aren't part of what a director tracks work against, so
    // they're kept out of this picker (admin's own /brief list is unchanged).
    .filter((p) => !EXCLUDED_PORTAL_ROLES.has((p.portal_role as string | null) ?? ""))
    .map((p) => ({ id: p.id as number, name: p.name as string }));

  return { companies, people };
}

export type PortalBriefFilters = {
  /** null = every company in their scope; else the allowed subset they chose. */
  companyId: number | number[] | null;
  personId: number[];
  personRole: BriefPersonRole | null;
};

/**
 * Resolve requested filters against what this person is actually allowed.
 * A company outside their scope, or a person outside it, is DROPPED rather
 * than honoured — the report silently falls back to their full scope instead
 * of leaking, and never errors.
 */
export async function resolvePortalBriefFilters(
  me: PortalPerson,
  params: URLSearchParams
): Promise<PortalBriefFilters> {
  const scope = await scopeIds(me);
  const options = await portalBriefOptions(me);

  // Keep ONLY the ids this person is allowed — anything else is dropped rather
  // than honoured, so a hand-edited link can never widen the report.
  const allowedCompanies = new Set(options.companies.map((c) => c.id));
  const companies = parseBriefIdList(params.get("co")).filter((id) => allowedCompanies.has(id));

  const allowedPeople = new Set(options.people.map((p) => p.id));
  const people = parseBriefIdList(params.get("who")).filter((id) => allowedPeople.has(id));

  const role = params.get("role");
  return {
    // Their allowed picks, else fall back to their whole scope (null = portfolio
    // for an unrestricted director).
    companyId: companies.length ? companies : scope,
    personId: people,
    // A role qualifier without a person filters nothing, so it's dropped too.
    personRole: people.length && (role === "lead" || role === "working") ? role : null,
  };
}

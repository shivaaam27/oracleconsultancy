// ORI automation AUDIENCE resolver — "who hears this?" for the digest/escalation
// engines. Pure DB reads over people.manager_id, reporting_lines, people.portal_role
// and people.director_company_id. Every helper is BEST-EFFORT: it returns a
// deduped number[] of active person ids and FAILS OPEN to [] on any error, so an
// audience lookup can never abort a rule's fire path.
//
// Kept server-only (imports `sb`); never import this from a client component.

import { sb } from "@/db/supabase";
import { directorScopeOf } from "@/lib/portal-permissions";

const uniq = (ids: (number | null | undefined)[]): number[] =>
  Array.from(new Set(ids.filter((n): n is number => typeof n === "number")));

/** Everyone `personId` reports to: the primary manager (people.manager_id) plus any
 *  secondary / dotted managers (reporting_lines.manager_id). Active managers only. */
export async function managersOf(personId: number): Promise<number[]> {
  try {
    const [{ data: self }, { data: dotted }] = await Promise.all([
      sb.from("people").select("manager_id").eq("id", personId).maybeSingle(),
      sb.from("reporting_lines").select("manager_id").eq("person_id", personId),
    ]);
    const ids = uniq([
      (self as { manager_id?: number | null } | null)?.manager_id ?? null,
      ...((dotted ?? []) as { manager_id: number }[]).map((r) => r.manager_id),
    ]);
    if (!ids.length) return [];
    // Keep only active managers.
    const { data: active } = await sb.from("people").select("id").in("id", ids).eq("active", true);
    return uniq(((active ?? []) as { id: number }[]).map((r) => r.id));
  } catch {
    return [];
  }
}

/** Directors responsible for `companyId`: every active person with
 *  portal_role="director" whose scope covers this company — i.e. a company-scoped
 *  director pinned to it (people.director_company_id), OR a group-wide director
 *  (director_company_id NULL → sees all companies). */
export async function directorsOfCompany(companyId: number): Promise<number[]> {
  try {
    // The scope is the director_companies join table (every company they cover),
    // read through the one reader — the legacy column holds only the FIRST, so a
    // director scoped to TG and VI got no alerts about VI (audit 24 Sept 2026).
    const { data } = await sb
      .from("people")
      .select("id,director_company_id,director_companies(company_id)")
      .eq("active", true)
      .eq("portal_role", "director")
      .not("portal_password_hash", "is", null);
    const rows = (data ?? []) as Parameters<typeof directorScopeOf>[0][] & { id: number }[];
    return uniq(
      rows
        .filter((r) => { const scope = directorScopeOf(r); return scope.length === 0 || scope.includes(companyId); })
        .map((r) => (r as { id: number }).id),
    );
  } catch {
    return [];
  }
}

/** Every active director (portal_role="director"), scoped or group-wide. */
export async function allDirectors(): Promise<number[]> {
  try {
    const { data } = await sb.from("people").select("id").eq("active", true).eq("portal_role", "director");
    return uniq(((data ?? []) as { id: number }[]).map((r) => r.id));
  } catch {
    return [];
  }
}

/** Every active manager (portal_role="manager"). */
export async function allManagers(): Promise<number[]> {
  try {
    const { data } = await sb.from("people").select("id").eq("active", true).eq("portal_role", "manager");
    return uniq(((data ?? []) as { id: number }[]).map((r) => r.id));
  } catch {
    return [];
  }
}

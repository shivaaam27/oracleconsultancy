// ORI automation AUDIENCE resolver — "who hears this?" for the digest/escalation
// engines. Pure DB reads over people.manager_id, reporting_lines, people.portal_role
// and people.director_company_id. Every helper is BEST-EFFORT: it returns a
// deduped number[] of active person ids and FAILS OPEN to [] on any error, so an
// audience lookup can never abort a rule's fire path.
//
// Kept server-only (imports `sb`); never import this from a client component.

import { sb } from "@/db/supabase";

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
    const { data } = await sb
      .from("people")
      .select("id,director_company_id")
      .eq("active", true)
      .eq("portal_role", "director");
    const rows = (data ?? []) as { id: number; director_company_id: number | null }[];
    return uniq(
      rows
        .filter((r) => r.director_company_id == null || r.director_company_id === companyId)
        .map((r) => r.id),
    );
  } catch {
    return [];
  }
}

/** A manager's direct reports: primary line (people.manager_id === managerId) plus
 *  any secondary line (reporting_lines.manager_id === managerId). Active people,
 *  excluding the manager themselves. Mirrors portal-auth's directReportIds. */
export async function teamOf(managerId: number): Promise<number[]> {
  try {
    const [{ data: primary }, { data: dotted }] = await Promise.all([
      sb.from("people").select("id").eq("manager_id", managerId).eq("active", true),
      sb.from("reporting_lines").select("person_id").eq("manager_id", managerId),
    ]);
    return uniq([
      ...((primary ?? []) as { id: number }[]).map((r) => r.id),
      ...((dotted ?? []) as { person_id: number }[]).map((r) => r.person_id),
    ]).filter((id) => id !== managerId);
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

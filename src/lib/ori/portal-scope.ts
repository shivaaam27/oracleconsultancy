import "server-only";

import { sb } from "@/db/supabase";
import {
  seesAllCompanies,
  companyScope,
  visibleTaskIds,
  type PortalPerson,
} from "@/lib/portal-auth";
import type { SearchResult, SearchResultType } from "@/lib/search";

/* ------------------------------------------------------------------ *
 * Portal ORI — scope enforcement for the wider `unifiedSearch` result
 * set (documents, vendors, assets, governance, risk, pipeline,
 * commitments, people, companies).
 *
 * SECURITY MODEL (deliberately COARSE, always SAFE):
 *   • seesAllCompanies(p)  → no filtering (HR / portfolio director).
 *   • scope "companies" / scoped director → keep a result ONLY if we can
 *     positively resolve its owning company AND that company is in
 *     companyScope(p). If the owner can't be determined, EXCLUDE it.
 *   • scope "own" (plain staff) → keep ONLY results the viewer personally
 *     owns: their own person record, documents filed to THEM, and tasks
 *     they're on. Anything company-level or unresolved is EXCLUDED.
 *
 * The filter never widens visibility: when in doubt it drops the row. It
 * is the twin of runPortalSearch (which handles tasks + people precisely);
 * this covers the extra entity types unifiedSearch can return. A result
 * whose ownership we cannot pin to a company (or to the viewer, for staff)
 * is treated as out-of-scope and removed — false negatives (a hidden but
 * permitted doc) are acceptable; a cross-tenant leak is not.
 * ------------------------------------------------------------------ */

/** Owning company_id for a searched entity row, or null when the type/row
 *  has no company (→ caller EXCLUDES it for scoped viewers). One tiny lookup
 *  per type; ids come straight off the SearchResult. */
async function ownerCompanyId(type: SearchResultType, id: number): Promise<number | null> {
  const pick = async (table: string, col = "company_id"): Promise<number | null> => {
    const { data } = await sb.from(table).select(col).eq("id", id).maybeSingle();
    const v = (data as Record<string, unknown> | null)?.[col];
    return typeof v === "number" ? v : null;
  };
  switch (type) {
    case "company":
      return id; // the company IS the owner
    case "person":
      return pick("people");
    case "document":
      return pick("documents");
    case "vendor":
      return pick("vendors");
    case "commitment":
      return pick("commitments");
    case "pipeline":
      return pick("pipeline");
    case "risk":
      return pick("risks");
    case "governance":
      // Mixed governance rows (cap_table / signatories / …) can't be pinned to a
      // company from the id alone without knowing the sub-table → treat as
      // unresolved and EXCLUDE for scoped viewers.
      return null;
    case "asset":
      // Assets link to a person (custodian/holder), not directly a company →
      // unresolved at the company level → EXCLUDE for scoped viewers.
      return null;
    default:
      return null;
  }
}

/** Post-filter unifiedSearch results down to what this portal person may see.
 *  Coarse but safe: unresolved ownership is dropped. See file header. */
export async function scopePortalSearchResults(
  me: PortalPerson,
  results: SearchResult[]
): Promise<SearchResult[]> {
  if (seesAllCompanies(me)) return results;

  // "own" (plain staff): keep only what the viewer personally owns.
  if (me.scopeLevel === "own") {
    const out: SearchResult[] = [];
    // Their own tasks/docs sets, resolved once.
    const myTaskIds = new Set(await visibleTaskIds(me)); // staff → own assignments/owned
    const { data: myDocs } = await sb.from("documents").select("id").eq("person_id", me.id);
    const myDocIds = new Set((myDocs ?? []).map((r) => r.id as number));
    for (const r of results) {
      if (r.type === "person" && r.id === me.id) out.push(r);
      else if (r.type === "document" && myDocIds.has(r.id)) out.push(r);
      // Tasks aren't in unifiedSearch (handled by runPortalSearch), but guard anyway.
      else if ((r.type as string) === "task" && myTaskIds.has(r.id)) out.push(r);
      // Everything else is company/portfolio-level → EXCLUDE for staff.
    }
    return out;
  }

  // "companies" / scoped director: keep results whose owning company is in scope.
  const scope = await companyScope(me); // null = all (already returned above)
  const allowed = new Set(scope ?? []);
  if (allowed.size === 0) return []; // no governed companies → nothing wider is visible

  const out: SearchResult[] = [];
  for (const r of results) {
    const cid = await ownerCompanyId(r.type, r.id);
    if (cid != null && allowed.has(cid)) out.push(r);
    // cid null (unresolved) or out-of-scope → EXCLUDE.
  }
  return out;
}

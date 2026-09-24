import "server-only";

/**
 * The scope rules a director is held to on the shared (Studio) screens — the
 * companion to lib/viewer.ts. One copy, used by every action and page that
 * serves both the owner and a director. Portal unification, Sept 2026.
 */
import { sb } from "@/db/supabase";
import type { CapabilityKey } from "@/lib/portal-permissions";
import { fromBrowser, viewerCoversCompany, type Viewer } from "@/lib/viewer";

/** A director needs the permission for this job; the owner always has it. */
export function needCap(v: Viewer, cap?: CapabilityKey) {
  if (cap && v.kind === "director" && !v.person.caps[cap]) throw new Error("You don't have permission to do that.");
}

/** A director may only use their own companies. */
export function needCompany(v: Viewer, companyId: number | null | undefined) {
  if (!viewerCoversCompany(v, companyId ?? null)) throw new Error("You can only use your own companies.");
}

/** The stamp for a change: from the browser, always the signed-in person's own
 *  (never trust a stamp the page sent); from the server, what the route passed. */
export function stampOf(v: Viewer, passed = "web-ui"): string {
  return fromBrowser() ? v.actor : passed;
}

/** The people a viewer may see and assign: null = everyone (owner, portfolio
 *  director); otherwise the active people of their companies (main company or a
 *  person_companies link). */
export async function viewerPeopleIds(v: Viewer): Promise<Set<number> | null> {
  if (v.scope == null) return null;
  const [{ data: main }, { data: links }] = await Promise.all([
    sb.from("people").select("id").in("company_id", v.scope),
    sb.from("person_companies").select("person_id").in("company_id", v.scope),
  ]);
  return new Set<number>([...(main ?? []).map((r) => r.id as number), ...(links ?? []).map((r) => r.person_id as number)]);
}

/** Assignees by name. The owner typing a new name means a new person (the web
 *  form's long-standing behaviour); a director picks EXISTING people in their
 *  companies, so their names are resolved to ids here and anyone else refused. */
export async function assigneesFor(v: Viewer, names: string[] | undefined): Promise<{ assigneeNames?: string[]; assigneeIds?: number[] }> {
  if (v.kind === "owner" || names === undefined) return { assigneeNames: names };
  const clean = names.map((n) => n.trim()).filter(Boolean);
  if (!clean.length) return { assigneeIds: [] };
  const [{ data: ppl }, allowed] = await Promise.all([
    sb.from("people").select("id,name").eq("active", true),
    viewerPeopleIds(v),
  ]);
  const ids: number[] = [];
  for (const n of clean) {
    const hit = (ppl ?? []).find((p) => (p.name as string).trim().toLowerCase() === n.toLowerCase());
    if (!hit || (allowed && !allowed.has(hit.id as number))) throw new Error(`${n} isn't someone in your companies.`);
    ids.push(hit.id as number);
  }
  return { assigneeIds: ids };
}

import "server-only";
import { sb } from "@/db/supabase";
import { hashPassword } from "@/lib/portal-auth";
import { recordEvent } from "@/lib/system-events";
import { asPortalRole, directorScopeOf, roleAfterReset, scopeForRole, type PortalRoleKey } from "@/lib/portal-permissions";

/**
 * ONE DOOR for staff-portal access — granting it, changing the role, scoping a
 * director to companies, and revoking it.
 *
 * It exists because there were THREE of them: the Settings form actions, the
 * People-drawer "quick" actions, and the bulk role setter on the People table.
 * They offered different role lists (three of the five), and only one of them
 * cleared a demoted director's company scope in BOTH places it is stored — so
 * demoting a scoped director and later promoting them again silently restored
 * the old scope. Every surface now calls these functions; the callers only
 * differ in how they report back (a redirect, a toast, a revalidate).
 *
 * ⚠️ A director's scope lives in TWO places: the `director_companies` join table
 * (the truth) and the legacy `people.director_company_id` column (kept in sync
 * with the FIRST id for back-compat). `writeDirectorScope` is the only writer of
 * both — never update one on its own.
 */

export { directorScopeOf };

export type PortalAccessResult = { ok: true } | { ok: false; error: string };

/** Coerce a form value to a real portal role. Unknown → the least-powerful
 *  role. One implementation, shared with the client screens. */
export function parsePortalRole(role: unknown): PortalRoleKey {
  return asPortalRole(typeof role === "string" ? role : null);
}

/** Persist a director's company scope: replace the join-table rows AND keep
 *  people.director_company_id in sync with the FIRST id (back-compat). Empty
 *  companyIds → cleared (a portfolio-wide director, or any non-director role). */
export async function writeDirectorScope(personId: number, companyIds: number[]): Promise<void> {
  const clean = [...new Set(companyIds.filter((n) => Number.isFinite(n) && n > 0))];
  await sb.from("director_companies").delete().eq("person_id", personId);
  if (clean.length > 0) {
    await sb.from("director_companies").insert(clean.map((cid) => ({ person_id: personId, company_id: cid })));
  }
  await sb.from("people").update({ director_company_id: clean[0] ?? null }).eq("id", personId);
}

const validPerson = (personId: number): boolean => Number.isFinite(personId) && personId > 0;

/**
 * Grant access, or reset an existing person's password. Sets the role and the
 * director scope in the same breath so the three can never disagree.
 */
export async function grantPortalAccess(
  personId: number,
  role: PortalRoleKey,
  password: string,
  directorCompanyIds: number[] = [],
): Promise<PortalAccessResult> {
  if (!validPerson(personId)) return { ok: false, error: "Invalid person." };
  if (password.length < 8) return { ok: false, error: "Password must be at least 8 characters." };
  const { data: before } = await sb
    .from("people")
    .select("portal_password_hash,portal_role")
    .eq("id", personId)
    .maybeSingle();
  const wasEnabled = Boolean(before?.portal_password_hash);
  const prevRole = parsePortalRole((before?.portal_role as string | null) ?? "staff");
  // COMPIP-01: a reset may raise a level but never lower one. See roleAfterReset.
  const effectiveRole = wasEnabled ? roleAfterReset(prevRole, role) : role;
  const { error } = await sb
    .from("people")
    .update({
      portal_password_hash: hashPassword(password),
      portal_enabled_at: new Date().toISOString(),
      portal_role: effectiveRole,
    })
    .eq("id", personId);
  if (error) return { ok: false, error: error.message };
  await writeDirectorScope(personId, scopeForRole(effectiveRole, directorCompanyIds));
  await recordEvent(wasEnabled ? "portal.access.reset" : "portal.access.granted", "ok", { personId, role: effectiveRole });
  return { ok: true };
}

/**
 * Change the access level WITHOUT touching the password. Refuses a person who
 * has no access yet — a role change must never be a back door to granting one.
 */
export async function changePortalRole(
  personId: number,
  role: PortalRoleKey,
  directorCompanyIds: number[] = [],
): Promise<PortalAccessResult> {
  if (!validPerson(personId)) return { ok: false, error: "Invalid person." };
  const { data: row } = await sb
    .from("people")
    .select("portal_password_hash,portal_role")
    .eq("id", personId)
    .maybeSingle();
  if (!row?.portal_password_hash) return { ok: false, error: "No portal access yet — enable it first." };
  const prev = (row.portal_role as string | null) ?? "staff";
  const { error } = await sb.from("people").update({ portal_role: role }).eq("id", personId);
  if (error) return { ok: false, error: error.message };
  await writeDirectorScope(personId, scopeForRole(role, directorCompanyIds));
  if (prev !== role) await recordEvent("portal.role.changed", "ok", { personId, from: prev, to: role });
  return { ok: true };
}

/**
 * Stop them signing in. Every record they created is kept; the role drops back
 * to "staff" and any director scope is cleared, so re-granting access later can
 * never silently restore higher powers.
 */
export async function revokePortalAccess(personId: number): Promise<PortalAccessResult> {
  if (!validPerson(personId)) return { ok: false, error: "Invalid person." };
  const { error } = await sb
    .from("people")
    .update({ portal_password_hash: null, portal_enabled_at: null, portal_role: "staff" })
    .eq("id", personId);
  if (error) return { ok: false, error: error.message };
  await writeDirectorScope(personId, []);
  await recordEvent("portal.access.revoked", "ok", { personId });
  return { ok: true };
}

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

/* ---------------------------------------------------------------------------
 * A director's reach FOLLOWS THEIR COMPANIES (24 Sept 2026, owner: "unify this
 * … avoid duplication"). There used to be two company lists on a person that
 * looked alike and meant different things: "Also works for" (person_companies,
 * which a Manager's scope resolves to) and a Director's scope list set in
 * Settings. Now a director has ONE choice — every company, or only the
 * companies they work for — and the list is the person's own companies.
 *
 * Storage is unchanged (director_companies + the legacy column, both still
 * written only by writeDirectorScope), so the portal reads exactly what it read
 * before. The live data already matched this for every scoped director but one
 * (measured 24 Sept: Amal's scope is TG while he also works for VI), so a
 * scope is only ever re-written when it EQUALLED the person's companies — a
 * scope that differs is left alone and the profile says so.
 * ------------------------------------------------------------------------- */

/** The companies a person works for: the main company, then every "also works for". */
export async function companiesOnRecord(personId: number): Promise<number[]> {
  const [{ data: p }, { data: links }] = await Promise.all([
    sb.from("people").select("company_id").eq("id", personId).maybeSingle(),
    sb.from("person_companies").select("company_id").eq("person_id", personId),
  ]);
  const ids = [p?.company_id as number | null, ...(links ?? []).map((l) => l.company_id as number)];
  return [...new Set(ids.filter((n): n is number => Number.isFinite(n) && (n as number) > 0))];
}

async function currentDirectorScope(personId: number): Promise<{ director: boolean; scope: number[] }> {
  const [{ data: p }, { data: rows }] = await Promise.all([
    sb.from("people").select("portal_role,portal_password_hash").eq("id", personId).maybeSingle(),
    sb.from("director_companies").select("company_id").eq("person_id", personId),
  ]);
  const director = Boolean(p?.portal_password_hash) && parsePortalRole(p?.portal_role) === "director";
  return { director, scope: (rows ?? []).map((r) => r.company_id as number) };
}

const sameSet = (a: number[], b: number[]) => a.length === b.length && a.every((x) => b.includes(x));

/** Call BEFORE changing someone's companies: does their director reach follow them? */
export async function directorFollowsCompanies(personId: number): Promise<boolean> {
  const { director, scope } = await currentDirectorScope(personId);
  if (!director || scope.length === 0) return false;
  return sameSet(scope, await companiesOnRecord(personId));
}

/** Call AFTER changing someone's companies, with what `directorFollowsCompanies`
 *  said before: a director who saw "only their companies" keeps doing so. */
export async function refreshDirectorScope(personId: number, followed: boolean): Promise<void> {
  if (!followed) return;
  const now = await companiesOnRecord(personId);
  // Never turn a scoped director into a portfolio-wide one by emptying their companies.
  if (now.length === 0) return;
  await writeDirectorScope(personId, now);
  await recordEvent("portal.scope.followed", "ok", { personId, companies: now });
}

/** The profile's one choice for a director: every company, or only their own. */
export async function setDirectorReach(personId: number, reach: "all" | "own"): Promise<PortalAccessResult> {
  const { director } = await currentDirectorScope(personId);
  if (!director) return { ok: false, error: "Only a Director's reach can be set this way." };
  if (reach === "all") return changePortalRole(personId, "director", []);
  const own = await companiesOnRecord(personId);
  if (own.length === 0) return { ok: false, error: "They don't work for any company yet — add one under Role & companies first." };
  return changePortalRole(personId, "director", own);
}

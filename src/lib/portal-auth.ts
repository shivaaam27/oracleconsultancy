import "server-only";
import { cache } from "react";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { sb } from "@/db/supabase";
import { escapeLike } from "@/lib/db-helpers";

/* ------------------------------------------------------------------ *
 * Staff-portal authentication.
 *
 * The owner sets a password on a person record (Settings → Portal
 * access). The hash lives in people.portal_password_hash as
 * "scrypt:<saltHex>:<hashHex>". A successful login sets a signed,
 * HttpOnly cookie "cos_portal" = "<personId>.<expiryMs>.<hmac>".
 * Every portal page/action re-verifies the signature server-side, so
 * a staff member can only ever act as themselves.
 * ------------------------------------------------------------------ */

const COOKIE_NAME = "cos_portal";
// 60 days, matching the admin session — long enough that staff aren't logged
// out between normal visits.
const SESSION_DAYS = 60;

function secret(): string {
  // Dedicated secret if set; otherwise derive from the DB URL so it is
  // stable per deployment without extra setup.
  return (
    process.env.PORTAL_SESSION_SECRET ||
    "cos-portal:" + (process.env.DATABASE_URL || "dev-secret")
  );
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 32).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const expected = Buffer.from(parts[2], "hex");
  const actual = scryptSync(password, parts[1], 32);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

/* Session binding (AUTHSEC-02): every token carries a short fingerprint of the
 * person's password hash. When a staff member changes their password (self-
 * service or an admin reset) the stored hash rotates, so every token issued
 * against the OLD hash stops verifying — i.e. "change my password" logs out
 * the person's other devices, mirroring the admin session-generation control.
 * We embed only a fingerprint, never the hash itself, so a stolen cookie still
 * reveals nothing about the password. */
function sessionFingerprint(passwordHash: string): string {
  return createHmac("sha256", secret()).update("pw:" + passwordHash).digest("base64url").slice(0, 16);
}

export function makeSessionToken(personId: number, passwordHash: string): string {
  const exp = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const fp = sessionFingerprint(passwordHash);
  const payload = `${personId}.${exp}.${fp}`;
  return `${payload}.${sign(payload)}`;
}

/** Parsed portal token. `fp` is null for legacy (pre-binding) cookies, which
 *  are still accepted on signature alone so a deploy doesn't force every staff
 *  member to sign in again; new logins are always bound. */
export function parseSessionToken(
  token: string | undefined
): { personId: number; fp: string | null } | null {
  if (!token) return null;
  const segs = token.split(".");
  // Bound token: <id>.<exp>.<fp>.<sig>; legacy token: <id>.<exp>.<sig>.
  let id: string, exp: string, fp: string | null, sig: string;
  if (segs.length === 4) {
    [id, exp, fp, sig] = segs;
  } else if (segs.length === 3) {
    [id, exp, sig] = segs;
    fp = null;
  } else {
    return null;
  }
  if (!id || !exp || !sig) return null;
  const payload = fp === null ? `${id}.${exp}` : `${id}.${exp}.${fp}`;
  const good = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(good);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (Number(exp) < Date.now()) return null;
  const personId = Number(id);
  return Number.isFinite(personId) ? { personId, fp } : null;
}

/* ------------------------------------------------------------------ *
 * Durable "remember" token (PWA app-kill resilience).
 *
 * Installed PWAs (esp. iOS) can drop the httpOnly session cookie when the app is
 * swiped from recents, dumping staff back to the login screen. localStorage is a
 * separate, stickier store, so we ALSO hand the client a long-lived, signed
 * remember token; on relaunch the login page silently POSTs it to /api/portal/
 * reauth to re-mint the session cookie. It's bound to the password-hash
 * fingerprint (a password change invalidates it) and only ever mints a session —
 * same power as the cookie it restores.
 * ------------------------------------------------------------------ */
const REMEMBER_DAYS = 90;

export function makeRememberToken(personId: number, passwordHash: string): string {
  const exp = Date.now() + REMEMBER_DAYS * 24 * 60 * 60 * 1000;
  const fp = sessionFingerprint(passwordHash);
  const payload = `r.${personId}.${exp}.${fp}`;
  return `${payload}.${sign(payload)}`;
}

/** Verify a remember token's signature + expiry (NOT yet the live password hash —
 *  the reauth route re-checks the fingerprint against the current hash). */
export function parseRememberToken(token: string | undefined): { personId: number; fp: string } | null {
  if (!token) return null;
  const segs = token.split(".");
  if (segs.length !== 5 || segs[0] !== "r") return null;
  const [, id, exp, fp, sig] = segs;
  if (!id || !exp || !fp || !sig) return null;
  const payload = `r.${id}.${exp}.${fp}`;
  const good = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(good);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (Number(exp) < Date.now()) return null;
  const personId = Number(id);
  return Number.isFinite(personId) ? { personId, fp } : null;
}

/** Full server-side check of a remember token: signature + expiry + the person is
 *  still active with a password whose fingerprint matches. Returns the personId to
 *  re-mint a session for, or null. */
export async function verifyRememberToken(token: string | undefined): Promise<number | null> {
  const parsed = parseRememberToken(token);
  if (!parsed) return null;
  const { data } = await sb
    .from("people")
    .select("active,portal_password_hash")
    .eq("id", parsed.personId)
    .maybeSingle();
  if (!data || !data.active || !data.portal_password_hash) return null;
  if (parsed.fp !== sessionFingerprint(data.portal_password_hash as string)) return null;
  return parsed.personId;
}

/** Row shape for a portal-login candidate. */
export type PortalLoginCandidate = {
  id: number;
  portal_password_hash: string | null;
  active: boolean | null;
  portal_role: string | null;
};

/** Resolve a portal-login identifier to a candidate person row, by exact email
 *  first then exact (case-insensitive) name. The identifier is escaped before
 *  the ilike so LIKE metacharacters (% _ \) match literally and can never be
 *  used to authenticate against a person the caller only partially knows, nor
 *  to probe which staff have portal access (AUTHSEC-01). Only rows that have a
 *  password set are considered. */
export async function findPortalPersonByIdentifier(
  identifier: string
): Promise<PortalLoginCandidate | null> {
  const id = identifier.trim();
  if (!id) return null;
  const cols = "id,portal_password_hash,active,portal_role";
  const { data: byEmail } = await sb
    .from("people")
    .select(cols)
    .ilike("email", escapeLike(id))
    .not("portal_password_hash", "is", null)
    .maybeSingle();
  if (byEmail) return byEmail as PortalLoginCandidate;
  const { data: byName } = await sb
    .from("people")
    .select(cols)
    .ilike("name", escapeLike(id))
    .not("portal_password_hash", "is", null)
    .maybeSingle();
  return (byName as PortalLoginCandidate | null) ?? null;
}

export async function setSessionCookie(personId: number) {
  // Bind the new token to the person's current password hash. We read it here so
  // the call sites (login + passkey) don't need to thread it through.
  const { data } = await sb
    .from("people")
    .select("portal_password_hash")
    .eq("id", personId)
    .maybeSingle();
  const hash = (data?.portal_password_hash as string | null) ?? "";
  const jar = await cookies();
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  jar.set(COOKIE_NAME, makeSessionToken(personId, hash), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
    // Set an explicit Expires date too — installed iOS PWAs (and some Android
    // WebViews) drop Max-Age-only cookies as "session" cookies when the app is
    // swiped out of recents, logging the staff member out. A dated Expires is
    // persisted reliably across app termination.
    expires: new Date(Date.now() + maxAge * 1000),
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.set(COOKIE_NAME, "", { httpOnly: true, path: "/", maxAge: 0 });
}

// "director" = executive operator: a read-only board + create tasks/events/
// messages across ALL companies (group-wide). See memory/director_surface_plan.md.
// "hr" = admin/HR: sees and creates tasks across ALL 7 companies (group-wide
// task visibility), but uses the ordinary staff home/Tasks surface, not the
// director board.
export type PortalRole = "staff" | "manager" | "hr" | "director";

// Roles whose task visibility spans every company.
export function isGroupWide(role: PortalRole): boolean {
  return role === "hr" || role === "director";
}

export type PortalPerson = {
  id: number;
  name: string;
  email: string | null;
  role: string | null;
  companyId: number | null;
  portalRole: PortalRole;
};

/** Returns the signed-in portal person, or null. Re-checks that portal
 *  access is still enabled and the person is still active, so revoking
 *  access in Settings takes effect immediately. */
export const getPortalPerson = cache(async (): Promise<PortalPerson | null> => {
  const jar = await cookies();
  const parsed = parseSessionToken(jar.get(COOKIE_NAME)?.value);
  // No / expired / tampered token = genuinely not signed in → caller sends to login.
  if (!parsed) return null;
  const { personId, fp } = parsed;

  // The token IS valid. Now look the person up — but a freshly-woken phone (PWA
  // relaunched from recents → cold serverless + cold PgBouncer connection +
  // network re-establishing) can fail the FIRST query. Treating that DB blip as
  // "logged out" was bouncing staff to /login on every relaunch even though
  // their 60-day session was perfectly fine. So: retry transient errors, and
  // only after they persist do we give up. A DB *error* is never a logout — it's
  // "try again"; only a missing/inactive person (no error) means sign out.
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data, error } = await sb
      .from("people")
      .select("id,name,email,role,company_id,active,portal_password_hash,portal_role")
      .eq("id", personId)
      .maybeSingle();

    if (!error && data) {
      // Revocation gate (the ONLY legitimate reasons to sign someone out whose
      // cookie signature is valid + unexpired): access genuinely removed.
      if (!data.active || !data.portal_password_hash) return null; // access revoked
      // AUTHSEC-02 was a HARD logout on a password-hash fingerprint mismatch — but
      // that was the suspected cause of installed-PWA relaunch sign-outs (the
      // command centre has no such DB check and never logs out). The signed,
      // unexpired cookie already proves authenticity, so we DOWNGRADE this to a
      // warning and keep the session. (Access revocation still works via `active`,
      // and changing a password no longer force-logs-out other devices.)
      if (fp !== null && fp !== sessionFingerprint(data.portal_password_hash as string)) {
        console.warn(`[portal-auth] fingerprint mismatch person ${personId} — keeping session (cookie valid)`);
      }
      return {
        id: data.id as number,
        name: data.name as string,
        email: (data.email as string | null) ?? null,
        role: (data.role as string | null) ?? null,
        companyId: (data.company_id as number | null) ?? null,
        portalRole:
          data.portal_role === "manager"
            ? "manager"
            : data.portal_role === "hr"
              ? "hr"
              : data.portal_role === "director"
                ? "director"
                : "staff",
      };
    }

    // No error but NO row can be a cold/transient empty read on a freshly-woken
    // serverless + PgBouncer connection — NOT proof the person is gone. Retry
    // before concluding anything; a DB error is likewise transient.
    if (error) lastError = error;
    if (attempt < 3) await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
  }

  if (lastError) {
    // DB stayed unreachable for a VALID session — throw so the error boundary
    // shows "couldn't load, try again" with the cookie intact, NEVER a logout.
    throw new Error(
      `getPortalPerson: people lookup failed for valid session (person ${personId}): ${String(lastError)}`,
    );
  }
  // Every attempt returned cleanly with no row → the person genuinely doesn't
  // exist (deleted). Only NOW do we sign out.
  return null;
});

/** Every company id this portal person belongs to: their primary
 *  people.company_id (if any) UNION every person_companies association row.
 *  A person set up in the command centre to work for more than one company
 *  belongs to ALL of them, so every portal scope (colleagues, companies,
 *  tasks) must span this set rather than the single primary company.
 *  Returns [] when they have no company at all. This is a small, cheap query
 *  for ONE person — do not pull the whole getPersonCompaniesMap here. */
export async function myCompanyIds(person: PortalPerson): Promise<number[]> {
  const { data } = await sb
    .from("person_companies")
    .select("company_id")
    .eq("person_id", person.id);
  const set = new Set<number>();
  if (person.companyId != null) set.add(person.companyId);
  for (const r of data ?? []) {
    const cid = r.company_id as number | null;
    if (cid != null) set.add(cid);
  }
  return [...set];
}

/** Direct reports of a manager: primary line (people.manager_id) plus any
 *  dotted lines (reporting_lines). Active people only. */
export async function directReportIds(managerId: number): Promise<number[]> {
  const [{ data: primary }, { data: dotted }] = await Promise.all([
    sb.from("people").select("id").eq("manager_id", managerId).eq("active", true),
    sb.from("reporting_lines").select("person_id").eq("manager_id", managerId),
  ]);
  return Array.from(
    new Set([
      ...(primary ?? []).map((r) => r.id as number),
      ...(dotted ?? []).map((r) => r.person_id as number),
    ])
  );
}

/** A manager's team: everyone in ANY of their companies (active) PLUS any direct
 *  report who sits in another company (dotted/primary line), EXCLUDING the
 *  manager themselves. This is the company-wide scope a manager now manages —
 *  create/assign, open colleagues, approve leave. A multi-company manager spans
 *  every company they belong to. If the manager has no company at all, this is
 *  just their direct reports. Only ever called for managers. */
export async function managerTeamIds(person: PortalPerson): Promise<number[]> {
  const reports = await directReportIds(person.id);
  const cids = await myCompanyIds(person);
  if (cids.length === 0) {
    return reports.filter((id) => id !== person.id);
  }
  const { data: colleagues } = await sb
    .from("people")
    .select("id")
    .in("company_id", cids)
    .eq("active", true);
  return Array.from(
    new Set([...(colleagues ?? []).map((r) => r.id as number), ...reports])
  ).filter((id) => id !== person.id);
}

/** May this portal person open another person's (read-only, scoped) detail page?
 *  Self: always. Director/HR: any active person (group-wide). Manager: their direct
 *  reports only. Staff: only themselves. Never exposes pay or private IDs (the
 *  portal person page deliberately omits those). */
export async function personCanSeePerson(viewer: PortalPerson, targetId: number): Promise<boolean> {
  if (viewer.id === targetId) return true;
  if (isGroupWide(viewer.portalRole)) {
    const { data } = await sb.from("people").select("active").eq("id", targetId).maybeSingle();
    return Boolean(data) && data!.active === true;
  }
  if (viewer.portalRole === "manager") {
    const team = await managerTeamIds(viewer);
    return team.includes(targetId);
  }
  return false;
}

/** May this portal person open a company's (read-only, scoped) detail page?
 *  Director/HR: any company. Manager/Staff: any of THEIR companies (a person may
 *  belong to more than one — primary company ∪ person_companies). */
export async function personCanSeeCompany(viewer: PortalPerson, companyId: number): Promise<boolean> {
  if (isGroupWide(viewer.portalRole)) return true;
  return (await myCompanyIds(viewer)).includes(companyId);
}

/** Every task id this portal person may see. Staff: their own (assignee or
 *  owner). Manager: every (non-archived) task in ANY of their companies, plus
 *  their own and any direct report's tasks (reports may sit in other companies).
 *  Director: every (non-archived) task across the portfolio. */
export async function visibleTaskIds(person: PortalPerson): Promise<number[]> {
  if (isGroupWide(person.portalRole)) {
    const { data } = await sb.from("tasks").select("id").eq("archived", false);
    return (data ?? []).map((r) => r.id as number);
  }
  const ids = [person.id];
  if (person.portalRole === "manager") ids.push(...(await directReportIds(person.id)));
  // Managers also see everything in any of their companies (multi-company aware).
  const managerCids = person.portalRole === "manager" ? await myCompanyIds(person) : [];
  const companyTasks =
    managerCids.length > 0
      ? sb.from("tasks").select("id").in("company_id", managerCids).eq("archived", false)
      : Promise.resolve({ data: [] as { id: number }[] });
  const [{ data: assigned }, { data: owned }, { data: company }] = await Promise.all([
    sb.from("task_assignees").select("task_id").in("person_id", ids),
    sb.from("tasks").select("id").in("owner_id", ids).eq("archived", false),
    companyTasks,
  ]);
  // The assignee join can surface archived tasks (task_assignees has no archived
  // flag), so drop any archived ids before returning — archived tasks must never
  // appear in a staff member's visible set (ACTTASKS-01).
  const assignedIds = Array.from(new Set((assigned ?? []).map((r) => r.task_id as number)));
  const liveAssignedIds = assignedIds.length
    ? new Set(
        (
          (await sb.from("tasks").select("id").in("id", assignedIds).eq("archived", false)).data ?? []
        ).map((r) => r.id as number)
      )
    : new Set<number>();
  return Array.from(
    new Set([
      ...assignedIds.filter((id) => liveAssignedIds.has(id)),
      ...(owned ?? []).map((r) => r.id as number),
      ...(company ?? []).map((r) => r.id as number),
    ])
  );
}

/** May this portal person see/touch this task? Staff: on the (non-archived)
 *  task. Manager: any non-archived task in ANY of their companies, or one a
 *  direct report is on. Director: any non-archived task (they are group-wide
 *  operators — matches visibleTaskIds). Archived (soft-retired) tasks are never
 *  visible to any portal role (ACTTASKS-01). */
export async function personCanSeeTask(person: PortalPerson, taskId: number): Promise<boolean> {
  if (isGroupWide(person.portalRole)) {
    const { data } = await sb.from("tasks").select("archived").eq("id", taskId).maybeSingle();
    return Boolean(data) && data!.archived !== true;
  }
  const { data: task } = await sb
    .from("tasks")
    .select("owner_id,company_id,archived")
    .eq("id", taskId)
    .maybeSingle();
  // Archived tasks are out of view for staff and managers alike.
  if (!task || task.archived === true) return false;
  if (await personOnTask(person.id, taskId)) return true;
  if (person.portalRole !== "manager") return false;
  // Any non-archived task in any of the manager's companies (multi-company aware).
  const cids = await myCompanyIds(person);
  if (cids.includes((task.company_id as number | null) ?? -1)) return true;
  // Or a task a direct report owns / is assigned to (reports may be cross-company).
  const reports = await directReportIds(person.id);
  if (reports.length === 0) return false;
  if (reports.includes((task.owner_id as number | null) ?? -1)) return true;
  const { data: assignee } = await sb
    .from("task_assignees")
    .select("person_id")
    .eq("task_id", taskId)
    .in("person_id", reports)
    .limit(1);
  return (assignee ?? []).length > 0;
}

/** Upsert the viewer's last-viewed stamp — powers the "Seen" indicator.
 *  Viewer is "admin" or "person:<id>". Fire-and-forget semantics. */
export async function recordTaskView(taskId: number, viewer: string): Promise<void> {
  await sb
    .from("task_views")
    .upsert(
      { task_id: taskId, viewer, last_viewed_at: new Date().toISOString() },
      { onConflict: "task_id,viewer" }
    );
}

/** True when this person is an assignee (or owner) of the task. Used by
 *  every portal read and write so URLs cannot be guessed. */
export async function personOnTask(personId: number, taskId: number): Promise<boolean> {
  const [{ data: assignee }, { data: task }] = await Promise.all([
    sb
      .from("task_assignees")
      .select("person_id")
      .eq("task_id", taskId)
      .eq("person_id", personId)
      .maybeSingle(),
    sb.from("tasks").select("owner_id").eq("id", taskId).maybeSingle(),
  ]);
  return Boolean(assignee) || (task?.owner_id as number | null) === personId;
}

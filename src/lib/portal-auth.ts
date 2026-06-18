import "server-only";
import { cache } from "react";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { sb } from "@/db/supabase";

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

export function makeSessionToken(personId: number): string {
  const exp = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const payload = `${personId}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

export function parseSessionToken(token: string | undefined): number | null {
  if (!token) return null;
  const [id, exp, sig] = token.split(".");
  if (!id || !exp || !sig) return null;
  const payload = `${id}.${exp}`;
  const good = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(good);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (Number(exp) < Date.now()) return null;
  const personId = Number(id);
  return Number.isFinite(personId) ? personId : null;
}

export async function setSessionCookie(personId: number) {
  const jar = await cookies();
  jar.set(COOKIE_NAME, makeSessionToken(personId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
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
  const personId = parseSessionToken(jar.get(COOKIE_NAME)?.value);
  if (!personId) return null;
  const { data, error } = await sb
    .from("people")
    .select("id,name,email,role,company_id,active,portal_password_hash,portal_role")
    .eq("id", personId)
    .maybeSingle();
  if (error || !data) return null;
  if (!data.active || !data.portal_password_hash) return null;
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
});

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
    const reports = await directReportIds(viewer.id);
    return reports.includes(targetId);
  }
  return false;
}

/** May this portal person open a company's (read-only, scoped) detail page?
 *  Director/HR: any company. Manager/Staff: only their own company. */
export async function personCanSeeCompany(viewer: PortalPerson, companyId: number): Promise<boolean> {
  if (isGroupWide(viewer.portalRole)) return true;
  return viewer.companyId === companyId;
}

/** Every task id this portal person may see. Staff: their own (assignee or
 *  owner). Manager: every (non-archived) task in their own company, plus their
 *  own and any direct report's tasks (reports may sit in other companies).
 *  Director: every (non-archived) task across the portfolio. */
export async function visibleTaskIds(person: PortalPerson): Promise<number[]> {
  if (isGroupWide(person.portalRole)) {
    const { data } = await sb.from("tasks").select("id").eq("archived", false);
    return (data ?? []).map((r) => r.id as number);
  }
  const ids = [person.id];
  if (person.portalRole === "manager") ids.push(...(await directReportIds(person.id)));
  // Managers also see everything in their own company.
  const companyTasks =
    person.portalRole === "manager" && person.companyId != null
      ? sb.from("tasks").select("id").eq("company_id", person.companyId).eq("archived", false)
      : Promise.resolve({ data: [] as { id: number }[] });
  const [{ data: assigned }, { data: owned }, { data: company }] = await Promise.all([
    sb.from("task_assignees").select("task_id").in("person_id", ids),
    sb.from("tasks").select("id").in("owner_id", ids).eq("archived", false),
    companyTasks,
  ]);
  return Array.from(
    new Set([
      ...(assigned ?? []).map((r) => r.task_id as number),
      ...(owned ?? []).map((r) => r.id as number),
      ...(company ?? []).map((r) => r.id as number),
    ])
  );
}

/** May this portal person see/touch this task? Staff: on the task. Manager:
 *  any non-archived task in their own company, or one a direct report is on.
 *  Director: any non-archived task (they are group-wide operators — matches
 *  visibleTaskIds). */
export async function personCanSeeTask(person: PortalPerson, taskId: number): Promise<boolean> {
  if (isGroupWide(person.portalRole)) {
    const { data } = await sb.from("tasks").select("archived").eq("id", taskId).maybeSingle();
    return Boolean(data) && data!.archived !== true;
  }
  if (await personOnTask(person.id, taskId)) return true;
  if (person.portalRole !== "manager") return false;
  const { data: task } = await sb
    .from("tasks")
    .select("owner_id,company_id,archived")
    .eq("id", taskId)
    .maybeSingle();
  if (!task || task.archived === true) return false;
  // Any non-archived task in the manager's own company.
  if (person.companyId != null && (task.company_id as number | null) === person.companyId) return true;
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

import "server-only";
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
const SESSION_DAYS = 30;

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

export type PortalRole = "staff" | "manager";

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
export async function getPortalPerson(): Promise<PortalPerson | null> {
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
    portalRole: data.portal_role === "manager" ? "manager" : "staff",
  };
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

/** Every task id this portal person may see: their own (assignee or owner),
 *  plus — for managers — their direct reports' tasks. */
export async function visibleTaskIds(person: PortalPerson): Promise<number[]> {
  const ids = [person.id];
  if (person.portalRole === "manager") ids.push(...(await directReportIds(person.id)));
  const [{ data: assigned }, { data: owned }] = await Promise.all([
    sb.from("task_assignees").select("task_id").in("person_id", ids),
    sb.from("tasks").select("id").in("owner_id", ids).eq("archived", false),
  ]);
  return Array.from(
    new Set([
      ...(assigned ?? []).map((r) => r.task_id as number),
      ...(owned ?? []).map((r) => r.id as number),
    ])
  );
}

/** May this portal person see/touch this task? Staff: on the task. Manager:
 *  on the task or a direct report is. */
export async function personCanSeeTask(person: PortalPerson, taskId: number): Promise<boolean> {
  if (await personOnTask(person.id, taskId)) return true;
  if (person.portalRole !== "manager") return false;
  const reports = await directReportIds(person.id);
  if (reports.length === 0) return false;
  const [{ data: assignee }, { data: task }] = await Promise.all([
    sb.from("task_assignees").select("person_id").eq("task_id", taskId).in("person_id", reports).limit(1),
    sb.from("tasks").select("owner_id").eq("id", taskId).maybeSingle(),
  ]);
  return (assignee ?? []).length > 0 || reports.includes((task?.owner_id as number | null) ?? -1);
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

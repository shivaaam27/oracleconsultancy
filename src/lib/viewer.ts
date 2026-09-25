import "server-only";

/**
 * WHO IS LOOKING — the one question every shared screen and every server action
 * asks (portal unification, Sept 2026; plan in memory/portal_unification_plan.md).
 *
 * Oracle is one system now, the way an ERP is: the administrator and a director use
 * the SAME screens, and what differs is what each may see and do.
 *   - The OWNER (admin cookie): everything, every company.
 *   - A DIRECTOR (portal cookie, role "director"): the same task and home powers
 *     as the owner, over THEIR companies only (a portfolio director = all), and
 *     view-only on companies, people, files and the calendar.
 *   - A MANAGER (role "manager", 26 Sept 2026): exactly what a director has,
 *     over the companies they belong to. Same kind ("director"), `role` says which.
 * Staff come later and will slot in here.
 *
 * ── THE ACTION GUARD ──────────────────────────────────────────────────────────
 * Until now almost every administrator server action trusted the front door
 * (src/proxy.ts) and checked nothing itself. That was only safe while nobody but
 * the owner could reach an administrator page. `guardOwner()` / `guardViewer()`
 * go at the top of every one, and decide by WHERE THE CALL CAME FROM:
 *   - from a BROWSER (Next.js runs every server action — a fetch from the page
 *     OR a plain form post — inside `actionAsyncStorage` with `isAction: true`):
 *     the caller must be signed in with the right to do it;
 *   - from the SERVER (Claude's MCP, ORI, the cron jobs, a page rendering): the
 *     calling route has already authenticated, so the guard stands aside;
 *   - from a portal action that legitimately calls an administrator function on
 *     the person's behalf, AFTER its own checks: wrap that call in `trusted()`.
 * ⚠️ `actionAsyncStorage` is a Next.js internal. If an upgrade moves it, the
 * import fails the BUILD — loudly, never silently open.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { cache } from "react";
import { actionAsyncStorage } from "next/dist/server/app-render/action-async-storage.external";
import { isAdminSession } from "@/lib/admin-auth";
import { getPortalPerson, companyScope, personCanSeeTask, type PortalPerson } from "@/lib/portal-auth";

export type Viewer =
  | { kind: "owner"; person: null; scope: null; actor: "web-ui"; name: string }
  | {
      /** A portal person on the shared Studio screens — a director OR a manager
       *  (owner, 26 Sept 2026: "for managers, basically replicate what
       *  directors have … based on the companies they have access to"). The
       *  kind keeps its old name because every guard already treats it as
       *  "restricted, not the owner"; `role` says which. */
      kind: "director";
      role: "director" | "manager";
      person: PortalPerson;
      /** Company ids this director covers; null = every company (portfolio director). */
      scope: number[] | null;
      /** The `created_by` stamp for what they change ("portal-dir:<Name>"). */
      actor: string;
      name: string;
    };

/** The portal roles that use the shared screens: directors (Sept 2026) and
 *  managers (26 Sept 2026), each over the companies they may see. Staff join
 *  when their screens are built. */
export const STUDIO_ROLES = ["director", "manager"] as const;
export function isStudioRole(role: string | null | undefined): boolean {
  return (STUDIO_ROLES as readonly string[]).includes(role ?? "");
}

export async function usesStudio(p: PortalPerson | null): Promise<boolean> {
  return isStudioRole(p?.portalRole);
}

/** Who is looking at this request. Owner first: an owner who is ALSO signed in
 *  to the portal in the same browser is the owner. Null = nobody allowed. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  if (await isAdminSession()) return { kind: "owner", person: null, scope: null, actor: "web-ui", name: "You" };
  const p = await getPortalPerson();
  if (!p || !(await usesStudio(p))) return null;
  const role = p.portalRole === "manager" ? "manager" : "director";
  // The stamp on what they change: managers keep "portal-mgr:", which the
  // portal, the notifications and the timelines already read.
  return { kind: "director", role, person: p, scope: await companyScope(p), actor: `${role === "manager" ? "portal-mgr" : "portal-dir"}:${p.name}`, name: p.name };
});

/* ── the guard ─────────────────────────────────────────────────────────────── */

const trust = new AsyncLocalStorage<true>();

/** Run `fn` as the server, not the browser: for a portal action that has done
 *  its own checks and now calls an administrator function on the person's
 *  behalf. Never wrap anything the browser controls the arguments of without
 *  having checked them first. */
export function trusted<T>(fn: () => T): T {
  return trust.run(true, fn);
}

/** Did this call arrive from a browser as a server action (and not inside a
 *  `trusted()` block)? */
export function fromBrowser(): boolean {
  if (trust.getStore()) return false;
  return actionAsyncStorage.getStore()?.isAction === true;
}

export const NOT_ALLOWED = "Only the administrator can do that.";

/** The top of every owner-only server action. */
export async function guardOwner(): Promise<void> {
  if (!fromBrowser()) return;
  if (await isAdminSession()) return;
  throw new Error(NOT_ALLOWED);
}

/** The top of a server action any signed-in person may use (owner or a portal
 *  person) — e.g. staging an upload, reading announcement comments. The action
 *  itself must still narrow WHAT they may reach. */
export async function guardSignedIn(): Promise<void> {
  if (!fromBrowser()) return;
  if (await isAdminSession()) return;
  if (await getPortalPerson()) return;
  throw new Error("Sign in first.");
}

/** The top of a server action a director may use too (tasks). Returns who is
 *  acting — the owner when called from the server. With `taskId`, a director
 *  must be able to see that task (inside their companies). */
export async function guardViewer(opts?: { taskId?: number | null }): Promise<Viewer> {
  const owner: Viewer = { kind: "owner", person: null, scope: null, actor: "web-ui", name: "You" };
  if (!fromBrowser()) return owner;
  const v = await getViewer();
  if (!v) throw new Error("Sign in first.");
  if (v.kind === "director" && opts?.taskId != null && !(await personCanSeeTask(v.person, opts.taskId))) {
    throw new Error("That task isn't in your companies.");
  }
  return v;
}

/** May this viewer act on / see something owned by this company? */
export function viewerCoversCompany(v: Viewer, companyId: number | null | undefined): boolean {
  if (v.scope == null) return true;
  return companyId != null && v.scope.includes(companyId);
}

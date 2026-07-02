/**
 * Portal role-capability registry — the single source of truth for what each
 * staff-portal role can do/see in the UI.
 *
 * CLIENT-SAFE + PURE: this module has NO server imports (no `@/db/supabase`,
 * no value-import of `@/lib/portal-auth`). It is imported by client components
 * (e.g. the nav pill), so it must never drag the server bundle into the browser.
 * `import type { PortalRole }` is fine — types are erased at build time.
 *
 * Goal: replace scattered ad-hoc role checks
 *   role === "director"
 *   role === "manager" || role === "hr" || role === "director"
 * with ONE place that names each capability. UI surfaces derive their booleans
 * from `portalCapabilities(role)` so the rules live here, not sprinkled across
 * pages and components.
 *
 * Note: these are *UI affordance* flags only — they decide what to render, not
 * who may read which row. Every data read MUST still be re-verified server-side
 * (see `@/lib/portal-auth`); the client is never trusted.
 */

import type { PortalRole } from "@/lib/portal-auth";

/** The shape returned by `portalCapabilities`. */
export type PortalCapabilities = {
  /** Director — board-first; sees the portfolio Board instead of Home. */
  isDirector: boolean;
  /** Management tier: manager, HR or director. Gets the Tasks + Outbox tabs. */
  isManagement: boolean;
  /** Group-wide visibility (HR or director) — sees across all companies. */
  groupWide: boolean;
  /** May create things (tasks, etc.). Anyone above "staff". Mirrors the
   *  layout's `canCreate = portalRole !== "staff"`. */
  canCreate: boolean;
  /** Which nav-pill / navigation tabs this role gets. */
  tabs: {
    /** Portfolio board — directors only. */
    board: boolean;
    /** Home — everyone except directors (they are board-first). */
    home: boolean;
    /** Filterable Tasks list — management only. */
    tasks: boolean;
    /** Contact book / company list — everyone (scoped server-side). */
    directory: boolean;
    /** Drafted messages / announcements — management only. */
    outbox: boolean;
    /** Glanceable portfolio/team Insights — management only. */
    insights: boolean;
    /** Company document library — management only (scoped by company server-side). */
    documents: boolean;
    /** Raise / view requests — everyone EXCEPT directors (removed from the director
     *  portal for now; staff/managers/HR keep it). */
    requests: boolean;
    /** Activity feed — everyone. */
    activity: boolean;
    /** Chat — everyone. */
    chat: boolean;
    /** Own profile — everyone. */
    profile: boolean;
  };
};

/**
 * Resolve the UI capabilities for a portal role.
 *
 * Unknown / undefined roles are normalised to least-privilege "staff" semantics,
 * so an unexpected value can never accidentally unlock a management surface.
 */
export function portalCapabilities(role: PortalRole | string | undefined): PortalCapabilities {
  // Normalise to a known role; anything unexpected → "staff" (least privilege).
  const r: PortalRole =
    role === "director" || role === "manager" || role === "hr" ? role : "staff";

  const isDirector = r === "director";
  const isManagement = r === "manager" || r === "hr" || r === "director";
  const groupWide = r === "hr" || r === "director";
  const canCreate = r !== "staff";

  return {
    isDirector,
    isManagement,
    groupWide,
    canCreate,
    tabs: {
      board: isDirector,
      home: !isDirector,
      tasks: isManagement,
      directory: true,
      outbox: isManagement,
      insights: isManagement,
      documents: isManagement,
      // Requests are hidden from the director portal for now (directors don't triage
      // requests here); everyone else keeps them.
      requests: !isDirector,
      activity: true,
      chat: true,
      profile: true,
    },
  };
}

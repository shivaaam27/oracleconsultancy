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
    /** Operator board — directors AND managers (each scoped to their companies). */
    board: boolean;
    /** Home — staff + HR only (directors/managers are board-first). */
    home: boolean;
    /** Filterable Tasks list — management only. */
    tasks: boolean;
    /** Contact book / company list — everyone (scoped server-side). */
    directory: boolean;
    /** Drafted messages / announcements — management only. */
    outbox: boolean;
    /** Glanceable portfolio/team Insights — management only. */
    insights: boolean;
    /** Raise / view requests — everyone EXCEPT directors (removed from the director
     *  portal for now; staff/managers/HR keep it). */
    requests: boolean;
    /** Activity feed — everyone. */
    activity: boolean;
    /** Chat — everyone. */
    chat: boolean;
    /** Own profile — everyone. */
    profile: boolean;
    /** Meetings/events — everyone (scoped server-side). */
    meetings: boolean;
    /** Office Cleaning Registry — the receptionist (to log) + oversight roles (to
     *  view). Cap-gated finer server-side via `cleaningLog` / `cleaningOverview`. */
    cleaning: boolean;
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
    role === "director" || role === "manager" || role === "hr" || role === "receptionist" ? role : "staff";

  const isDirector = r === "director";
  const isManager = r === "manager";
  const isManagement = r === "manager" || r === "hr" || r === "director";
  // Receptionist — a stripped, data-entry-only shell: Home (announcements + to-do),
  // the Cleaning log, and Profile. Nothing else. She's not board-first, so Home shows.
  const isReceptionist = r === "receptionist";
  // Board-first operators: directors AND managers (each scoped to their companies).
  const boardFirst = isDirector || isManager;
  const groupWide = r === "hr" || r === "director";
  const canCreate = r !== "staff" && !isReceptionist;

  return {
    isDirector,
    isManagement,
    groupWide,
    canCreate,
    tabs: {
      board: boardFirst,
      home: !boardFirst,
      tasks: isManagement,
      directory: !isReceptionist,
      outbox: isManagement,
      insights: isManagement,
      // Requests are hidden from the director portal for now (directors don't triage
      // requests here); everyone else keeps them — except the receptionist.
      requests: !isDirector && !isReceptionist,
      activity: !isReceptionist,
      chat: !isReceptionist,
      profile: true,
      meetings: !isReceptionist,
      // Cleaning: the receptionist logs it; managers/HR/directors see the overview.
      cleaning: isReceptionist || isManagement,
    },
  };
}

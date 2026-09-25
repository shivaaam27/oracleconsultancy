/**
 * The two fixed, role-based UI flags a few portal pages still read
 * (`isManagement`, `canCreate`). Everything owner-configurable lives in
 * `portal-permissions.ts` and reaches a page as `me.caps.<key>` — prefer that
 * for anything new. The navigation tabs this file used to describe went with
 * the old portal rail and pill (26 Sept 2026).
 *
 * CLIENT-SAFE + PURE: no server imports. `import type { PortalRole }` is fine —
 * types are erased at build time.
 *
 * These are UI affordance flags only — every data read is still re-verified
 * server-side (see `@/lib/portal-auth`).
 */

import type { PortalRole } from "@/lib/portal-auth";

export type PortalCapabilities = {
  /** Management tier: manager or director. */
  isManagement: boolean;
  /** May create things (events, etc.). Anyone above staff, bar the receptionist. */
  canCreate: boolean;
};

/** Unknown / undefined roles are treated as least-privilege "staff". */
export function portalCapabilities(role: PortalRole | string | undefined): PortalCapabilities {
  const r: PortalRole =
    role === "director" || role === "manager" || role === "receptionist" ? role : "staff";
  return {
    isManagement: r === "manager" || r === "director",
    canCreate: r !== "staff" && r !== "receptionist",
  };
}

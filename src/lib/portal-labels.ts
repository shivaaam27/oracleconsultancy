/**
 * portal-labels.ts — the SINGLE source for how a portal role is labelled.
 *
 * Client-safe (no server imports) so both the portal header (server component)
 * and the admin person card/drawer (client) can share it. A person may carry an
 * optional `portalDesignation` (e.g. "Group Admin Manager") that overrides the
 * plain role label everywhere — that's the hook for per-manager tiers later.
 */

const HEADER_LABEL: Record<string, string> = {
  manager: "Manager portal",
  hr: "Admin portal",
  director: "Director board",
  staff: "Staff portal",
  receptionist: "Reception",
};

const BADGE_LABEL: Record<string, string> = {
  manager: "Manager",
  director: "Director",
  hr: "Admin",
  staff: "Staff",
  receptionist: "Receptionist",
};

/** Portal header line ("… · Manager portal"), overridden by a designation. */
export function portalHeaderLabel(role: string | null | undefined, designation?: string | null): string {
  const d = designation?.trim();
  if (d) return d;
  return HEADER_LABEL[role ?? "staff"] ?? "Staff portal";
}

/** Admin role badge ("Manager"), overridden by a designation. */
export function portalRoleBadge(role: string | null | undefined, designation?: string | null): string {
  const d = designation?.trim();
  if (d) return d;
  return BADGE_LABEL[role ?? "staff"] ?? "Staff";
}

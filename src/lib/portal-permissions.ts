/**
 * Portal permissions model — the single, owner-configurable source of truth for
 * what each portal role may DO (capabilities) and SEE (company scope).
 *
 * PURE + CLIENT-SAFE: no DB, no server-only imports, so both the nav pill (client)
 * and every server gate can read the same rules. The stored config (a single
 * settings row) is loaded server-side by `portal-permissions-store.ts` and merged
 * over the DEFAULTS here; the resolvers below are what everything actually calls.
 *
 * DEFAULTS below mirror today's hard-coded behaviour exactly, so an untouched
 * config changes nothing. Two things are deliberately NOT togg-able and are
 * enforced in code regardless of config:
 *   • a person may ALWAYS manage a task they created (creator rule);
 *   • the Command Centre owner/admin bypasses all of this (not a portal person).
 */

export type PortalRoleKey = "staff" | "manager" | "hr" | "director";
export const PORTAL_ROLES: PortalRoleKey[] = ["staff", "manager", "hr", "director"];
export const ROLE_LABEL: Record<PortalRoleKey, string> = {
  staff: "Staff",
  manager: "Manager",
  hr: "Admin",
  director: "Director",
};

/** Company data-visibility level. "own" = only their own items; "companies" =
 *  every item in the companies they belong to; "all" = the whole portfolio. */
export type ScopeLevel = "own" | "companies" | "all";
export const SCOPE_LEVELS: { value: ScopeLevel; label: string; hint: string }[] = [
  { value: "own", label: "Own only", hint: "Only tasks/records they own or are on." },
  { value: "companies", label: "Their companies", hint: "Everything in the companies they belong to." },
  { value: "all", label: "All companies", hint: "The whole portfolio — every company." },
];

export type CapabilityKey =
  | "createTasks"
  | "manageAnyTask"
  | "bulkTaskActions"
  | "crossCompanyTasks"
  | "messageOnTasks"
  | "bulkOutreach"
  | "createEvents"
  | "approveLeave"
  | "navTasks"
  | "navOutbox"
  | "navInsights"
  | "navRequests";

/** UI grouping + copy for the Settings matrix. */
export type CapabilityMeta = { key: CapabilityKey; label: string; desc: string };
export const CAPABILITY_GROUPS: { id: string; label: string; caps: CapabilityMeta[] }[] = [
  {
    id: "tasks",
    label: "Tasks",
    caps: [
      { key: "createTasks", label: "Create tasks", desc: "Raise new tasks from the portal." },
      { key: "manageAnyTask", label: "Manage any task", desc: "Edit, complete, close or delete any task in their scope (not just ones they raised)." },
      { key: "bulkTaskActions", label: "Bulk actions", desc: "Select many tasks to postpone or delete at once." },
      { key: "crossCompanyTasks", label: "Copy / move across companies", desc: "Copy a task to, or move it between, companies. Needs all-company scope." },
    ],
  },
  {
    id: "comms",
    label: "Communication",
    caps: [
      { key: "messageOnTasks", label: "Message / remind on a task", desc: "Message everyone on a task or send a reminder." },
      { key: "bulkOutreach", label: "Bulk outreach", desc: "Group emails, broadcasts and drafted messages beyond a single task." },
    ],
  },
  {
    id: "schedule",
    label: "Scheduling & leave",
    caps: [
      { key: "createEvents", label: "Create events / meetings", desc: "Schedule calendar events and meetings." },
      { key: "approveLeave", label: "Approve leave", desc: "Approve or reject their team's leave requests." },
    ],
  },
  {
    id: "nav",
    label: "Navigation & surfaces",
    caps: [
      { key: "navTasks", label: "Tasks tab", desc: "The filterable Tasks list in the nav pill." },
      { key: "navOutbox", label: "Outbox", desc: "Drafted messages / reminders surface." },
      { key: "navInsights", label: "Insights", desc: "Glanceable portfolio / team insights." },
      { key: "navRequests", label: "Requests", desc: "Raise and view requests (equipment, HR, admin)." },
    ],
  },
];

const ALL_CAP_KEYS: CapabilityKey[] = CAPABILITY_GROUPS.flatMap((g) => g.caps.map((c) => c.key));

/** DEFAULTS — an exact mirror of today's hard-coded rules. */
export const DEFAULT_SCOPE: Record<PortalRoleKey, ScopeLevel> = {
  staff: "own",
  manager: "companies",
  hr: "all",
  director: "all",
};

export const DEFAULT_CAPS: Record<CapabilityKey, Record<PortalRoleKey, boolean>> = {
  createTasks: { staff: false, manager: true, hr: true, director: true },
  manageAnyTask: { staff: false, manager: false, hr: true, director: true },
  bulkTaskActions: { staff: false, manager: true, hr: true, director: true },
  crossCompanyTasks: { staff: false, manager: false, hr: true, director: true },
  messageOnTasks: { staff: false, manager: true, hr: true, director: true },
  bulkOutreach: { staff: false, manager: false, hr: false, director: true },
  createEvents: { staff: false, manager: true, hr: true, director: true },
  approveLeave: { staff: false, manager: true, hr: false, director: false },
  navTasks: { staff: false, manager: true, hr: true, director: true },
  navOutbox: { staff: false, manager: true, hr: true, director: true },
  navInsights: { staff: false, manager: true, hr: true, director: true },
  navRequests: { staff: true, manager: true, hr: true, director: false },
};

/** The stored (partial) override config — only the cells the owner changed. */
export type PortalPermissionsConfig = {
  scope?: Partial<Record<PortalRoleKey, ScopeLevel>>;
  caps?: Partial<Record<CapabilityKey, Partial<Record<PortalRoleKey, boolean>>>>;
};

function normaliseRole(role: string | null | undefined): PortalRoleKey {
  return role === "manager" || role === "hr" || role === "director" ? role : "staff";
}

/** The scope level for a role, config merged over defaults. */
export function scopeLevelFor(config: PortalPermissionsConfig | null | undefined, role: string | null | undefined): ScopeLevel {
  const r = normaliseRole(role);
  return config?.scope?.[r] ?? DEFAULT_SCOPE[r];
}

/** Whether a role has a capability, config merged over defaults. */
export function permits(config: PortalPermissionsConfig | null | undefined, role: string | null | undefined, cap: CapabilityKey): boolean {
  const r = normaliseRole(role);
  const override = config?.caps?.[cap]?.[r];
  return override ?? DEFAULT_CAPS[cap][r];
}

/** Fully-resolved permissions for one role — a flat, serialisable object safe to
 *  hand to client components. */
export type ResolvedRolePerms = { scopeLevel: ScopeLevel; caps: Record<CapabilityKey, boolean> };
export function resolveRolePerms(config: PortalPermissionsConfig | null | undefined, role: string | null | undefined): ResolvedRolePerms {
  const caps = {} as Record<CapabilityKey, boolean>;
  for (const k of ALL_CAP_KEYS) caps[k] = permits(config, role, k);
  return { scopeLevel: scopeLevelFor(config, role), caps };
}

/** The full resolved matrix (every role) — for the Settings UI. */
export function resolveMatrix(config: PortalPermissionsConfig | null | undefined) {
  const scope = {} as Record<PortalRoleKey, ScopeLevel>;
  const caps = {} as Record<CapabilityKey, Record<PortalRoleKey, boolean>>;
  for (const role of PORTAL_ROLES) scope[role] = scopeLevelFor(config, role);
  for (const k of ALL_CAP_KEYS) {
    caps[k] = {} as Record<PortalRoleKey, boolean>;
    for (const role of PORTAL_ROLES) caps[k][role] = permits(config, role, k);
  }
  return { scope, caps };
}

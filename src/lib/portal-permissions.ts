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
 *   • the Administrator owner/admin bypasses all of this (not a portal person).
 */

export type PortalRoleKey = "staff" | "manager" | "director" | "receptionist";
// "hr" (Admin) was removed on 26 Sept 2026 — nobody held it (owner).
export const PORTAL_ROLES: PortalRoleKey[] = ["staff", "manager", "director", "receptionist"];
export const ROLE_LABEL: Record<PortalRoleKey, string> = {
  staff: "Staff",
  manager: "Manager",
  director: "Director",
  receptionist: "Receptionist",
};

/** Company data-visibility level. "own" = only their own items; "companies" =
 *  every item in the companies they belong to; "all" = the whole portfolio. */
export type ScopeLevel = "own" | "companies" | "all";
export const SCOPE_LEVELS: { value: ScopeLevel; label: string; hint: string }[] = [
  { value: "own", label: "Own only", hint: "Only tasks/records they own or are on." },
  { value: "companies", label: "Their companies", hint: "Everything in the companies they belong to." },
  { value: "all", label: "All companies", hint: "The whole portfolio — every company." },
];

/** What a scope level means, in one phrase, for the screens that have to SAY it
 *  rather than offer it. One copy so the access list, the grant form and the
 *  permissions matrix can never word the same rule differently. */
export const SCOPE_WORDS: Record<ScopeLevel, string> = {
  all: "every company",
  companies: "the companies on their record",
  own: "only their own work",
};

export type CapabilityKey =
  | "createTasks"
  | "manageAnyTask"
  | "bulkTaskActions"
  | "crossCompanyTasks"
  | "recurringTasks"
  | "messageOnTasks"
  | "bulkOutreach"
  | "createEvents"
  | "navTasks"
  | "navOutbox"
  | "oriAsk"
  | "oriAct"
  | "cleaningLog"
  | "cleaningOverview"
  | "directorBrief";

/** UI grouping + copy for the Settings matrix. */
export type CapabilityMeta = { key: CapabilityKey; label: string; desc: string };
export const CAPABILITY_GROUPS: { id: string; label: string; caps: CapabilityMeta[] }[] = [
  {
    id: "tasks",
    label: "Tasks",
    caps: [
      { key: "createTasks", label: "Create tasks", desc: "Raise new tasks." },
      { key: "manageAnyTask", label: "Manage any task", desc: "Edit, complete, close or delete any task in their scope (not just ones they raised)." },
      { key: "bulkTaskActions", label: "Bulk actions", desc: "Select many tasks to postpone or delete at once." },
      { key: "crossCompanyTasks", label: "Copy / move across companies", desc: "Copy a task to, or move it between, companies. Needs all-company scope." },
      { key: "recurringTasks", label: "Recurring tasks", desc: "Add a repeat schedule (weekly days or monthly) when creating a task, and manage their standing repeat rules." },
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
    ],
  },
  {
    id: "nav",
    label: "Navigation & surfaces",
    caps: [
      { key: "navTasks", label: "Tasks", desc: "The Tasks list, with its filters. Staff always have one — their own tasks only." },
      { key: "navOutbox", label: "Outbox", desc: "The Outbox: reminders drafted from open tasks, for the people in their companies. Directors and managers only — staff have no Outbox." },
      { key: "directorBrief", label: "Report", desc: "The Report panel: company / person / period, then the PDF, email with the PDF attached, WhatsApp or copy. Always limited to the companies they may see." },
    ],
  },
  {
    id: "ori",
    label: "ORI assistant",
    caps: [
      { key: "oriAsk", label: "Use ORI (ask & search)", desc: "Search and ask ORI questions, within their permitted scope." },
      { key: "oriAct", label: "Act with ORI", desc: "Let ORI create or update tasks and take actions, within their scope and other permissions." },
    ],
  },
  {
    id: "cleaning",
    label: "Office cleaning (OCR)",
    caps: [
      { key: "cleaningLog", label: "Log daily cleaning", desc: "Tick rooms cleaned, add per-room comments and sign off the day. This is the receptionist's data-entry surface." },
      { key: "cleaningOverview", label: "See cleaning overview", desc: "View the cleaning register and history (who cleaned, room status, comments) — read-only oversight." },
    ],
  },
];

const ALL_CAP_KEYS: CapabilityKey[] = CAPABILITY_GROUPS.flatMap((g) => g.caps.map((c) => c.key));

/** DEFAULTS — an exact mirror of today's hard-coded rules. */
export const DEFAULT_SCOPE: Record<PortalRoleKey, ScopeLevel> = {
  staff: "own",
  manager: "companies",
  director: "all",
  receptionist: "own",
};

// The receptionist is a data-entry-only role: every task/comms/nav power is OFF —
// her portal is just Home (announcements + to-do) + the cleaning log. Only the two
// cleaning caps are on. cleaningOverview is on for the oversight roles (manager/
// director) so the Administrator view can be ported to them (e.g. Shivam).
export const DEFAULT_CAPS: Record<CapabilityKey, Record<PortalRoleKey, boolean>> = {
  createTasks: { staff: false, manager: true, director: true, receptionist: false },
  /* ⚠️ MANAGERS MANAGE ANY TASK (owner, 28 Aug 2026) — "editable by all
     directors and managers". The live settings row had already said so; this
     default was still `false`, so the code and the running system disagreed and
     a fresh deployment would have behaved differently from this one. They agree
     now. The owner can still switch it off per role in Settings → Portals. */
  manageAnyTask: { staff: false, manager: true, director: true, receptionist: false },
  bulkTaskActions: { staff: false, manager: true, director: true, receptionist: false },
  crossCompanyTasks: { staff: false, manager: true, director: true, receptionist: false },
  recurringTasks: { staff: false, manager: true, director: true, receptionist: false },
  messageOnTasks: { staff: false, manager: true, director: true, receptionist: false },
  bulkOutreach: { staff: false, manager: true, director: true, receptionist: false },
  createEvents: { staff: false, manager: true, director: true, receptionist: false },
  // Staff: on since the Studio screens (26 Sept 2026) — their tasks are a page of their own now.
  navTasks: { staff: true, manager: true, director: true, receptionist: false },
  // Directors' and managers' Studio Outbox (/outbox + its footer stop). The old
  // staff /portal/outbox page and the Insights page (navInsights) were removed
  // 26 Sept 2026; a stored row still naming navInsights is simply ignored —
  // every reader walks ALL_CAP_KEYS, never the stored keys.
  navOutbox: { staff: false, manager: true, director: true, receptionist: false },
  oriAsk: { staff: true, manager: true, director: true, receptionist: false },
  oriAct: { staff: false, manager: true, director: true, receptionist: false },
  cleaningLog: { staff: false, manager: false, director: false, receptionist: true },
  // Overview is the manager/receptionist working view (e.g. Shivam) — directors and
  // HR don't need the cleaning register on their portal (flipped off Jul 2026).
  cleaningOverview: { staff: false, manager: true, director: false, receptionist: true },
  // Mirrors today's rule exactly: the brief download was directors-only.
  // Managers match directors (owner, 26 Sept 2026), over their own companies.
  directorBrief: { staff: false, manager: true, director: true, receptionist: false },
};

/** The stored (partial) override config — only the cells the owner changed. */
export type PortalPermissionsConfig = {
  scope?: Partial<Record<PortalRoleKey, ScopeLevel>>;
  caps?: Partial<Record<CapabilityKey, Partial<Record<PortalRoleKey, boolean>>>>;
};

/** Extract a director's scoped company-id set from a `people` row (join-table
 *  embed `director_companies(company_id)`), falling back to the legacy single
 *  `director_company_id` column where the join table was never written.
 *
 *  ⚠️ ONE READER for a scope stored in two places. There were three copies of
 *  this — in portal-auth, in the Settings page and in the person record — so a
 *  fix to the fallback had to be made three times or the screens disagreed. */
export function directorScopeOf(row: {
  director_company_id?: number | null;
  director_companies?: { company_id: number }[] | { company_id: number } | null;
}): number[] {
  const raw = row.director_companies;
  const rows = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const ids = rows.map((r) => r.company_id).filter((n): n is number => typeof n === "number");
  if (ids.length === 0 && row.director_company_id != null) return [row.director_company_id];
  return Array.from(new Set(ids));
}

/** Coerce a stored role string to a real role. Client-safe — the server twin
 *  is `parsePortalRole` in `lib/portal-access.ts`, which calls this shape. */
export function asPortalRole(role: string | null | undefined): PortalRoleKey {
  return normaliseRole(role);
}

function normaliseRole(role: string | null | undefined): PortalRoleKey {
  return role === "manager" || role === "director" || role === "receptionist" ? role : "staff";
}

/* ── The two safety rules that govern a change of access ──────────────────── */

/** How much a level outranks another. Receptionist is a lateral, low-power role,
 *  not a step above Staff. */
const RANK: Record<PortalRoleKey, number> = { staff: 0, receptionist: 0, manager: 1, director: 2 };

/**
 * COMPIP-01 — the level to store when a password is RESET on somebody who
 * already has access. A reset form can submit a defaulted "staff", which would
 * strip an Admin, Manager or Director of their access as a side effect of
 * changing a password. So a reset can raise a level but never lower one; a
 * deliberate demotion goes through a role change or a revoke.
 */
export function roleAfterReset(previous: PortalRoleKey, requested: PortalRoleKey): PortalRoleKey {
  return RANK[requested] < RANK[previous] ? previous : requested;
}

/**
 * The company scope to store for a level. ⚠️ Only a Director may carry one —
 * anything else is cleared, so demoting a scoped director and promoting them
 * again months later can never silently restore the old set of companies.
 */
export function scopeForRole(role: PortalRoleKey, companyIds: number[]): number[] {
  if (role !== "director") return [];
  return [...new Set(companyIds.filter((n) => Number.isFinite(n) && n > 0))];
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

/** Only the cells that differ from the built-in defaults. The Settings grid posts
 *  the WHOLE resolved matrix; storing that pinned every cell, so a later change
 *  to DEFAULT_CAPS / DEFAULT_SCOPE never reached anyone (audit 24 Sept 2026).
 *  Accepts anything shaped like a config and ignores unknown roles/keys. */
export function diffFromDefaults(config: PortalPermissionsConfig | null | undefined): PortalPermissionsConfig {
  const out: PortalPermissionsConfig = {};
  for (const role of PORTAL_ROLES) {
    const v = config?.scope?.[role];
    if (v && v !== DEFAULT_SCOPE[role]) (out.scope ??= {})[role] = v;
  }
  for (const k of ALL_CAP_KEYS) {
    for (const role of PORTAL_ROLES) {
      const v = config?.caps?.[k]?.[role];
      if (typeof v === "boolean" && v !== DEFAULT_CAPS[k][role]) ((out.caps ??= {})[k] ??= {})[role] = v;
    }
  }
  return out;
}

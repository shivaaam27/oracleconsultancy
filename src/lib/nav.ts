import {
  Ship,
  Users,
  Send,
  Settings,
  FileText,
  CalendarClock,
  Scale,
  Package,
  Laptop,
  CalendarDays,
  Sparkles,
  Building2,
  BarChart3,
  FileWarning,
  Megaphone,
  ListChecks,
  Activity,
  Zap,
  MessageSquare,
  ClipboardList,
  KanbanSquare,
  UserSearch,
  StickyNote,
  DraftingCompass,
  Scale as ScaleIcon,
  CheckSquare,
  Home,
  Briefcase,
  BookOpen,
  Handshake,
  CalendarCheck,
  Trophy,
  ClipboardCheck,
  BookText,
  Receipt,
  Percent,
  Candy,
  type LucideIcon,
} from "lucide-react";

export type NavRoute = {
  id: string;
  href: string;
  label: string;
  icon: LucideIcon;
};

/**
 * Single source of truth for every "Go to" destination — the launcher grid in
 * the nav pill AND the pinnable nav rail (Settings) AND the ⌘K page-jump list
 * all read from this one list, so they can never drift apart.
 *
 * Order here is the default order. The command centre (`/`, with its Overview/
 * Companies/Tasks tabs) is reached via the Home button in the pill, so it isn't
 * listed as a destination.
 */
export const NAV_ROUTES: NavRoute[] = [
  { id: "approvals",   href: "/approvals",           label: "Approvals",           icon: ListChecks },
  { id: "announcements", href: "/announcements",      label: "Announcements",       icon: Megaphone },
  { id: "tax-legal",   href: "/hrms/command-centre", label: "Tax & Legal",        icon: Scale },
  { id: "supplies",    href: "/hrms/supplies",       label: "Supplies",            icon: Package },
  { id: "assets",      href: "/hrms/assets",         label: "Assets, Tools & Vendors", icon: Laptop },
  { id: "leave",       href: "/hrms/leave",          label: "Attendance",          icon: CalendarDays },
  { id: "commitments", href: "/hrms/commitments",    label: "Commitments",         icon: FileWarning },
  // The PES trading and import business — Stage 1 is its master lists; the
  // order screens follow. See memory/pes_ops_module.md.
  { id: "ops",         href: "/ops",                 label: "Orders & Imports",    icon: Ship },
  // The general ledger — chart of accounts, journals, entries. COS is the
  // accounting system now (owner, Aug 2026); see `memory/erp_gap_plan.md`.
  { id: "ledger",      href: "/ledger",              label: "Ledger",              icon: ScaleIcon },
  // ⚠️ "Brief" means the DIRECTOR BRIEF at /brief. This entry used to be labelled
  // "Brief" while pointing at /calendar, so the sidebar's Brief opened the diary
  // and the real Brief had no entry at all.
  { id: "calendar",    href: "/calendar",            label: "Calendar",            icon: CalendarClock },
  { id: "brief",       href: "/brief",               label: "Director Brief",      icon: ClipboardList },
  { id: "chat",        href: "/chat",                label: "Chat",                icon: MessageSquare },
  { id: "pipeline",    href: "/hrms/pipeline",       label: "Applications",        icon: KanbanSquare },
  { id: "cleaning",    href: "/hrms/cleaning",       label: "Cleaning",            icon: Sparkles },
  { id: "projects",    href: "/projects",            label: "Projects",            icon: DraftingCompass },
  // Oracle Consultancy's recruitment agency — India to Tanzania sourcing.
  // See memory/recruitment_module_plan.md.
  { id: "recruitment", href: "/recruitment",         label: "Recruitment",         icon: UserSearch },
  { id: "companies",   href: "/companies",           label: "Companies",           icon: Building2 },
  { id: "people",      href: "/people",              label: "People",              icon: Users },
  { id: "documents",   href: "/documents",           label: "Documents",           icon: FileText },
  { id: "notes",       href: "/notes",               label: "Notes",               icon: StickyNote },
  { id: "outbox",      href: "/outbox",              label: "Outbox",              icon: Send },
  { id: "activity",    href: "/activity",            label: "Activity log",        icon: Activity },
  { id: "ori-automations", href: "/ori-automations", label: "ORI Automation",      icon: Zap },
  { id: "insights",    href: "/insights",            label: "Insights",            icon: BarChart3 },
  { id: "settings",    href: "/settings",            label: "Settings",            icon: Settings },

  /* Sub-pages of the Recruitment and Ledger modules.
   *
   * ⚠️ ADDING routes is safe; RENAMING one is not (see LEGACY_ROUTE_IDS below).
   * These existed as pages already and were simply unreachable from any rail —
   * you had to be on the desk and click through. Listing them here also puts
   * them in ⌘K and in the pinnable list, which is the point. */
  { id: "rec-orders",     href: "/recruitment/orders",     label: "Job orders",   icon: Briefcase },
  { id: "rec-candidates", href: "/recruitment/candidates", label: "Candidates",   icon: Users },
  { id: "rec-clients",    href: "/recruitment/clients",    label: "Clients",      icon: Handshake },
  { id: "rec-shortlists", href: "/recruitment/shortlists", label: "Shortlists",   icon: ClipboardCheck },
  { id: "rec-interviews", href: "/recruitment/interviews", label: "Interviews",   icon: CalendarCheck },
  { id: "rec-placements", href: "/recruitment/placements", label: "Placements",   icon: Trophy },

  { id: "ledger-journals", href: "/ledger/journals",       label: "Journals",     icon: BookText },
  { id: "ledger-entries",  href: "/ledger/entries",        label: "Entries",      icon: Receipt },
  { id: "ledger-reports",  href: "/ledger/reports",        label: "Reports",      icon: BarChart3 },
  { id: "ledger-tax",      href: "/ledger/tax",            label: "Tax rates",    icon: Percent },

  /* CocoZuri Operations — Phase 1. See memory/cocozuri_ops_plan.md. */
  { id: "cz-desk",      href: "/cocozuri",            label: "CocoZuri",   icon: Candy },
  { id: "cz-products",  href: "/cocozuri/products",   label: "Products",   icon: Package },
  { id: "cz-customers", href: "/cocozuri/customers",  label: "Customers",  icon: Building2 },
  { id: "cz-invoices",  href: "/cocozuri/invoices",   label: "Invoices",   icon: Receipt },
];

export const ROUTE_BY_ID: Record<string, NavRoute> = Object.fromEntries(
  NAV_ROUTES.map((r) => [r.id, r])
);

/**
 * ONE grouping of the system, used by every navigation surface.
 *
 * ⚠️ There used to be two maps of the same product: the desktop sidebar grouped
 * pages as Work / Records / Registers / System, while the mobile launcher grouped
 * the SAME pages into seven colour-coded "Worlds" with their own `/world/<slug>`
 * screens. The two lists never held the same pages, so a page could be in one and
 * missing from the other — which is exactly how Chat, the Director Brief and the
 * Applications board became unreachable. Worlds was retired in Aug 2026; this is
 * the single source now.
 *
 * FORWARD RULE: add a route to NAV_ROUTES, then put its id in a group below.
 * A route in neither is reachable only by typing its address.
 */
export type NavGroup = { label: string; ids: string[] };

/* ------------------------------------------------------------------ *
 * MODULES — the layer above the groups.
 *
 * The rail had grown to 23 destinations in one column, which is a list rather
 * than a filing system, and a sixth business (CocoZuri) was about to make it 24.
 * So the app is divided the way the BUSINESSES are divided, the way ERPNext
 * divides itself: a launcher of modules, and a rail that shows the module you
 * are actually in.
 *
 * ⚠️ THE ROUTE LIST ABOVE IS UNTOUCHED BY THIS, AND THAT IS THE WHOLE TRICK.
 * Not one id, address or label changed. Pins are stored as ids and silently drop
 * anything they do not recognise; ⌘K, recents and the mobile launcher all read
 * `NAV_ROUTES`. Because none of that moved, none of it breaks — a module is only
 * a way of ARRANGING routes, never a way of renaming them.
 *
 * ⚠️ Two safety nets, and both matter:
 *   1. `moduleForPath` falls back to Task Management, so an address belonging to
 *      no module can never render an empty rail.
 *   2. `NAV_GROUPS` below is DERIVED from these modules, so `ungroupedRouteIds()`
 *      still catches a route that was added and never filed — and `nav.test.ts`
 *      asserts every route lives in exactly one place.
 *
 * FORWARD RULE: a new module is one entry here. A new page inside an existing
 * module is one `NAV_ROUTES` entry plus its id in that module's groups.
 * ------------------------------------------------------------------ */

export type NavModule = {
  id: string;
  label: string;
  icon: LucideIcon;
  /** One line on the launcher tile — what this is FOR, in plain words. */
  blurb: string;
  /** Where the tile takes you. */
  home: string;
  /** Address prefixes that mean "you are in here". Longest match wins. */
  match: string[];
  /** Links that are not `NAV_ROUTES` entries — the hub's own tabs. */
  lead?: { href: string; label: string; icon: LucideIcon }[];
  groups: NavGroup[];
  /** Shown on the launcher, kept out of the rail: the module is not built yet. */
  soon?: boolean;
};

/** Belongs to the whole app, not to any one module, so it sits at the foot of
 *  every rail. Burying Settings inside one business would be wrong. */
export const SYSTEM_GROUP: NavGroup = {
  label: "System",
  ids: ["insights", "activity", "ori-automations", "settings"],
};

export const MODULES: NavModule[] = [
  {
    id: "tasks",
    label: "Task Management",
    icon: CheckSquare,
    blurb: "The day to day — tasks, people, papers and the operational registers.",
    home: "/",
    // Deliberately no `match`: this is the fallback, so anything that belongs to
    // no other module lands here rather than nowhere.
    match: [],
    lead: [
      { href: "/", label: "Home", icon: Home },
      { href: "/?tab=tasks", label: "Tasks", icon: CheckSquare },
    ],
    groups: [
      { label: "Work", ids: ["approvals", "notes", "outbox", "chat", "calendar", "brief", "announcements"] },
      { label: "Records", ids: ["people", "companies", "documents", "assets"] },
      // Was "Registers" until Aug 2026 — the word meant three things at once (this
      // group, the commitments page, and the legacy /registry task list). The pages
      // in here are the day-to-day operational logs, so that is what it is called.
      { label: "Operations", ids: ["tax-legal", "commitments", "ops", "pipeline", "leave", "supplies", "cleaning"] },
    ],
  },
  {
    id: "recruitment",
    label: "Recruitment",
    icon: UserSearch,
    blurb: "Indian professionals for Tanzanian employers — orders, shortlists, placements.",
    home: "/recruitment",
    match: ["/recruitment"],
    groups: [
      { label: "Desk", ids: ["recruitment", "rec-orders", "rec-candidates", "rec-clients"] },
      { label: "In progress", ids: ["rec-shortlists", "rec-interviews", "rec-placements"] },
    ],
  },
  {
    id: "ledger",
    label: "Ledger",
    icon: ScaleIcon,
    blurb: "The books — chart of accounts, journals, reports and tax.",
    home: "/ledger",
    match: ["/ledger"],
    groups: [
      { label: "Books", ids: ["ledger", "ledger-journals", "ledger-entries"] },
      { label: "Output", ids: ["ledger-reports", "ledger-tax"] },
    ],
  },
  {
    id: "projects",
    label: "Projects",
    icon: DraftingCompass,
    blurb: "Capital projects — budgets, requisitions, funds and site progress.",
    home: "/projects",
    match: ["/projects"],
    groups: [{ label: "Projects", ids: ["projects"] }],
  },
  {
    id: "cocozuri",
    label: "CocoZuri Operations",
    icon: Candy,
    blurb: "Chocolate — products, invoices, what is owed, and the daily stock book.",
    home: "/cocozuri",
    match: ["/cocozuri"],
    groups: [
      { label: "Sell", ids: ["cz-desk", "cz-invoices"] },
      { label: "Catalogue", ids: ["cz-products", "cz-customers"] },
    ],
  },
];

export const MODULE_BY_ID: Record<string, NavModule> = Object.fromEntries(
  MODULES.map((m) => [m.id, m])
);

/** The module an address belongs to. Longest prefix wins; Task Management is the
 *  fallback, so there is no such thing as a page with no rail. */
export function moduleForPath(pathname: string): NavModule {
  let best: NavModule | null = null;
  let bestLen = -1;
  for (const m of MODULES) {
    for (const prefix of m.match) {
      if ((pathname === prefix || pathname.startsWith(prefix + "/")) && prefix.length > bestLen) {
        best = m;
        bestLen = prefix.length;
      }
    }
  }
  return best ?? MODULE_BY_ID.tasks!;
}

/** One module's rail: its own groups, then System underneath. */
export function moduleGroups(m: NavModule): { label: string; items: NavRoute[] }[] {
  return [...m.groups, SYSTEM_GROUP]
    .map((g) => ({ label: g.label, items: g.ids.map((id) => ROUTE_BY_ID[id]).filter(Boolean) }))
    .filter((g) => g.items.length > 0);
}

/**
 * Every group in the system, DERIVED from the modules.
 *
 * ⚠️ Derived, not written out again. The mobile launcher shows the whole map on
 * one screen (there is no rail on a phone to be scoped), and it must never fall
 * out of step with the modules — which is exactly what happened the last time
 * two lists described the same product. See the note on NAV_GROUPS' history.
 */
export const NAV_GROUPS: NavGroup[] = [...MODULES.flatMap((m) => m.groups), SYSTEM_GROUP];

/**
 * The whole map, for a screen with no rail — the mobile "Go to" launcher.
 *
 * ⚠️ SECTIONED BY MODULE, not by the modules' internal group names. On a phone
 * there is no switcher and no context, so a heading reading "Desk" or "Books"
 * would say nothing about which business it belongs to. Task Management keeps
 * its own Work / Records / Operations headings because it is large and those
 * words are already familiar; the smaller modules collapse to one section named
 * after the module.
 */
export function navSections(): { label: string; items: NavRoute[] }[] {
  const out: { label: string; items: NavRoute[] }[] = [];
  for (const m of MODULES) {
    if (m.soon) continue;
    const ids = m.groups.flatMap((g) => g.ids);
    if (ids.length === 0) continue;
    if (m.match.length === 0) {
      // The fallback module (Task Management) keeps its own headings.
      for (const g of m.groups) {
        const items = g.ids.map((id) => ROUTE_BY_ID[id]).filter(Boolean);
        if (items.length) out.push({ label: g.label, items });
      }
    } else {
      const items = ids.map((id) => ROUTE_BY_ID[id]).filter(Boolean);
      if (items.length) out.push({ label: m.label, items });
    }
  }
  const system = SYSTEM_GROUP.ids.map((id) => ROUTE_BY_ID[id]).filter(Boolean);
  if (system.length) out.push({ label: SYSTEM_GROUP.label, items: system });
  return out;
}

/** The groups resolved to real routes, skipping any id that no longer exists. */
export function navGroups(): { label: string; items: NavRoute[] }[] {
  return NAV_GROUPS.map((g) => ({
    label: g.label,
    items: g.ids.map((id) => ROUTE_BY_ID[id]).filter(Boolean),
  })).filter((g) => g.items.length > 0);
}

/** Every route that isn't in a group — a build-time safety net for the sweep above. */
export function ungroupedRouteIds(): string[] {
  const grouped = new Set(NAV_GROUPS.flatMap((g) => g.ids));
  return NAV_ROUTES.filter((r) => !grouped.has(r.id)).map((r) => r.id);
}

// "inbox" was pinned here until Aug 2026, when the intake page was removed —
// a pin for a route that no longer exists just silently vanishes from the rail.
export const DEFAULT_PINS = ["approvals", "outbox", "chat"];

/**
 * Renamed route ids → their new id.
 *
 * Pins are stored in the database as a list of ids, and anything unrecognised is
 * dropped on load. So renaming an id would quietly un-pin whatever the owner had
 * pinned — the very failure the note above records. Run stored ids through
 * `resolveRouteId` and an old pin simply follows its page to the new name.
 *
 * FORWARD RULE: rename a route id, add a line here. Never just rename it.
 */
export const LEGACY_ROUTE_IDS: Record<string, string> = {
  ocr: "cleaning",        // Office Cleaning Registry → Cleaning (Aug 2026)
  oecr: "supplies",       // Office Equipment Control Registry → Supplies (Aug 2026)
  registers: "commitments", // Commitments register → Commitments (Aug 2026)
};

/** A stored id resolved to a live one, following any rename. */
export function resolveRouteId(id: string): string {
  return LEGACY_ROUTE_IDS[id] ?? id;
}

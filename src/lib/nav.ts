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
  StickyNote,
  DraftingCompass,
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
  // ⚠️ "Brief" means the DIRECTOR BRIEF at /brief. This entry used to be labelled
  // "Brief" while pointing at /calendar, so the sidebar's Brief opened the diary
  // and the real Brief had no entry at all.
  { id: "calendar",    href: "/calendar",            label: "Calendar",            icon: CalendarClock },
  { id: "brief",       href: "/brief",               label: "Director Brief",      icon: ClipboardList },
  { id: "chat",        href: "/chat",                label: "Chat",                icon: MessageSquare },
  { id: "pipeline",    href: "/hrms/pipeline",       label: "Applications",        icon: KanbanSquare },
  { id: "cleaning",    href: "/hrms/cleaning",       label: "Cleaning",            icon: Sparkles },
  { id: "projects",    href: "/projects",            label: "Projects",            icon: DraftingCompass },
  { id: "companies",   href: "/companies",           label: "Companies",           icon: Building2 },
  { id: "people",      href: "/people",              label: "People",              icon: Users },
  { id: "documents",   href: "/documents",           label: "Documents",           icon: FileText },
  { id: "notes",       href: "/notes",               label: "Notes",               icon: StickyNote },
  { id: "outbox",      href: "/outbox",              label: "Outbox",              icon: Send },
  { id: "activity",    href: "/activity",            label: "Activity log",        icon: Activity },
  { id: "ori-automations", href: "/ori-automations", label: "ORI Automation",      icon: Zap },
  { id: "insights",    href: "/insights",            label: "Insights",            icon: BarChart3 },
  { id: "settings",    href: "/settings",            label: "Settings",            icon: Settings },
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

export const NAV_GROUPS: NavGroup[] = [
  { label: "Work", ids: ["approvals", "notes", "outbox", "chat", "calendar", "brief", "announcements"] },
  { label: "Records", ids: ["people", "companies", "projects", "documents", "assets"] },
  // Was "Registers" until Aug 2026 — the word meant three things at once (this
  // group, the commitments page, and the legacy /registry task list). The pages
  // in here are the day-to-day operational logs, so that is what it is called.
  { label: "Operations", ids: ["tax-legal", "commitments", "ops", "pipeline", "leave", "supplies", "cleaning"] },
  { label: "System", ids: ["insights", "activity", "ori-automations", "settings"] },
];

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

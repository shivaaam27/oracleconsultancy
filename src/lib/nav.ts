import {
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
  { id: "oecr",        href: "/hrms/oecr",           label: "OECR",                icon: Package },
  { id: "assets",      href: "/hrms/assets",         label: "Assets, Tools & Vendors", icon: Laptop },
  { id: "leave",       href: "/hrms/leave",          label: "Attendance",          icon: CalendarDays },
  { id: "registers",   href: "/hrms/registers",      label: "Commitments register", icon: FileWarning },
  // ⚠️ "Brief" means the DIRECTOR BRIEF at /brief. This entry used to be labelled
  // "Brief" while pointing at /calendar, so the sidebar's Brief opened the diary
  // and the real Brief had no entry at all.
  { id: "calendar",    href: "/calendar",            label: "Calendar",            icon: CalendarClock },
  { id: "brief",       href: "/brief",               label: "Director Brief",      icon: ClipboardList },
  { id: "chat",        href: "/chat",                label: "Chat",                icon: MessageSquare },
  { id: "pipeline",    href: "/hrms/pipeline",       label: "Applications",        icon: KanbanSquare },
  { id: "ocr",         href: "/hrms/ocr",            label: "OCR",                 icon: Sparkles },
  { id: "companies",   href: "/companies",           label: "Companies",           icon: Building2 },
  { id: "people",      href: "/people",              label: "People",              icon: Users },
  { id: "documents",   href: "/documents",           label: "Documents",           icon: FileText },
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
  { label: "Work", ids: ["approvals", "outbox", "chat", "calendar", "brief", "announcements"] },
  { label: "Records", ids: ["people", "companies", "documents", "assets"] },
  { label: "Registers", ids: ["tax-legal", "registers", "pipeline", "leave", "oecr", "ocr"] },
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

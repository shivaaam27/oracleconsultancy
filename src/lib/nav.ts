import {
  Users,
  Send,
  Settings,
  Inbox,
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
  { id: "calendar",    href: "/calendar",            label: "Brief",               icon: CalendarClock },
  { id: "ocr",         href: "/hrms/ocr",            label: "OCR",                 icon: Sparkles },
  { id: "companies",   href: "/companies",           label: "Companies",           icon: Building2 },
  { id: "people",      href: "/people",              label: "People",              icon: Users },
  { id: "documents",   href: "/documents",           label: "Documents",           icon: FileText },
  { id: "outbox",      href: "/outbox",              label: "Outbox",              icon: Send },
  { id: "inbox",       href: "/documents?tab=sort",  label: "To Sort",             icon: Inbox },
  { id: "activity",    href: "/activity",            label: "Activity log",        icon: Activity },
  { id: "ori-automations", href: "/ori-automations", label: "ORI Automation",      icon: Zap },
  { id: "insights",    href: "/insights",            label: "Insights",            icon: BarChart3 },
  { id: "settings",    href: "/settings",            label: "Settings",            icon: Settings },
];

export const ROUTE_BY_ID: Record<string, NavRoute> = Object.fromEntries(
  NAV_ROUTES.map((r) => [r.id, r])
);

export const DEFAULT_PINS = ["inbox", "approvals", "outbox"];

import {
  Users,
  Send,
  Settings,
  NotebookPen,
  Inbox,
  FileText,
  CalendarClock,
  Network,
  Package,
  Laptop,
  CalendarDays,
  Sparkles,
  Building2,
  BarChart3,
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
  { id: "tax-legal",   href: "/hrms/command-centre", label: "Tax & Legal",        icon: CalendarClock },
  { id: "org",         href: "/hrms/org",            label: "Organogram",          icon: Network },
  { id: "oecr",        href: "/hrms/oecr",           label: "OECR",                icon: Package },
  { id: "assets",      href: "/hrms/assets",         label: "Assets, Tools & Vendors", icon: Laptop },
  { id: "leave",       href: "/hrms/leave",          label: "Leave & Attendance",  icon: CalendarDays },
  { id: "calendar",    href: "/calendar",            label: "Calendar",            icon: CalendarClock },
  { id: "ocr",         href: "/hrms/ocr",            label: "OCR",                 icon: Sparkles },
  { id: "companies",   href: "/companies",           label: "Companies",           icon: Building2 },
  { id: "people",      href: "/people",              label: "People",              icon: Users },
  { id: "documents",   href: "/documents",           label: "Documents",           icon: FileText },
  { id: "meeting",     href: "/workbook",            label: "Workbook",            icon: NotebookPen },
  { id: "letters",     href: "/letters",             label: "Letters",             icon: FileText },
  { id: "outbox",      href: "/outbox",              label: "Outbox",              icon: Send },
  { id: "inbox",       href: "/inbox",               label: "Inbox",               icon: Inbox },
  { id: "insights",    href: "/insights",            label: "Insights",            icon: BarChart3 },
  { id: "settings",    href: "/settings",            label: "Settings",            icon: Settings },
];

export const ROUTE_BY_ID: Record<string, NavRoute> = Object.fromEntries(
  NAV_ROUTES.map((r) => [r.id, r])
);

export const DEFAULT_PINS = ["inbox", "meeting", "outbox"];

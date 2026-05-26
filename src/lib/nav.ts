import {
  LayoutDashboard,
  ListChecks,
  Building2,
  Users,
  Send,
  History,
  Settings,
  AlertOctagon,
  FileText,
  NotebookPen,
  Inbox,
  CheckSquare,
  type LucideIcon,
} from "lucide-react";

export type NavRoute = {
  id: string;
  href: string;
  label: string;
  icon: LucideIcon;
};

/** Single source of truth for navigable destinations. Order here is the default order. */
export const NAV_ROUTES: NavRoute[] = [
  { id: "dashboard",   href: "/",            label: "Dashboard",  icon: LayoutDashboard },
  { id: "capture",     href: "/capture",     label: "Capture",    icon: Inbox },
  { id: "task",        href: "/task",        label: "Tasks",      icon: CheckSquare },
  { id: "registry",    href: "/registry",    label: "Registry",   icon: ListChecks },
  { id: "meeting",     href: "/meeting",     label: "Meeting",    icon: NotebookPen },
  { id: "digest",      href: "/digest",      label: "Digest",     icon: FileText },
  { id: "escalations", href: "/escalations", label: "Escalations",icon: AlertOctagon },
  { id: "companies",   href: "/companies",   label: "Companies",  icon: Building2 },
  { id: "people",      href: "/people",      label: "People",     icon: Users },
  { id: "outbox",      href: "/outbox",      label: "Outbox",     icon: Send },
  { id: "audit",       href: "/audit",       label: "Audit",      icon: History },
  { id: "settings",    href: "/settings",    label: "Settings",   icon: Settings },
];

export const ROUTE_BY_ID: Record<string, NavRoute> = Object.fromEntries(
  NAV_ROUTES.map((r) => [r.id, r])
);

export const DEFAULT_PINS = ["capture", "digest", "outbox", "task", "people"];

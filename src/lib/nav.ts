import {
  Users,
  Send,
  History,
  Settings,
  NotebookPen,
  type LucideIcon,
} from "lucide-react";

export type NavRoute = {
  id: string;
  href: string;
  label: string;
  icon: LucideIcon;
};

/**
 * Single source of truth for the pinnable nav rail. Order here is the default order.
 * The command centre (`/`, with its Overview/Companies/Tasks tabs) is reached via
 * the COS brand button in the pill, so it isn't listed as a pinnable route.
 */
export const NAV_ROUTES: NavRoute[] = [
  { id: "meeting",     href: "/meeting",     label: "Meeting",    icon: NotebookPen },
  { id: "people",      href: "/people",      label: "People",     icon: Users },
  { id: "outbox",      href: "/outbox",      label: "Outbox",     icon: Send },
  { id: "audit",       href: "/audit",       label: "Audit",      icon: History },
  { id: "settings",    href: "/settings",    label: "Settings",   icon: Settings },
];

export const ROUTE_BY_ID: Record<string, NavRoute> = Object.fromEntries(
  NAV_ROUTES.map((r) => [r.id, r])
);

export const DEFAULT_PINS = ["meeting", "outbox", "people"];

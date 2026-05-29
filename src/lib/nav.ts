import {
  Users,
  Send,
  Settings,
  NotebookPen,
  Inbox,
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
  { id: "inbox",       href: "/inbox",       label: "Inbox",      icon: Inbox },
  { id: "meeting",     href: "/workbook",    label: "Workbook",   icon: NotebookPen },
  { id: "people",      href: "/people",      label: "People",     icon: Users },
  { id: "outbox",      href: "/outbox",      label: "Outbox",     icon: Send },
  { id: "settings",    href: "/settings",    label: "Settings",   icon: Settings },
];

export const ROUTE_BY_ID: Record<string, NavRoute> = Object.fromEntries(
  NAV_ROUTES.map((r) => [r.id, r])
);

export const DEFAULT_PINS = ["inbox", "meeting", "outbox"];

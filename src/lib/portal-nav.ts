import {
  BarChart3, CalendarClock, ClipboardList, Contact, ListTodo,
  MessageCircle, Send, SprayCan, User, type LucideIcon,
} from "lucide-react";
import { portalCapabilities } from "./portal-capabilities";

/**
 * ONE map of the staff portal's destinations.
 *
 * The portal grew a second navigation surface (a desktop sidebar) alongside the
 * floating pill, and the admin side has already shown what happens when two
 * surfaces each keep their own list: the two drift, a page ends up in one and
 * missing from the other, and it silently becomes unreachable — that is exactly
 * how Chat and the Director Brief were lost before `NAV_GROUPS` was made the
 * single source. So the pill and the sidebar both read THIS.
 *
 * ⚠️ Visibility is a CAPABILITY, never a role test. Every item names a `tab` key
 * from `portalCapabilities`, and the three owner-configurable ones
 * (tasks/outbox/insights, plus cleaning) honour the per-role overrides resolved
 * on the server. Adding a hard-coded `role === "director"` here would bypass the
 * permissions engine.
 *
 * FORWARD RULE: add a portal page → add one entry here. It appears in both
 * navigations at once, for exactly the people whose capability allows it.
 */

export type PortalTabKey =
  | "board" | "home" | "tasks" | "cleaning" | "directory"
  | "chat" | "meetings" | "outbox" | "insights" | "activity" | "profile";

export type PortalNavItem = {
  id: PortalTabKey;
  href: string;
  label: string;
  icon: LucideIcon;
  /** Which group it sits under in the sidebar. The pill ignores this. */
  group: "Work" | "People" | "More";
  /** Tour tag, where the item already had one on the pill. */
  tourTag?: string;
};

/** Order is the order both navigations show. */
const ITEMS: PortalNavItem[] = [
  { id: "board",     href: "/portal/board",     label: "Board",     icon: ListTodo,      group: "Work" },
  { id: "home",      href: "/portal",           label: "Home",      icon: ClipboardList, group: "Work", tourTag: "nav-home" },
  { id: "tasks",     href: "/portal/tasks",     label: "Tasks",     icon: ClipboardList, group: "Work" },
  { id: "meetings",  href: "/portal/meetings",  label: "Briefings", icon: CalendarClock, group: "Work" },
  { id: "outbox",    href: "/portal/outbox",    label: "Outbox",    icon: Send,          group: "Work" },
  { id: "chat",      href: "/portal/chat",      label: "Chat",      icon: MessageCircle, group: "People", tourTag: "nav-chat" },
  { id: "directory", href: "/portal/directory", label: "Directory", icon: Contact,       group: "People" },
  { id: "cleaning",  href: "/portal/cleaning",  label: "Cleaning",  icon: SprayCan,      group: "More" },
  { id: "insights",  href: "/portal/insights",  label: "Insights",  icon: BarChart3,     group: "More" },
  { id: "activity",  href: "/portal/activity",  label: "Activity",  icon: ListTodo,      group: "More" },
  { id: "profile",   href: "/portal/profile",   label: "Profile",   icon: User,          group: "More", tourTag: "nav-profile" },
];

/** The owner-configurable tabs, resolved server-side and passed down. */
export type PortalTabOverrides = Partial<
  Record<"tasks" | "outbox" | "insights" | "cleaning", boolean>
>;

/** The destinations this person may see, in order. */
export function portalNavItems(
  role: string | undefined,
  overrides?: PortalTabOverrides
): PortalNavItem[] {
  const caps = portalCapabilities(role);
  return ITEMS.filter((it) => {
    const configurable = overrides?.[it.id as keyof PortalTabOverrides];
    if (configurable !== undefined) return configurable;
    return caps.tabs[it.id as keyof typeof caps.tabs] ?? false;
  });
}

/** The same items grouped for the sidebar; empty groups drop out. */
export function portalNavGroups(
  role: string | undefined,
  overrides?: PortalTabOverrides
): { label: string; items: PortalNavItem[] }[] {
  const items = portalNavItems(role, overrides);
  return (["Work", "People", "More"] as const)
    .map((label) => ({ label, items: items.filter((i) => i.group === label) }))
    .filter((g) => g.items.length > 0);
}

/**
 * Is this item the current page?
 *
 * Home is the awkward one: `/portal` is an exact match, but a task record
 * (`/portal/task/CODE`) belongs to it too, and a `startsWith` on "/portal" would
 * light up every single page.
 */
export function isPortalItemActive(item: PortalNavItem, pathname: string): boolean {
  if (item.id === "home") return pathname === "/portal" || pathname.startsWith("/portal/task/");
  return pathname === item.href || pathname.startsWith(item.href + "/");
}

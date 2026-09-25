/**
 * The Studio footer's page order — Home · ‹ page › · Settings, where ‹ and ›
 * step through every page in turn.
 *
 * ⚠️ DERIVED FROM nav.ts, never written out again. The sidebar and the footer
 * must list the same pages in the same order; a second hand-kept list is how
 * the launcher and the rail drifted apart before (see NAV_GROUPS' history).
 */
import { Home, ListChecks, Megaphone, Send, Users, FolderOpen, Building2, CalendarDays, Sparkles, UserRound, type LucideIcon, SprayCan } from "lucide-react";
import { MODULE_BY_ID, moduleOwnGroups, systemItems } from "./nav";

export type StudioStop = { id: string; label: string; href: string; group: string; icon: LucideIcon };

export function studioStops(): StudioStop[] {
  const m = MODULE_BY_ID.tasks!;
  const stops: StudioStop[] = [
    { id: "home", label: "Home", href: "/", group: "Work", icon: Home },
    { id: "tasks", label: "Tasks", href: "/?tab=tasks", group: "Work", icon: ListChecks },
  ];
  for (const g of moduleOwnGroups(m)) {
    for (const r of g.items) stops.push({ id: r.id, label: r.label, href: r.href, group: g.label, icon: r.icon });
  }
  for (const r of systemItems()) stops.push({ id: r.id, label: r.label, href: r.href, group: "System", icon: r.icon });
  return stops;
}

/** Which stop an address belongs to. Longest matching path wins, so
 *  /task/recurring is Recurring, not Tasks; any other /task/… is Tasks. */
export function stopIndexFor(pathname: string, tab?: string | null): number {
  const stops = studioStops();
  if (pathname === "/") return tab === "tasks" ? 1 : 0;
  let best = -1;
  let bestLen = -1;
  stops.forEach((s, i) => {
    const path = s.href.split("?")[0];
    if (path === "/") return;
    if ((pathname === path || pathname.startsWith(path + "/")) && path.length > bestLen) {
      best = i;
      bestLen = path.length;
    }
  });
  if (best >= 0) return best;
  // A task record (/task/CODE, /task/new) belongs to Tasks.
  if (pathname === "/task" || pathname.startsWith("/task/")) return 1;
  return 0;
}

/** The current stop and its neighbours; ‹ from Home wraps to the last page. */
export function studioNeighbours(pathname: string, tab?: string | null) {
  const stops = studioStops();
  const i = stopIndexFor(pathname, tab);
  return {
    current: stops[i],
    prev: stops[(i - 1 + stops.length) % stops.length],
    next: stops[(i + 1) % stops.length],
  };
}

/* ── A director's footer (portal unification, Sept 2026) ────────────────────
 * The same footer, with the pages a director has: the shared Home and Tasks,
 * then their portal pages (which keep the portal's own layout until each is
 * rebuilt on the shared screens). ⚠️ Every href here must be a page the front
 * door lets a director reach — src/proxy.ts DIRECTOR_PATHS, or /portal/…. */
export function directorStops(o: { outbox: boolean; cleaning?: boolean }): StudioStop[] {
  return [
    { id: "home", label: "Home", href: "/", group: "Work", icon: Home },
    { id: "tasks", label: "Tasks", href: "/?tab=tasks", group: "Work", icon: ListChecks },
    { id: "calendar", label: "Calendar", href: "/calendar", group: "Work", icon: CalendarDays },
    // Briefings and Directory are gone for a director (owner, 25 Sept 2026):
    // meetings live in Calendar, contacts in People. Announcements is closed
    // until it is rebuilt (StudioRebuilding) — add it back here then. (Chat was
    // removed 26 Sept 2026.)
    ...(o.outbox ? [{ id: "outbox", label: "Outbox", href: "/outbox", group: "Work", icon: Send }] : []),
    { id: "companies", label: "Companies", href: "/companies", group: "Records", icon: Building2 },
    { id: "people", label: "People", href: "/people", group: "Records", icon: Users },
    { id: "files", label: "Files", href: "/files", group: "Records", icon: FolderOpen },
    // A manager's cleaning overview (caps.cleaningOverview) — still the portal
    // page until Cleaning is rebuilt.
    ...(o.cleaning ? [{ id: "cleaning", label: "Cleaning", href: "/portal/cleaning", group: "Records", icon: Sparkles }] : []),
    // Their profile is a Studio page too now (26 Sept 2026) — a stop, so the
    // footer names it instead of saying "Home" while it is open.
    { id: "profile", label: "Profile", href: "/portal/profile", group: "Records", icon: UserRound },
  ];
}

/** A member of STAFF on the Studio screens (26 Sept 2026): the same stops as
 *  a director, over their own work — Companies and People are the shared
 *  screens with staff limits. Every address is
 *  under /portal, where their session lives. */
export function staffStops(opts: { tasks?: boolean; cleaning?: boolean } = {}): StudioStop[] {
  const { tasks = true, cleaning = false } = opts;
  return [
    { id: "home", label: "Home", href: "/portal", group: "Work", icon: Home },
    ...(tasks ? [{ id: "tasks", label: "Tasks", href: "/portal/tasks", group: "Work", icon: ListChecks } as StudioStop] : []),
    ...(cleaning ? [{ id: "cleaning", label: "Cleaning", href: "/portal/cleaning", group: "Work", icon: SprayCan } as StudioStop] : []),
    { id: "calendar", label: "Calendar", href: "/portal/meetings", group: "Work", icon: CalendarDays },
    { id: "announcements", label: "Announcements", href: "/portal/announcements", group: "Work", icon: Megaphone },
    { id: "companies", label: "Companies", href: "/portal/companies", group: "Records", icon: Building2 },
    { id: "people", label: "People", href: "/portal/people", group: "Records", icon: Users },
    { id: "profile", label: "Profile", href: "/portal/profile", group: "Records", icon: UserRound },
  ];
}

export function staffStopIndex(stops: StudioStop[], pathname: string): number {
  if (pathname === "/portal") return 0;
  if (pathname.startsWith("/portal/task/") || pathname === "/portal/tasks") return 1;
  const i = stops.findIndex((s) => s.href !== "/portal" && (pathname === s.href || pathname.startsWith(s.href + "/")));
  return i >= 0 ? i : 0;
}

/** Which of a director's stops an address belongs to. */
export function directorStopIndex(stops: StudioStop[], pathname: string, tab?: string | null): number {
  if (pathname === "/") return tab === "tasks" ? 1 : 0;
  if (pathname.startsWith("/task/")) return 1;
  const i = stops.findIndex((s) => s.href !== "/" && !s.href.startsWith("/?") && (pathname === s.href || pathname.startsWith(s.href + "/")));
  return i >= 0 ? i : 0;
}

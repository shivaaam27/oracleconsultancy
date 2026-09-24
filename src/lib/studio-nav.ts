/**
 * The Studio footer's page order — Home · ‹ page › · Settings, where ‹ and ›
 * step through every page in turn.
 *
 * ⚠️ DERIVED FROM nav.ts, never written out again. The sidebar and the footer
 * must list the same pages in the same order; a second hand-kept list is how
 * the launcher and the rail drifted apart before (see NAV_GROUPS' history).
 */
import { MODULE_BY_ID, moduleOwnGroups, systemItems } from "./nav";

export type StudioStop = { id: string; label: string; href: string; group: string };

export function studioStops(): StudioStop[] {
  const m = MODULE_BY_ID.tasks!;
  const stops: StudioStop[] = [
    { id: "home", label: "Home", href: "/", group: "Work" },
    { id: "tasks", label: "Tasks", href: "/?tab=tasks", group: "Work" },
  ];
  for (const g of moduleOwnGroups(m)) {
    for (const r of g.items) stops.push({ id: r.id, label: r.label, href: r.href, group: g.label });
  }
  for (const r of systemItems()) stops.push({ id: r.id, label: r.label, href: r.href, group: "System" });
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

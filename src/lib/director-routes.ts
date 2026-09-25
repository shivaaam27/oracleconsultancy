/**
 * Where a director goes when they land on an OLD portal address (owner,
 * 25 Sept 2026: "during reload, hard reload or anyway the old system never
 * shows up"). Directors use the shared Studio screens; the staff portal is for
 * managers and staff until their turn. An old address still reaches them — a
 * bookmark, a push notification, the installed app, a link in an email — so
 * the PORTAL LAYOUT sends them on BEFORE it draws anything. Per-page redirects
 * ran after the old frame and its loading skeleton had already painted, which
 * is exactly the flash he saw.
 *
 * `null` = stay: `/portal/profile` and `/portal/cleaning` are Studio pages
 * that live under the portal for them too.
 * Pure, so it is tested (director-routes.test.ts).
 */
export function studioPathForDirector(path: string, search = ""): string | null {
  const q = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const p = path.replace(/\/+$/, "") || "/portal";
  let m: RegExpExecArray | null;

  if (p === "/portal/profile") return null;
  // A manager's cleaning overview (caps.cleaningOverview) — not rebuilt yet;
  // the page sends anyone without the capability on by itself.
  if (p === "/portal/cleaning") return null;
  if (p === "/portal" || p === "/portal/board") return "/";
  if (p === "/portal/tasks") return "/?tab=tasks";
  if (p === "/portal/task/new") return "/task/new";
  if ((m = /^\/portal\/task\/([^/]+)$/.exec(p))) return `/task/${m[1]}`;
  if ((m = /^\/portal\/people\/(\d+)$/.exec(p))) return `/people/${m[1]}`;
  if (p === "/portal/directory") return "/people";
  if ((m = /^\/portal\/companies\/(\d+)$/.exec(p))) return `/companies/${m[1]}`;
  if (p === "/portal/meetings") return q.get("tab") === "announcements" ? "/announcements" : "/calendar";
  if (p === "/portal/announcements") return "/announcements";
  if (p === "/portal/outbox" || p === "/portal/team") return "/outbox";
  // Insights and anything unknown (Chat, Activity and the portal Insights page
  // were removed 26 Sept 2026): not a director screen.
  return "/";
}

/**
 * Roles that get the STAFF Studio screens (26 Sept 2026). The receptionist is
 * staff with a cleaning log and no task powers — she used to be the one person
 * still on the old portal. Her menu follows her permissions (staffStops).
 * UI only: permission checks keep reading the real role and `caps`.
 */
export function isStaffLikeRole(role: string | null | undefined): boolean {
  return role === "staff" || role === "receptionist";
}

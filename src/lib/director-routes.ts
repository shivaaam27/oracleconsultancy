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
 * `null` = stay: `/portal/profile` is the one director page not rebuilt yet.
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
  // Insights, Cleaning and anything unknown (Chat and Activity were removed
  // 26 Sept 2026): not a director screen.
  return "/";
}

/**
 * The staff pages rebuilt in Studio (26 Sept 2026) — the portal layout draws
 * the Studio frame and footer on these for a member of staff, and the old
 * chrome everywhere else until each page's turn. Grows as pages are rebuilt.
 */
export function isStaffStudioPath(path: string): boolean {
  const p = path.replace(/\/+$/, "") || "/portal";
  if (["/portal", "/portal/tasks", "/portal/profile", "/portal/people", "/portal/companies", "/portal/meetings", "/portal/announcements"].includes(p)) return true;
  return (p.startsWith("/portal/task/") && p !== "/portal/task/new") || /^\/portal\/(people|companies)\/\d+$/.test(p);
}

/**
 * Where you came from.
 *
 * A record is a PAGE with its own URL (the owner's decision, Aug 2026). The
 * price of that is the journey back: a list holds its filters, its search and
 * its place in the address bar, and a record that links back to a bare
 * `/portal/tasks` throws all of it away — you open one task and return to a
 * different list, at the top, having lost what you were working through.
 *
 * So a row link CARRIES the address it was clicked from, and the record's back
 * link reads it. One rule, one helper, every list.
 *
 * ⚠️ IT IS A PATH, NEVER A URL. `safeReturn` refuses anything that could leave
 * the site — a query parameter is attacker-supplied by definition, and a back
 * button that can be pointed at another origin is an open redirect. Everything
 * that reads the parameter goes through `safeReturn`; nothing else.
 */

import { NAV_ROUTES } from "./nav";
import { PORTAL_NAV } from "./portal-nav";

/** The query parameter that carries the return address. */
export const BACK_PARAM = "back";

/** Longer than any address this app produces, and short enough to be a nonsense
 *  filter rather than a payload. */
const MAX_RETURN = 512;

/**
 * Read a return address back out of a query string.
 *
 * Returns null for anything that is not a plain in-app path, so a caller can
 * simply fall back to its own default. The refusals, in order: nothing given;
 * too long; a control character (a newline in a header or an attribute); not
 * rooted at `/`; `//` or `/\` (protocol-relative, which IS another origin);
 * or a scheme anywhere in it.
 */
export function safeReturn(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (raw.length > MAX_RETURN) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(raw)) return null;
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return null;
  if (raw.includes("://")) return null;
  return raw;
}

/**
 * Attach the address you are leaving to a record link.
 *
 * `from` is a path with its query string — `location.pathname + location.search`
 * — because the query string IS the filter state. A `from` that is already the
 * same page, or that fails `safeReturn`, is left off rather than stored as a
 * half-truth.
 */
export function withReturn(href: string, from: string | null | undefined): string {
  const back = safeReturn(from);
  if (!back) return href;
  // Never point a record back at itself — a row that links to the page it is
  // already on would make the back link a refresh.
  if (back.split("?")[0] === href.split("?")[0]) return href;
  const [path, existing] = href.split("?");
  const params = new URLSearchParams(existing ?? "");
  params.set(BACK_PARAM, back);
  return `${path}?${params.toString()}`;
}

/** Strip the return address from a query string — for a link that should NOT
 *  inherit it (stepping to the next record keeps it; leaving does not). */
export function withoutReturn(search: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(search.toString());
  next.delete(BACK_PARAM);
  return next;
}

/* Every nav destination in the app, longest path first, so `/portal/tasks` wins
 * over `/portal` and `/ops/imports` over `/ops`. Built once. Both nav files are
 * pure data plus icons, so this stays client-safe. */
const DESTINATIONS: { href: string; label: string }[] = [
  ...NAV_ROUTES.map((r) => ({ href: r.href, label: r.label })),
  ...PORTAL_NAV.map((r) => ({ href: r.href, label: r.label })),
].sort((a, b) => b.href.length - a.href.length);

/* The administrator's home is one page with tabs, so the path alone cannot say
 * what you were looking at. */
const HOME_TABS: Record<string, string> = {
  tasks: "Tasks",
  companies: "Companies",
  overview: "Overview",
};

/**
 * A human name for a return address — what the back link should say.
 *
 * "‹ Board" and "‹ Tasks" are different promises, and a director who opened a
 * task from his board should be told he is going back to the board.
 */
export function returnLabel(path: string): string {
  const [bare, query] = path.split("?");
  if (bare === "/" || bare === "") {
    const tab = new URLSearchParams(query ?? "").get("tab");
    return (tab && HOME_TABS[tab]) || "Home";
  }
  if (bare === "/portal") return "Home";
  const hit = DESTINATIONS.find((d) => d.href !== "/" && (bare === d.href || bare.startsWith(`${d.href}/`)));
  if (hit) return hit.label;
  // Nothing in the nav owns it (a company profile, a project). Title-case the
  // last segment that is a word rather than an id.
  const segments = bare.split("/").filter(Boolean).filter((s) => !/^\d+$/.test(s));
  const last = segments[segments.length - 1];
  if (!last) return "Back";
  return last.charAt(0).toUpperCase() + last.slice(1).replace(/-/g, " ");
}

/* ------------------------------------------------------------------ *
 * Is "back" really back?
 * ------------------------------------------------------------------ */

/**
 * `router.back()` is worth far more than a link to the same address: the
 * browser restores the scroll position with it, which no forward navigation
 * can do — and it is the only thing that puts a page that is NOT a
 * `RecordList` (the activity feed, a panel on somebody's profile) back where
 * you were reading.
 *
 * ⚠️ BUT IT IS ONLY RIGHT WHEN THE RECORD IS GENUINELY THE ENTRY AFTER THE
 * LIST. Step through three records with Prev/Next and "back" is the record
 * before, not the list you are being promised. So the opener leaves a mark
 * saying which address it pushed and how deep the history was, and the back
 * link steps only when both still hold. Anything else — a bookmark, a refresh,
 * a step sideways — falls through to replacing, which always lands on the
 * right page.
 */
const PUSH_MARK = "cos.pushedInto";

/** Called as a record is opened from a list. */
export function markPush(recordHref: string): void {
  try {
    sessionStorage.setItem(PUSH_MARK, JSON.stringify({ to: recordHref, len: window.history.length }));
  } catch {
    /* blocked storage just means we replace instead of stepping */
  }
}

/** True when the previous history entry is provably the list we came from. */
export function canStepBack(): boolean {
  try {
    const raw = sessionStorage.getItem(PUSH_MARK);
    if (!raw) return false;
    const { to, len } = JSON.parse(raw) as { to?: string; len?: number };
    if (!to || typeof len !== "number") return false;
    /* ⚠️ `history.length` IS CAPPED (Chrome stops at 50) — an exact `len + 1`
     * quietly stopped being true after fifty navigations in one session, and
     * the back link fell back to replacing for the rest of the day. It cannot
     * SHRINK, so the useful test is that it has not grown by more than the one
     * push; the address below is what actually proves we are where the mark
     * says. A step sideways through Prev/Next changes that address, which is
     * the case this guard exists to catch. */
    if (window.history.length < len || window.history.length > len + 1) return false;
    return `${window.location.pathname}${window.location.search}` === to;
  } catch {
    return false;
  }
}

/** Forget the mark — after stepping back, it describes a journey that is over. */
export function clearPush(): void {
  try {
    sessionStorage.removeItem(PUSH_MARK);
  } catch {
    /* ignore */
  }
}

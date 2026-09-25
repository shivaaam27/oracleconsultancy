"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * "Open your create dialog" as a URL — the plumbing behind the global New menu.
 *
 * Almost nothing in Oracle is created at a route. `/task/new` is a real page, but a
 * document, a person, an asset, an event and the rest are all DIALOGS owned by
 * the page that lists them. The New menu has to be able to raise any of them
 * from anywhere, so the menu simply navigates to that page with `?new=1` and the
 * owning component picks it up here.
 *
 * ⚠️ Call this in the component that OWNS the dialog, and nowhere else. The
 * precedent is the `?doc=ID` deep link (see the note in documents-workspace.tsx):
 * it used to live in the child, which fired an event before the parent's
 * listener existed, and the link silently did nothing. A param read by the owner
 * cannot drift like that.
 *
 * Two things it gets right that a bare useEffect does not:
 *  - It fires ONCE per appearance of the param. React invokes effects twice in
 *    development, and a `cancelled` flag makes the first pass undo itself; a
 *    ref does not.
 *  - It strips ONLY its own param. Several of these lists are now filtered
 *    through the URL, so clearing the whole query string would wipe the filters
 *    the caller asked for.
 *
 * @param token what `?new=` must equal — `"1"` for a page with one create, or a
 *   name when a page owns several ("assets" vs "vendors" share /hrms/assets).
 * @param open  called when it matches. Opens the dialog.
 */
const CREATE_EVENT = "oracle:create";

/** Open a create form: on the same page by event, otherwise by navigating to
 *  `href` (whose `?new=` the owning page reads on arrival). */
export function requestCreate(href: string, currentPath: string, go: (href: string) => void) {
  const u = new URL(href, "http://x");
  const token = u.searchParams.get("new");
  if (token && u.pathname === currentPath) { window.dispatchEvent(new CustomEvent(CREATE_EVENT, { detail: token })); return; }
  go(href);
}

export function useCreateParam(token: string, open: () => void) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const done = useRef(false);
  // The dialog opener is usually an inline arrow, so a new identity every
  // render. Keep it in a ref or the effect would want it as a dependency and
  // re-run forever.
  const openRef = useRef(open);
  openRef.current = open;

  // ⚠️ NOT mount-only (fixed 26 Sept 2026). The "+" card links to the page
  // you are ALREADY on nine times out of ten ("Continue to the form" on the
  // calendar), which is a soft navigation — nothing remounts, so a mount-only
  // effect never saw the param and the form silently did not open. It now
  // watches the param: fires once when it appears, re-arms when it is gone.
  const want = searchParams.get("new") === token;
  // Already on the page? The "+" card does not navigate at all (a changed
  // query remounts the page and throws the just-opened form away) — it
  // raises this event instead, and the page's owner opens its form.
  useEffect(() => {
    const on = (e: Event) => { if ((e as CustomEvent<string>).detail === token) openRef.current(); };
    window.addEventListener(CREATE_EVENT, on);
    return () => window.removeEventListener(CREATE_EVENT, on);
  }, [token]);
  useEffect(() => {
    if (!want) { done.current = false; return; }
    if (done.current) return;
    done.current = true;
    openRef.current();
    const keep = new URLSearchParams(searchParams.toString());
    keep.delete("new");
    const qs = keep.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [want]);
}

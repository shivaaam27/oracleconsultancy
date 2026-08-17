"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * "Open your create dialog" as a URL — the plumbing behind the global New menu.
 *
 * Almost nothing in COS is created at a route. `/task/new` is a real page, but a
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
 *  - It runs ONCE. React invokes effects twice in development (mount → cleanup →
 *    mount), and a `cancelled` flag makes the first pass undo itself; a ref does
 *    not.
 *  - It strips ONLY its own param. Several of these lists are now filtered
 *    through the URL, so clearing the whole query string would wipe the filters
 *    the caller asked for.
 *
 * @param token what `?new=` must equal — `"1"` for a page with one create, or a
 *   name when a page owns several ("assets" vs "vendors" share /hrms/assets).
 * @param open  called when it matches. Opens the dialog.
 */
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

  useEffect(() => {
    if (done.current) return;
    if (searchParams.get("new") !== token) return;
    done.current = true;
    openRef.current();
    const keep = new URLSearchParams(searchParams.toString());
    keep.delete("new");
    const qs = keep.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    // Mount-only: the param is one-shot and stripped immediately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

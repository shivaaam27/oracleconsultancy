"use client";

/**
 * The hairline along the top of the window while the next page is on its way
 * (26 Sept 2026). A page takes a second or two to answer and nothing on screen
 * said a click had registered — so people clicked again. It starts on a click
 * of an internal link (after 120ms, so an instant page never flashes it) and
 * stops when the address changes, or after 12s whatever happens.
 *
 * A programmatic `router.push` gives no start event, so a caller that wants
 * the line dispatches `startNavProgress()` (the footer switcher and Go-to do).
 */
import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const NAV_START = "cos:nav-start";
/** Show the line for a navigation started in code (router.push). */
export function startNavProgress() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(NAV_START));
}

export function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [on, setOn] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cap = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    if (cap.current) clearTimeout(cap.current);
    timer.current = cap.current = null;
    setOn(false);
  };

  // The address changed → the page has arrived.
  useEffect(stop, [pathname, search]);

  useEffect(() => {
    const begin = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setOn(true), 120);
      if (cap.current) clearTimeout(cap.current);
      cap.current = setTimeout(stop, 12_000);
    };
    window.addEventListener(NAV_START, begin);
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const t = e.target as Element | null;
      const a = t?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      // A button inside a link (a row's ⋯ or pin) stops the navigation itself.
      const ctl = t?.closest?.("button, [role=button], input, textarea, label");
      if (ctl && a.contains(ctl)) return;
      let url: URL;
      try { url = new URL(a.href, location.href); } catch { return; }
      if (url.origin !== location.origin) return;
      if (/^\/(api|e|r)\//.test(url.pathname) || /\.(pdf|ics|csv|zip)$/i.test(url.pathname)) return;
      // Same page, same query (a hash jump, or the link to where you are).
      if (url.pathname === location.pathname && url.search === location.search) return;
      begin();
    };
    // CAPTURE: Next's <Link> calls preventDefault in its own handler, so by the
    // time a bubbling listener runs every link click looks cancelled.
    document.addEventListener("click", onClick, true);
    return () => { document.removeEventListener("click", onClick, true); window.removeEventListener(NAV_START, begin); };
  }, []);

  if (!on) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[200] h-[2px] overflow-hidden">
      <div className="nav-progress-bar h-full w-1/3 rounded-full bg-[#2490EF]" />
    </div>
  );
}

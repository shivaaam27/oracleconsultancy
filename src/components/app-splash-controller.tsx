"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/* Drives the Aurora Dock splash.
 *
 * Two landings:
 *  • a /login page → the mark glides (FLIPs) onto the sign-in card's own logo
 *    while the field fades, slowly revealing the login box (no pill).
 *  • anywhere else → the mark descends and dissolves into the bottom while the
 *    REAL nav/portal pill "constructs" in place: it blurs-up and its icons
 *    stagger in (driven by `:root[data-splash]`), so the pill is fully built the
 *    moment the field finishes fading. One continuous, fluid handoff.
 *
 * It plays on the first mount AND again when the route goes from a /login page
 * to an app page — i.e. straight after signing in. Sign-in is a *soft* (client)
 * navigation, so the root layout (and this component) never remounts; without
 * the pathname watcher the post-sign-in splash would only appear on a manual
 * refresh. We never play on ordinary in-app navigations.
 *
 * The splash node is NEVER removed from the DOM (React owns it) — only hidden —
 * so we never corrupt the reconciler.
 */
export function SplashController() {
  const pathname = usePathname();
  const prevPath = useRef<string | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    const path = pathname || window.location.pathname;
    const prev = prevPath.current;
    prevPath.current = path;

    const isLoginPath = (p: string) => /\/login\/?$/.test(p);

    // First mount → always play (for the page we landed on).
    // Later → only replay on the login → app transition (the sign-in moment).
    const firstMount = prev === null;
    const justSignedIn = prev !== null && isLoginPath(prev) && !isLoginPath(path);
    if (!firstMount && !justSignedIn) return;
    if (busy.current) return;

    const el = document.getElementById("aurora-splash");
    if (!el) return;

    const html = document.documentElement;
    const prefersReduced =
      html.getAttribute("data-motion") === "reduced" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const isLogin = isLoginPath(path);
    busy.current = true;

    // Reset any prior run so a replay starts clean.
    el.classList.remove("aurora-splash--play", "aurora-splash--login", "aurora-splash--leaving", "aurora-splash--done");
    const mark = el.querySelector<HTMLElement>(".aurora-splash__mark");
    if (mark) { mark.style.transition = ""; mark.style.transform = ""; }
    const name = el.querySelector<HTMLElement>(".aurora-splash__name");
    if (name) name.style.animation = "";
    void el.offsetWidth; // force reflow so re-added animation classes restart

    if (isLogin) {
      el.classList.add("aurora-splash--login");
    } else if (!prefersReduced) {
      el.classList.add("aurora-splash--play");
      html.setAttribute("data-splash", "app"); // hide the real pill until handoff
    }

    const minTime = prefersReduced ? 550 : 1650;
    const start = performance.now();
    let done = false;

    const cleanup = () => {
      el.classList.add("aurora-splash--done");
      html.removeAttribute("data-splash");
      busy.current = false;
    };

    const hide = () => {
      if (done) return;
      done = true;

      if (isLogin && !prefersReduced) {
        // Login: FLIP the mark onto the sign-in card's own logo so it "expands
        // to match" it, then cross-fade — the login box is revealed in place.
        const target = document.querySelector<HTMLElement>("[data-auth-logo]");
        if (target && mark) {
          const t = target.getBoundingClientRect();
          const m = mark.getBoundingClientRect();
          const dx = t.left + t.width / 2 - (m.left + m.width / 2);
          const dy = t.top + t.height / 2 - (m.top + m.height / 2);
          const scale = t.width / m.width || 1;
          mark.style.transition = "transform 0.7s cubic-bezier(0.4, 0, 0.2, 1)";
          mark.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
        }
      } else if (!prefersReduced) {
        // App: start CONSTRUCTING the real pill (blur-up + staggered icons) a
        // beat before the field fades, so it is fully built as the field closes.
        html.setAttribute("data-splash", "reveal");
      }

      el.classList.add("aurora-splash--leaving");
      el.addEventListener("animationend", cleanup, { once: true });
      window.setTimeout(cleanup, 850); // fallback (reduced motion suppresses the fade)
    };

    const finish = () => {
      const wait = Math.max(0, minTime - (performance.now() - start));
      window.setTimeout(hide, wait);
    };

    // Wait for fonts so the wordmark doesn't reflow as we hand off to the app.
    const fontsReady = (document as Document & { fonts?: FontFaceSet }).fonts?.ready;
    if (fontsReady) fontsReady.then(finish).catch(finish);
    else finish();

    // Hard safety net — never trap the user behind the splash.
    const guard = window.setTimeout(hide, 4000);
    return () => window.clearTimeout(guard);
  }, [pathname]);

  return null;
}

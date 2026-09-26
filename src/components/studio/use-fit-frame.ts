"use client";

/**
 * Size an element to exactly the room left in the Studio frame, so a page
 * made of columns needs NO page scroll — each column scrolls inside itself
 * (owner, 24 Sept 2026: "fit the screen and require no scrolling").
 *
 * The room is the window, minus where the element starts, minus the footer
 * and the frame's edge when the Studio footer is on. It also cancels `main`'s
 * bottom padding with a negative margin, or the page would still scroll by
 * that padding. Only from `lg` (1024px) — below that the columns stack and
 * the page scrolls normally, as a phone expects.
 *
 * Not `useFillViewport`: that one reclaims main's padding for the old floating
 * pill, which would size these columns underneath the Studio footer.
 */
import { useLayoutEffect, type RefObject } from "react";

const GAP = 16;

/** A floating search bar (56px) and the page's 20px gap above it. */
const BAR_ROOM = 76;

export function useFitFrame(ref: RefObject<HTMLElement | null>, { enabled = true, minimum = 420, bar = false, deps = [] as unknown[] } = {}) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const clear = () => { el.style.height = ""; el.style.marginBottom = ""; };
    if (!enabled) { clear(); return; }

    const fit = () => {
      clear();
      if (!window.matchMedia("(min-width: 1024px)").matches) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      const foot = document.querySelector<HTMLElement>("[data-studio-foot]");
      const footRoom = foot ? foot.offsetHeight + 12 : 0;
      // `bar`: a floating search bar follows (stFloatBar) — leave its room;
      // its own negative margin already cancels main's padding.
      const h = Math.max(minimum, window.innerHeight - top - footRoom - (bar ? BAR_ROOM : GAP));
      el.style.height = `${h}px`;
      if (bar) return;
      const main = el.closest("main");
      const pad = main ? parseFloat(getComputedStyle(main).paddingBottom) || 0 : 0;
      const pull = footRoom + GAP - pad;
      if (pull < 0) el.style.marginBottom = `${pull}px`;
    };

    fit();
    window.addEventListener("resize", fit);
    // Whatever sits above can change height (a title that wraps, a banner).
    const ro = new ResizeObserver(fit);
    if (el.previousElementSibling) ro.observe(el.previousElementSibling);
    return () => { window.removeEventListener("resize", fit); ro.disconnect(); clear(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, enabled, minimum, ...deps]);
}

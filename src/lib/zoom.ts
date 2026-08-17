/**
 * Zoom-safe geometry — measuring in the space that CSS lengths live in.
 *
 * The staff portal renders the whole document at `zoom: 0.8` on the web
 * (`portal-zoom.tsx` sets the marker on <html>, `globals.css` sets the scale).
 * That has one sharp edge, and it quietly broke every dropdown in the portal
 * until 17 Aug 2026:
 *
 *   `getBoundingClientRect()` and `window.innerWidth/innerHeight` report **visual**
 *   pixels — already multiplied by the zoom — while a `top`/`left` written into a
 *   style is a **layout** pixel, which the browser multiplies by the zoom AGAIN.
 *
 * So a rect fed straight back into a style lands at 0.8x of where it was meant to,
 * drifting further the further it sits from the top-left corner. Measured on
 * `/portal/task/PE-004`: the Priority menu was told `top: 123.5px` and rendered at
 * 99 (over its own trigger); "Add someone" was told 435 and rendered at 348 — 81px
 * ABOVE the control it belongs to. The admin side never showed it because there the
 * zoom is 1, which is why it survived so long.
 *
 * **Rule: if a measurement is going back into a style, take it from `layoutRect()`,
 * never from `getBoundingClientRect()` directly.** Everything here is the identity
 * function when the zoom is 1, so it is always safe to use.
 *
 * ⚠️ Do NOT reach for `element.currentCSSZoom` or `getComputedStyle(el).zoom` to
 * discover this — verified in Chrome, **both report 1** for an element sitting under
 * a zoomed root; only the root itself reports 0.8. The root is also the only place
 * this app sets zoom. If a nested zoom is ever introduced, multiply it in HERE
 * rather than at the call site.
 */

/** The zoom the document renders at — 0.8 on portal pages, 1 everywhere else. */
export function rootZoom(): number {
  if (typeof window === "undefined") return 1;
  const z = parseFloat(getComputedStyle(document.documentElement).zoom || "1");
  return Number.isFinite(z) && z > 0 ? z : 1;
}

export type LayoutRect = {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
  /** Viewport-bottom to the element's TOP — what an upward-opening menu sets as
   *  its `bottom`. Provided so no caller has to touch `window.innerHeight` and
   *  re-introduce the mismatch. */
  bottomOffset: number;
  viewportWidth: number;
  viewportHeight: number;
  zoom: number;
};

/** An element's box AND the viewport, both in layout pixels. */
export function layoutRect(el: HTMLElement): LayoutRect {
  const r = el.getBoundingClientRect();
  const z = rootZoom();
  const viewportWidth = window.innerWidth / z;
  const viewportHeight = window.innerHeight / z;
  const top = r.top / z;
  return {
    top,
    bottom: r.bottom / z,
    left: r.left / z,
    right: r.right / z,
    width: r.width / z,
    height: r.height / z,
    bottomOffset: viewportHeight - top,
    viewportWidth,
    viewportHeight,
    zoom: z,
  };
}

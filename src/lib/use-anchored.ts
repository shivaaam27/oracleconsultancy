import { useLayoutEffect, useState, type RefObject } from "react";
import { layoutRect } from "@/lib/zoom";

export type AnchorBox = {
  top: number;
  left: number;
  width: number;
  openUp: boolean;
  maxHeight: number;
  /** Set this as the menu's `bottom` when `openUp` — already correct for the
   *  portal's zoom. Never compute it from `window.innerHeight` at the call site. */
  bottomOffset: number;
  viewportWidth: number;
  viewportHeight: number;
};

/**
 * Track the rect of a trigger element so a dropdown can be rendered in a portal
 * (fixed-positioned, `document.body`) and therefore escape any `overflow-hidden`
 * ancestor that would otherwise clip it. Recomputes on open, scroll (capture) and
 * resize. Picks "open upward" when there's more room above.
 *
 * Every number here is in LAYOUT pixels (see `lib/zoom.ts`), so it can be written
 * straight into a style on a portal page, where the document is scaled to 0.8. The
 * viewport dimensions come back with it for the same reason — reach for
 * `window.innerHeight` in a consumer and the menu will drift again.
 */
export function useAnchored(ref: RefObject<HTMLElement | null>, open: boolean, desired = 280): AnchorBox | null {
  const [box, setBox] = useState<AnchorBox | null>(null);

  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const update = () => {
      const el = ref.current;
      if (!el) return;
      const m = layoutRect(el);
      const below = m.viewportHeight - m.bottom;
      const above = m.top;
      const openUp = below < Math.min(desired, 240) && above > below;
      const maxHeight = Math.max(160, Math.min(desired, (openUp ? above : below) - 12));
      setBox({
        top: openUp ? m.top : m.bottom,
        left: m.left,
        width: m.width,
        openUp,
        maxHeight,
        bottomOffset: m.bottomOffset,
        viewportWidth: m.viewportWidth,
        viewportHeight: m.viewportHeight,
      });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, ref, desired]);

  return box;
}

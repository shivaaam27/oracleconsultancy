import { useLayoutEffect, useState, type RefObject } from "react";

export type AnchorBox = { top: number; left: number; width: number; openUp: boolean; maxHeight: number };

/**
 * Track the viewport rect of a trigger element so a dropdown can be rendered in a
 * portal (fixed-positioned, `document.body`) and therefore escape any
 * `overflow-hidden` ancestor that would otherwise clip it. Recomputes on open,
 * scroll (capture) and resize. Picks "open upward" when there's more room above.
 */
export function useAnchored(ref: RefObject<HTMLElement | null>, open: boolean, desired = 280): AnchorBox | null {
  const [box, setBox] = useState<AnchorBox | null>(null);

  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const update = () => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const below = window.innerHeight - r.bottom;
      const above = r.top;
      const openUp = below < Math.min(desired, 240) && above > below;
      const maxHeight = Math.max(160, Math.min(desired, (openUp ? above : below) - 12));
      setBox({ top: openUp ? r.top : r.bottom, left: r.left, width: r.width, openUp, maxHeight });
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

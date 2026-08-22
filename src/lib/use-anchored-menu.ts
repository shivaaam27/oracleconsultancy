"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { layoutRect } from "@/lib/zoom";

/**
 * A pop-up menu anchored to a field, that cannot be clipped and cannot be
 * covered.
 *
 * ⚠️ THIS EXISTS BECAUSE THE SAME BUG APPEARED IN SIX PLACES. A menu written as
 * an `absolute` child of its field is clipped by ANY ancestor that scrolls or
 * hides its overflow — a bottom sheet, a drawer, a panel, a card. Measured on
 * the "Start a batch" sheet: the option list ran past the bottom of the card
 * and was cut off mid-row, so half the choices were unreachable. A dropdown
 * inside a dialog is the normal case in COS, not the exception.
 *
 * ⚠️ AND FIXING THE CLIPPING BY PORTALLING LEAVES A SECOND BUG IN ITS PLACE:
 * the menu then opens BEHIND the sheet. A portalled menu is a sibling of every
 * overlay in the app, so it needs a z-index above all of them — `MENU_Z` below,
 * which is the number `FluidSelect` already uses. A Tailwind `z-[60]` class was
 * the first attempt and lost to the bottom sheet at `z-[91]`.
 *
 * Use it like this:
 *
 * ```tsx
 * const { anchorRef, menuRef, pos, mounted } = useAnchoredMenu(open);
 * …
 * <div ref={anchorRef}>…the field…</div>
 * {mounted && open && pos && createPortal(
 *   <ul ref={menuRef} style={menuStyle(pos)} className="…">…</ul>,
 *   document.body,
 * )}
 * ```
 *
 * ⚠️ THE OUTSIDE-CLICK TEST MUST INCLUDE THE MENU. It is no longer a child of
 * the field, so a naive "did the click land inside my wrapper" check treats
 * choosing an option as clicking away and closes the list before the choice can
 * land. `isInside()` is here for that.
 */

/** Above every overlay in COS. The highest class-based z-index anywhere is 140;
 *  the bottom sheet is 91. `FluidSelect` has used this number since it was
 *  written, and matching it is deliberate — the dropdowns must behave alike. */
export const MENU_Z = 1000;

export type MenuPos = {
  left: number;
  minWidth: number;
  maxHeight: number;
  /** One of these is set, never both — see the flip below. */
  top?: number;
  bottom?: number;
};

export type AnchoredMenu<A extends HTMLElement, M extends HTMLElement> = {
  anchorRef: React.RefObject<A | null>;
  menuRef: React.RefObject<M | null>;
  pos: MenuPos | null;
  /** False on the server and on the first paint — `createPortal` needs a DOM. */
  mounted: boolean;
  /** Re-measure by hand, e.g. after the list of options changes length. */
  place: () => void;
  /** Did this event land on the field or in the menu? */
  isInside: (target: Node | null) => boolean;
};

export function useAnchoredMenu<A extends HTMLElement = HTMLDivElement, M extends HTMLElement = HTMLUListElement>(
  open: boolean,
  opts?: {
    /** Minimum room below before it flips up. Default 200px. */
    flipBelow?: number;
    /** Distance from the field. Default 6px. */
    gap?: number;
  },
): AnchoredMenu<A, M> {
  const anchorRef = useRef<A | null>(null);
  const menuRef = useRef<M | null>(null);
  const [pos, setPos] = useState<MenuPos | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const place = () => {
    const el = anchorRef.current;
    if (!el) return;
    /* ⚠️ `layoutRect`, NOT `getBoundingClientRect` — see `lib/zoom.ts`. Under a
       browser zoom the two disagree and the menu opens over its own field. */
    const r = layoutRect(el);
    const margin = 8;
    const gap = opts?.gap ?? 6;
    const menuW = Math.max(r.width, 200);
    const left = Math.max(margin, Math.min(r.left, r.viewportWidth - menuW - margin));

    /* ⚠️ IT FLIPS UP WHEN THERE IS NO ROOM BELOW, and its height is clamped to
       whatever room there is either way — so it scrolls inside itself rather
       than running off the screen. A field near the bottom of a sheet is the
       common case, not a corner one. */
    const spaceBelow = r.viewportHeight - r.bottom - margin;
    const spaceAbove = r.top - margin;
    const openUp = spaceBelow < (opts?.flipBelow ?? 200) && spaceAbove > spaceBelow;
    const maxHeight = Math.max(120, Math.min(r.viewportHeight * 0.6, openUp ? spaceAbove : spaceBelow));

    setPos(
      openUp
        ? { bottom: r.bottomOffset + gap, left, minWidth: r.width, maxHeight }
        : { top: r.bottom + gap, left, minWidth: r.width, maxHeight },
    );
  };

  useLayoutEffect(() => {
    if (open) place();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /* ⚠️ A `fixed` menu does not travel with a scrolling ancestor, so it is
     re-placed on scroll — with `capture`, to catch inner scrollers, which is
     exactly what a sheet's body is. */
  useEffect(() => {
    if (!open) return;
    const reposition = () => place();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const isInside = (target: Node | null) =>
    !!target && (!!anchorRef.current?.contains(target) || !!menuRef.current?.contains(target));

  return { anchorRef, menuRef, pos, mounted, place, isInside };
}

/** The inline style a portalled menu needs. Kept here so no caller has to
 *  remember `position: fixed` or the z-index. */
export function menuStyle(pos: MenuPos, maxWidth = "min(92vw, 32rem)"): React.CSSProperties {
  return {
    position: "fixed",
    zIndex: MENU_Z,
    top: pos.top,
    bottom: pos.bottom,
    left: pos.left,
    minWidth: pos.minWidth,
    maxWidth,
    maxHeight: pos.maxHeight,
  };
}

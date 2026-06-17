"use client";

import { useRef, useState } from "react";

/* ------------------------------------------------------------------ *
 * useSwipeRow — one robust swipe gesture for the portal action rows
 * (board "Needs you", task cards, the tasks-command list).
 *
 * Fixes the old per-component handlers, which only watched horizontal
 * movement: a vertical scroll with any sideways drift snapped a card
 * open, and the card jumped to a fixed offset instead of tracking the
 * finger. Here we:
 *   • lock the axis once per gesture — if the first real movement is
 *     vertical, we never engage (the page just scrolls);
 *   • follow the finger 1:1 while swiping, clamped to the tray widths,
 *     with the transition switched off so there's no rubber-banding;
 *   • settle on release: past ~40% of a tray → open, else snap back.
 *
 * Pair with `touch-action: pan-y` (Tailwind `touch-pan-y`) on the moving
 * element so the browser owns vertical scrolling and never fights us for
 * a horizontal swipe.
 * ------------------------------------------------------------------ */

export type Swiped = "left" | "right" | null;

const DEADZONE = 10; // px of travel before we commit to an axis
const COMMIT = 0.4; // fraction of a tray's width needed to settle it open

export function useSwipeRow({ leftWidth = 0, rightWidth = 0 }: { leftWidth?: number; rightWidth?: number }) {
  // `swiped` is the settled state; `offset` is the live px translate (negative = left).
  const [swiped, setSwipedState] = useState<Swiped>(null);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);

  const start = useRef({ x: 0, y: 0 });
  const axis = useRef<null | "x" | "y">(null);
  const base = useRef(0);
  const live = useRef(0);

  function positionFor(s: Swiped): number {
    return s === "left" ? -rightWidth : s === "right" ? leftWidth : 0;
  }
  function settle(to: Swiped) {
    setSwipedState(to);
    const pos = positionFor(to);
    live.current = pos;
    setOffset(pos);
    setDragging(false);
  }

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    start.current = { x: t.clientX, y: t.clientY };
    base.current = positionFor(swiped);
    axis.current = null;
  }
  function onTouchMove(e: React.TouchEvent) {
    const t = e.touches[0];
    const dx = t.clientX - start.current.x;
    const dy = t.clientY - start.current.y;
    if (axis.current === null) {
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > DEADZONE) {
        axis.current = "x";
        setDragging(true);
      } else if (Math.abs(dy) > DEADZONE) {
        axis.current = "y"; // a scroll — never engage the swipe
        return;
      } else {
        return; // still inside the deadzone
      }
    }
    if (axis.current !== "x") return;
    const min = rightWidth ? -rightWidth : 0;
    const max = leftWidth ? leftWidth : 0;
    const next = Math.max(min, Math.min(max, base.current + dx));
    live.current = next;
    setOffset(next);
  }
  function onTouchEnd() {
    if (axis.current === "x") {
      const o = live.current;
      if (rightWidth && o <= -rightWidth * COMMIT) settle("left");
      else if (leftWidth && o >= leftWidth * COMMIT) settle("right");
      else settle(null);
    }
    axis.current = null;
  }

  return {
    swiped,
    offset,
    dragging,
    setSwiped: settle,
    reset: () => settle(null),
    bind: { onTouchStart, onTouchMove, onTouchEnd },
  };
}

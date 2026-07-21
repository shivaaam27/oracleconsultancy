"use client";

// Activity gate for background polling.
//
// Every "live" surface (portal pages, task detail, the bell, chat) refreshes on a
// timer. A tab left OPEN AND VISIBLE but unattended — the normal state of a portal
// on someone's second screen all day — kept re-running the whole server render,
// which is what burns Vercel's Fluid Active CPU allowance. Pollers gate on this so
// an unattended tab stands down, then catches up the moment the person returns
// (every caller force-refreshes on focus/visibility).

import { useCallback, useEffect, useRef } from "react";

const EVENTS = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

/** Returns a getter: true when there has been no interaction for `ms`.
 *  Deliberately ref-based — reading it never re-renders the host component. */
export function useIdleGate(ms = 180_000) {
  const last = useRef(Date.now());
  useEffect(() => {
    const mark = () => { last.current = Date.now(); };
    for (const e of EVENTS) window.addEventListener(e, mark, { passive: true });
    window.addEventListener("focus", mark);
    document.addEventListener("visibilitychange", mark);
    return () => {
      for (const e of EVENTS) window.removeEventListener(e, mark);
      window.removeEventListener("focus", mark);
      document.removeEventListener("visibilitychange", mark);
    };
  }, []);
  return useCallback(() => Date.now() - last.current > ms, [ms]);
}

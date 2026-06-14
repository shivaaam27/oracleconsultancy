"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";

/** Quietly re-fetches server data on an interval (and when the tab is
 *  re-focused) so portal pages feel live without true push infra. A pending
 *  guard stops slow refreshes from stacking up on a flaky connection. */
export function AutoRefresh({ seconds = 20 }: { seconds?: number }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const busy = useRef(false);
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible" || busy.current) return;
      busy.current = true;
      startTransition(() => {
        router.refresh();
        // refresh() resolves on the next paint; release shortly after so we
        // never queue a second refresh on top of an in-flight one.
        setTimeout(() => { busy.current = false; }, 1500);
      });
    };
    const id = setInterval(tick, seconds * 1000);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", tick);
    };
  }, [router, seconds]);
  return null;
}

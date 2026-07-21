"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useIdleGate } from "@/lib/use-idle";

/** Quietly re-fetches server data on an interval (and when the tab is
 *  re-focused) so portal pages feel live without true push infra. A pending
 *  guard stops slow refreshes from stacking up on a flaky connection. */
export function AutoRefresh({ seconds = 20 }: { seconds?: number }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const busy = useRef(false);
  const isIdle = useIdleGate();
  useEffect(() => {
    // `force` bypasses the idle gate: coming back to the tab must give fresh
    // data immediately, even though the person has "been idle" until now.
    const tick = (force = false) => {
      if (document.visibilityState !== "visible" || busy.current) return;
      // An open but unattended tab stands down — each refresh re-runs the whole
      // server render, and nobody is reading it. See lib/use-idle.ts.
      if (!force && isIdle()) return;
      busy.current = true;
      startTransition(() => {
        router.refresh();
        // refresh() resolves on the next paint; release shortly after so we
        // never queue a second refresh on top of an in-flight one.
        setTimeout(() => { busy.current = false; }, 1500);
      });
    };
    const id = setInterval(() => tick(), seconds * 1000);
    const onReturn = () => tick(true);
    window.addEventListener("focus", onReturn);
    document.addEventListener("visibilitychange", onReturn);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onReturn);
      document.removeEventListener("visibilitychange", onReturn);
    };
  }, [router, seconds, isIdle]);
  return null;
}

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Quietly re-fetches server data on an interval (and when the tab is
 *  re-focused) so portal pages feel live without true push infra. */
export function AutoRefresh({ seconds = 20 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
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

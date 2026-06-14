"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/** Near-real-time sync for a task page. Probes the tiny /api/portal/sync
 *  endpoint every few seconds (visible tabs only) and re-renders the page
 *  the moment the task or its timeline changes. Far cheaper than reloading
 *  the whole page on a timer. */
export function LiveSync({ taskId, seconds = 5 }: { taskId: number; seconds?: number }) {
  const router = useRouter();
  const stampRef = useRef<string | null>(null);

  useEffect(() => {
    let stopped = false;
    const controller = new AbortController();

    const probe = async () => {
      if (stopped || document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`/api/portal/sync?taskId=${taskId}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok) return;
        const { stamp } = (await res.json()) as { stamp: string };
        if (stopped) return;
        if (stampRef.current !== null && stampRef.current !== stamp) router.refresh();
        stampRef.current = stamp;
      } catch {
        // Offline blip or aborted on unmount — try again next tick.
      }
    };

    probe();
    const id = setInterval(probe, seconds * 1000);
    const onFocus = () => probe();
    window.addEventListener("focus", onFocus);
    return () => {
      stopped = true;
      controller.abort();
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [taskId, seconds, router]);

  return null;
}

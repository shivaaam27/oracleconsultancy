"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useIdleGate } from "@/lib/use-idle";

/** Near-real-time sync for a task page. Probes the tiny /api/portal/sync
 *  endpoint every few seconds (visible AND attended tabs only) and re-renders
 *  the page the moment the task or its timeline changes. Far cheaper than
 *  reloading the whole page on a timer. */
export function LiveSync({ taskId, seconds = 12 }: { taskId: number; seconds?: number }) {
  const router = useRouter();
  const stampRef = useRef<string | null>(null);
  const isIdle = useIdleGate();

  useEffect(() => {
    let stopped = false;
    const controller = new AbortController();

    // `force` bypasses the idle gate so returning to the tab probes at once.
    const probe = async (force = false) => {
      if (stopped || document.visibilityState !== "visible") return;
      if (!force && isIdle()) return;
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

    probe(true);
    const id = setInterval(() => probe(), seconds * 1000);
    const onReturn = () => probe(true);
    window.addEventListener("focus", onReturn);
    document.addEventListener("visibilitychange", onReturn);
    return () => {
      stopped = true;
      controller.abort();
      clearInterval(id);
      window.removeEventListener("focus", onReturn);
      document.removeEventListener("visibilitychange", onReturn);
    };
  }, [taskId, seconds, router, isIdle]);

  return null;
}

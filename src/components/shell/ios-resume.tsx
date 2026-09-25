"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Recovers the installed PWA from iOS's background-suspend behaviour.
 *
 * iOS freezes the web view (and its animation clock) when the app is locked or
 * swiped away. On return you can get a blank/stuck screen — either because a
 * framer-motion route transition was paused mid-flight (left at opacity 0), or
 * because the page was restored from the back/forward cache in a stale state.
 *
 * Two safeguards:
 *  - `pageshow` with `persisted` → the page came back from bfcache; reload to
 *    get a clean shell (the reliable cure for the frozen-webview case).
 *  - On returning to the foreground after a long sleep, refresh server data so
 *    stale tasks/counts don't linger; for short blurs, just nudge a repaint so
 *    any paused CSS/transition animation resumes painting.
 */

// Refresh server data if the app was backgrounded longer than this.
const STALE_AFTER_MS = 5 * 60 * 1000;

export function IosResume() {
  const router = useRouter();

  useEffect(() => {
    let hiddenAt: number | null = null;

    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        // Restored from bfcache in a suspended state — start fresh.
        window.location.reload();
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      // Became visible again.
      const away = hiddenAt ? Date.now() - hiddenAt : 0;
      hiddenAt = null;

      if (away > STALE_AFTER_MS) {
        // Long sleep: pull fresh data (no full reload — keeps scroll position).
        router.refresh();
      }

      // Nudge the renderer so any animation paused by iOS resumes painting.
      // Toggling a no-op style forces a reflow + repaint on the next frame.
      requestAnimationFrame(() => {
        document.documentElement.style.transform = "translateZ(0)";
        requestAnimationFrame(() => {
          document.documentElement.style.transform = "";
        });
      });
    };

    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router]);

  return null;
}

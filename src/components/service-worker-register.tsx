"use client";

import { useEffect } from "react";

/**
 * Registers the service worker AND auto-recovers from the two blank-screen
 * traps that React error boundaries can't catch (they aren't render errors):
 *
 *  1. **Stale code after a deploy.** When a new build ships, a PWA that's been
 *     left open is still running the OLD JavaScript. The moment the user taps to
 *     another page, Next tries to lazy-load a route chunk by the old build's
 *     name — which no longer exists on the server — and the navigation dies with
 *     a blank screen ("ChunkLoadError"). The cure is the same thing the user
 *     does by hand: reload, so the client picks up the fresh HTML + chunks.
 *
 *  2. **A new service worker takes control mid-session.** We reload proactively
 *     on `controllerchange` (an UPDATE, not the first install) so the client
 *     refreshes onto the new assets *before* it hits a broken navigation.
 *
 * Both paths funnel through a one-shot guard so we can never get stuck in a
 * reload loop (if the very first thing the fresh page does is throw the same
 * error, we stop and let the error boundary show its message instead).
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof window === "undefined") return;

    // One reload at most per short window — a fresh load that immediately throws
    // the same chunk error must NOT reload again, or the app would loop forever.
    const RECOVER_KEY = "cos-recover-ts";
    const recoverOnce = () => {
      try {
        const last = Number(sessionStorage.getItem(RECOVER_KEY) || 0);
        if (Date.now() - last < 20000) return; // already recovered just now — give up
        sessionStorage.setItem(RECOVER_KEY, String(Date.now()));
      } catch {
        /* sessionStorage blocked (private mode) — fall through and reload anyway */
      }
      window.location.reload();
    };

    // --- Chunk-load recovery (reactive safety net) ------------------------
    const isChunkError = (err: unknown): boolean => {
      const e = err as { name?: string; message?: string } | null | undefined;
      const msg = (e && (e.message || String(e))) || "";
      return (
        e?.name === "ChunkLoadError" ||
        /Loading (?:CSS )?chunk [\w-]+ failed/i.test(msg) ||
        /failed to fetch dynamically imported module/i.test(msg) ||
        /error loading dynamically imported module/i.test(msg) ||
        /Importing a module script failed/i.test(msg)
      );
    };
    const onError = (e: ErrorEvent) => {
      if (isChunkError(e.error ?? e.message)) recoverOnce();
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      if (isChunkError(e.reason)) recoverOnce();
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);

    // --- Service worker registration + update recovery (proactive) --------
    let onControllerChange: (() => void) | null = null;
    if ("serviceWorker" in navigator) {
      // Whether a controller was already in charge when this page loaded. If not,
      // the first `controllerchange` is just the initial claim of a brand-new SW
      // (not an update) — reloading then would be a pointless flash.
      const hadController = !!navigator.serviceWorker.controller;
      onControllerChange = () => {
        if (hadController) recoverOnce();
      };
      navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

      const register = () => {
        navigator.serviceWorker.register("/sw.js").catch(() => {});
      };
      if (document.readyState === "complete") register();
      else window.addEventListener("load", register, { once: true });
    }

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      if (onControllerChange && "serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      }
    };
  }, []);

  return null;
}

"use client";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { NAV_ROUTES } from "@/lib/nav";

/** Records the active NAV_ROUTES match (if any) on every pathname change. */
export function RecentsTracker() {
  const pathname = usePathname();
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname) return;
    // Match longest matching href (excluding "/" which would always match)
    const match = NAV_ROUTES
      .filter((r) => r.href !== "/" && (pathname === r.href || pathname.startsWith(r.href + "/")))
      .sort((a, b) => b.href.length - a.href.length)[0]
      ?? (pathname === "/" ? NAV_ROUTES.find((r) => r.href === "/") : undefined);
    if (!match) return;
    if (lastSent.current === match.id) return;
    lastSent.current = match.id;

    const ctrl = new AbortController();
    fetch("/api/prefs/nav-recents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: match.id }),
      signal: ctrl.signal,
      keepalive: true,
    }).catch(() => {});
    return () => ctrl.abort();
  }, [pathname]);

  return null;
}

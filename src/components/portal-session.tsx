"use client";

import { useEffect } from "react";
import { LogOut } from "lucide-react";
import { portalLogout } from "@/app/portal/actions";

/* Durable portal session (PWA app-kill resilience). The httpOnly session cookie
 * can be evicted when an installed PWA is swiped from recents; localStorage is a
 * separate, stickier store, so we cache a signed remember token there and use it
 * to silently re-mint the cookie on the next launch. See lib/portal-auth.ts. */

const KEY = "cos_portal_remember";

/** Mounted INSIDE the authed portal — refresh the cached durable token each visit. */
export function PortalSessionKeeper() {
  useEffect(() => {
    let cancelled = false;
    fetch("/api/portal/remember-token", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.token) { try { localStorage.setItem(KEY, d.token); } catch { /* private mode */ } }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  return null;
}

/** Mounted on the portal LOGIN page — if a remember token is cached, silently
 *  re-mint the session and bounce back into the portal (no password needed). */
export function PortalSessionRestore() {
  useEffect(() => {
    let token: string | null = null;
    try { token = localStorage.getItem(KEY); } catch { /* private mode */ }
    if (!token) return;
    // A durable token survived → silently re-mint the session and bounce back in
    // (covers genuine cookie eviction). The main app-kill bug was a routing one,
    // fixed in src/proxy.ts; this stays as a belt-and-braces safety net.
    fetch("/api/portal/reauth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then((r) => {
        if (r.ok) window.location.replace("/portal");
        else if (r.status === 401) { try { localStorage.removeItem(KEY); } catch { /* */ } } // stale/revoked
      })
      .catch(() => {});
  }, []);
  return null;
}

/** Sign out — clears the durable token FIRST (so PortalSessionRestore won't log
 *  the person straight back in) then runs the server logout. */
export function PortalSignOut() {
  return (
    <form action={portalLogout} className="shrink-0">
      <button
        type="submit"
        onClick={() => { try { localStorage.removeItem(KEY); } catch { /* */ } }}
        className="inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md bg-bg-elev px-2.5 text-xs font-medium text-fg-muted ring-1 ring-border transition-colors hover:text-fg"
      >
        <LogOut size={13} />
        Sign out
      </button>
    </form>
  );
}

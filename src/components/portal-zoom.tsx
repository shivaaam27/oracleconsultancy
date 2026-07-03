"use client";

import { useEffect } from "react";

/**
 * Portal web zoom. Adds `data-portal-zoom` to <html> while any portal page is
 * mounted, and removes it on unmount (so the admin/command-centre side is never
 * scaled). The actual 0.8 scale + desktop-only gate live in globals.css
 * (`html[data-portal-zoom]`). Marking the whole document — not just the portal
 * container — means body-level pop-ups (search overlay, bottom sheets, the
 * announcement takeover) scale WITH the page instead of floating at 100%.
 */
export function PortalZoom() {
  useEffect(() => {
    const el = document.documentElement;
    el.setAttribute("data-portal-zoom", "");
    return () => el.removeAttribute("data-portal-zoom");
  }, []);
  return null;
}

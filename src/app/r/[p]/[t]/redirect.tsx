"use client";

import { useEffect } from "react";

/** Send a real visitor on to the portal; crawlers stop at the server-rendered
 *  Open-Graph head and never run this. */
export function PortalRedirect({ to }: { to: string }) {
  useEffect(() => {
    window.location.replace(to);
  }, [to]);
  return null;
}

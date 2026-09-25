"use client";
import { useEffect } from "react";

/** Fires one engagement ping per load (server dedups to 1/hour). Invisible. */
export function ActivityPinger() {
  useEffect(() => {
    const t = setTimeout(() => {
      fetch("/api/activity/ping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: typeof location !== "undefined" ? location.pathname : null }),
        keepalive: true,
      }).catch(() => {});
    }, 1200);
    return () => clearTimeout(t);
  }, []);
  return null;
}

"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/* The Administrator's heartbeat. Keeps the wall current and shows a live
 * "synced …" stamp so it always feels awake.
 *
 * Liveness, most-instant first:
 *  1) Supabase Realtime broadcast on `cos-pulse` (server pulses on changes) —
 *     instant refresh. Broadcast only: it is pub/sub over the socket and touches
 *     no table, so it survives the Row Level Security lock in migration 0139. A
 *     postgres_changes listener on task_updates used to sit here too; it was
 *     already inert (the `supabase_realtime` publication is empty) and RLS would
 *     have silenced it for good, so it has gone.
 *  2) Fallback that always runs: refresh on an interval + when the tab regains
 *     focus / visibility / connection. A busy-guard stops refreshes stacking.
 * Needs NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY for (1); without
 * them (2) still keeps it live. */
export function CockpitLive({ seconds = 45 }: { seconds?: number }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const busy = useRef(false);
  const [syncedAt, setSyncedAt] = useState(0);
  const [ago, setAgo] = useState<number | null>(null);

  const refresh = useCallback(() => {
    if (busy.current || (typeof document !== "undefined" && document.visibilityState !== "visible")) return;
    busy.current = true;
    startTransition(() => {
      router.refresh();
      setSyncedAt(Date.now());
      setAgo(0);
      setTimeout(() => {
        busy.current = false;
      }, 1500);
    });
  }, [router]);

  // Stamp the first sync on the client only (avoids a hydration mismatch).
  useEffect(() => {
    setSyncedAt(Date.now());
    setAgo(0);
  }, []);

  // Tick the "synced …" label once a second.
  useEffect(() => {
    if (!syncedAt) return;
    const id = setInterval(() => setAgo(Math.round((Date.now() - syncedAt) / 1000)), 1000);
    return () => clearInterval(id);
  }, [syncedAt]);

  // Always-on fallback: interval + focus/visibility/online.
  useEffect(() => {
    const id = setInterval(refresh, seconds * 1000);
    const onFocus = () => refresh();
    const onVis = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onFocus);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refresh, seconds]);

  // Instant push when realtime is configured.
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) return;
    let stopped = false;
    let cleanup: (() => void) | null = null;
    import("@supabase/supabase-js")
      .then(({ createClient }) => {
        if (stopped) return;
        const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
        const ch = client
          .channel("cos-pulse", { config: { broadcast: { self: false } } })
          .on("broadcast", { event: "pulse" }, () => refresh())
          .subscribe();
        cleanup = () => client.removeChannel(ch);
      })
      .catch(() => {});
    return () => {
      stopped = true;
      cleanup?.();
    };
  }, [refresh]);

  const label =
    ago == null ? "syncing…" : ago < 5 ? "just now" : ago < 60 ? `${ago}s ago` : `${Math.round(ago / 60)}m ago`;

  return (
    <div className="flex items-center justify-center gap-2 text-xs text-fg-subtle">
      <span className="relative inline-flex h-2 w-2" aria-hidden>
        <span className="absolute inline-flex h-full w-full rounded-full bg-success opacity-60 motion-safe:animate-ping" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
      </span>
      <span>Live · synced {label}</span>
    </div>
  );
}

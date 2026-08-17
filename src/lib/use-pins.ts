"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_PINS, ROUTE_BY_ID, resolveRouteId } from "./nav";

/** Server-backed pin store with optimistic updates + debounced PUT. */
export function usePins() {
  const [pins, setPinsState] = useState<string[]>(DEFAULT_PINS);
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef<AbortController | null>(null);

  // Initial load
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/prefs/nav-pins", { cache: "no-store" });
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (!cancelled && Array.isArray(data.pins)) {
          // Follow renames first (ocr → cleaning), THEN drop ids whose page is
          // genuinely gone. Without the first step a rename un-pins silently.
          setPinsState(
            data.pins.map((id: string) => resolveRouteId(id)).filter((id: string) => ROUTE_BY_ID[id])
          );
        }
      } catch {
        /* keep defaults */
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback((next: string[]) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (inFlight.current) inFlight.current.abort();
      const ctrl = new AbortController();
      inFlight.current = ctrl;
      fetch("/api/prefs/nav-pins", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pins: next }),
        signal: ctrl.signal,
      }).catch(() => {});
    }, 250);
  }, []);

  const setPins = useCallback(
    (next: string[]) => {
      const cleaned = next.filter((id) => ROUTE_BY_ID[id]);
      setPinsState(cleaned);
      persist(cleaned);
    },
    [persist]
  );

  const pin = useCallback(
    (id: string) => {
      if (!ROUTE_BY_ID[id]) return;
      setPinsState((cur) => {
        if (cur.includes(id)) return cur;
        const next = [...cur, id];
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const unpin = useCallback(
    (id: string) => {
      setPinsState((cur) => {
        if (!cur.includes(id)) return cur;
        const next = cur.filter((x) => x !== id);
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const move = useCallback(
    (id: string, dir: -1 | 1) => {
      setPinsState((cur) => {
        const i = cur.indexOf(id);
        if (i < 0) return cur;
        const j = i + dir;
        if (j < 0 || j >= cur.length) return cur;
        const next = cur.slice();
        [next[i], next[j]] = [next[j], next[i]];
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const toggle = useCallback(
    (id: string) => {
      setPinsState((cur) => {
        const has = cur.includes(id);
        const next = has ? cur.filter((x) => x !== id) : [...cur, id];
        persist(next);
        return next;
      });
    },
    [persist]
  );

  return { pins, setPins, pin, unpin, toggle, move, loaded };
}

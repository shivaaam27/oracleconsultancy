"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_ORDER,
  DEFAULT_HIDDEN,
  normaliseLayout,
  type WidgetId,
  type DashboardLayout,
} from "./dashboard";

/** Server-backed dashboard layout: order + hidden, optimistic with debounced PUT. */
export function useDashboardLayout() {
  const [order, setOrderState] = useState<WidgetId[]>(DEFAULT_ORDER);
  const [hidden, setHiddenState] = useState<WidgetId[]>(DEFAULT_HIDDEN);
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/prefs/dashboard", { cache: "no-store" });
        if (!res.ok) throw new Error();
        const data = normaliseLayout(await res.json());
        if (!cancelled) {
          setOrderState(data.order);
          setHiddenState(data.hidden);
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

  const persist = useCallback((next: DashboardLayout) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (inFlight.current) inFlight.current.abort();
      const ctrl = new AbortController();
      inFlight.current = ctrl;
      fetch("/api/prefs/dashboard", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
        signal: ctrl.signal,
      }).catch(() => {});
    }, 250);
  }, []);

  const setOrder = useCallback(
    (next: WidgetId[]) => {
      setOrderState(next);
      setHiddenState((h) => {
        persist({ order: next, hidden: h });
        return h;
      });
    },
    [persist]
  );

  const toggleHidden = useCallback(
    (id: WidgetId) => {
      setHiddenState((cur) => {
        const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
        setOrderState((o) => {
          persist({ order: o, hidden: next });
          return o;
        });
        return next;
      });
    },
    [persist]
  );

  const reset = useCallback(() => {
    setOrderState(DEFAULT_ORDER);
    setHiddenState(DEFAULT_HIDDEN);
    persist({ order: DEFAULT_ORDER, hidden: DEFAULT_HIDDEN });
  }, [persist]);

  return { order, hidden, loaded, setOrder, toggleHidden, reset };
}

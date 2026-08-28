"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * useUrlFilters — a list's filters, held in the URL instead of component state.
 *
 * This is the Stage 2 rule of the ERPNext redesign ("sorting and filtering are
 * URLs, never component state") made reusable, and it is what pays for saved
 * views: a saved view is just a query string, so a list filtered with `useState`
 * has nothing to save (see `src/lib/saved-views.ts`).
 *
 * Give it the filter defaults. It gives back the current values, a `set` that
 * patches them, and a `reset`. Anything equal to its default is LEFT OUT of the
 * URL, so a clean list has a clean address and a saved view records only what
 * actually differs.
 *
 * Text boxes: pass `debounceKeys` for free-text fields. Those keep a local value
 * so typing stays instant, and the URL catches up once you stop (default 300ms) —
 * without it every keystroke would be a navigation.
 *
 * The URL is written with `router.replace`, so filtering never fills the Back
 * button with one entry per click; Back still leaves the page.
 */
export function useUrlFilters<T extends Record<string, string>>(
  defaults: T,
  options: { debounceKeys?: Array<keyof T>; debounceMs?: number } = {}
): {
  /** Current filter values — URL first, defaults where absent. */
  values: T;
  /** Patch one or more filters. Values equal to their default drop out of the URL. */
  set: (patch: Partial<T>) => void;
  /** Clear every filter back to its default (other query params are kept). */
  reset: () => void;
  /** True when anything differs from the defaults. */
  dirty: boolean;
  /** The query string these filters would produce — for "save this view". */
  query: string;
  /** Build the href for a single filter change, so a rail entry can be a real link. */
  hrefFor: (patch: Partial<T>) => string;
} {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { debounceKeys, debounceMs = 300 } = options;

  // `defaults` is nearly always an inline object literal, so freeze the first one
  // we see — otherwise every render would look like a new set of defaults.
  const defaultsRef = useRef(defaults);
  const base = defaultsRef.current;

  const fromUrl = useMemo(() => {
    const out = { ...base };
    for (const k of Object.keys(base) as Array<keyof T>) {
      const v = searchParams.get(String(k));
      if (v !== null) out[k] = v as T[keyof T];
    }
    return out;
  }, [searchParams, base]);

  /* Free-text fields echo the keystroke locally and settle into the URL after a
   * pause. `pending` is null for a field that is in sync. */
  const [pending, setPending] = useState<Partial<T>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const values = useMemo(() => ({ ...fromUrl, ...pending }), [fromUrl, pending]);

  const buildQuery = useCallback(
    (next: T) => {
      const p = new URLSearchParams(searchParams.toString());
      for (const k of Object.keys(base) as Array<keyof T>) {
        const key = String(k);
        if (next[k] === base[k] || next[k] === "" || next[k] === undefined) p.delete(key);
        else p.set(key, String(next[k]));
      }
      return p.toString();
    },
    [searchParams, base]
  );

  const push = useCallback(
    (next: T) => {
      const qs = buildQuery(next);
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [buildQuery, pathname, router]
  );

  /**
   * ⚠️ CALL THIS ONCE PER EVENT, WITH EVERY KEY YOU ARE CHANGING.
   *
   * `next` is built from the CURRENT values, which come from the address bar —
   * and the address bar has not moved yet when a second call runs in the same
   * handler. So `set({status})` followed by `set({f})` recomputes from the old
   * values and silently drops the first change. It cost the portal's status
   * dropdown: it wrote the status and then wiped it in the same click, so
   * picking a status appeared to do nothing at all.
   */
  const set = useCallback(
    (patch: Partial<T>) => {
      const slow = (Object.keys(patch) as Array<keyof T>).filter((k) => debounceKeys?.includes(k));
      const next = { ...values, ...patch } as T;

      if (slow.length === 0) {
        // An immediate change also flushes anything a text box was still holding.
        if (timer.current) clearTimeout(timer.current);
        setPending({});
        push(next);
        return;
      }

      setPending((prev) => ({ ...prev, ...patch }));
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        setPending({});
        push(next);
      }, debounceMs);
    },
    [values, push, debounceKeys, debounceMs]
  );

  const reset = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setPending({});
    push({ ...base });
  }, [push, base]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const dirty = (Object.keys(base) as Array<keyof T>).some((k) => values[k] !== base[k]);

  return {
    values,
    set,
    reset,
    dirty,
    query: buildQuery(values),
    hrefFor: (patch) => {
      const qs = buildQuery({ ...values, ...patch } as T);
      return qs ? `${pathname}?${qs}` : pathname;
    },
  };
}

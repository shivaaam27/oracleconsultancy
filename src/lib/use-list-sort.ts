"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Column sorting, held in the URL — the client-side twin of what the tasks table
// does on the server.
//
// It exists because `ENTITY_VIEWS` marks columns `sortable: true`, `buildColumns`
// only draws the little sort arrow when the PAGE hands it an href, and a list
// that never hands one over advertises sorting it does not have. That is worse
// than no sorting: the header looks clickable and does nothing.
//
// Same rule as the filters (CLAUDE.md): sorting is a URL, never component state,
// so a saved view can record it.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export type Sorter<T> = {
  cmp: (a: T, b: T) => number;
  /** Rows with nothing to rank — pinned last whichever way the sort points. */
  isEmpty?: (row: T) => boolean;
};

export function useListSort<T>(sorters: Record<string, Sorter<T>>) {
  const sp = useSearchParams();
  const pathname = usePathname();

  const raw = sp.get("sort");
  const key = raw && sorters[raw] ? raw : null;
  const dir: "asc" | "desc" = sp.get("dir") === "desc" ? "desc" : "asc";

  const sortHrefs = useMemo(() => {
    const build = (k: string) => {
      const next = new URLSearchParams(sp.toString());
      next.set("sort", k);
      // Click a column to sort it; click the sorted column to reverse it.
      if (key === k && dir === "asc") next.set("dir", "desc");
      else next.delete("dir");
      const q = next.toString();
      return q ? `${pathname}?${q}` : pathname;
    };
    return Object.fromEntries(Object.keys(sorters).map((k) => [k, build(k)]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp, pathname, key, dir]);

  const sortedBy = key ? ({ key, dir } as const) : undefined;

  /**
   * Apply the sort, or hand the rows straight back when no column is chosen —
   * so each list keeps its own worst-first default until somebody asks for
   * something else.
   */
  const apply = useMemo(() => (rows: T[]): T[] => {
    if (!key) return rows;
    const { cmp, isEmpty } = sorters[key];
    return [...rows].sort((a, b) => {
      // Empties pinned last OUTSIDE the direction flip: reversing the sort
      // should reverse the real values, not float the blanks to the top.
      const ae = isEmpty?.(a) ?? false;
      const be = isEmpty?.(b) ?? false;
      if (ae !== be) return ae ? 1 : -1;
      if (ae && be) return 0;
      return dir === "desc" ? -cmp(a, b) : cmp(a, b);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, dir]);

  return { sortHrefs, sortedBy, apply };
}

/** Sort helpers, so every list compares the same way. */
export const by = {
  text: (v: string | null | undefined) => (v ?? "").toLowerCase(),
  num: (v: string | number | null | undefined) => {
    const n = typeof v === "string" ? Number(v) : v;
    return n == null || !Number.isFinite(n) ? 0 : n;
  },
  date: (v: string | null | undefined) => (v ? new Date(v).getTime() : 0),
};

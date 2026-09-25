"use client";

/**
 * Your own order for the pages (owner, 26 Sept 2026: "allow reordering of the
 * menu … make sure after reordering the swipe at the footer also behaves that
 * order"). The Go-to panel writes it; the footer's ‹ › steps read the same list,
 * so both always agree.
 *
 * Kept on this device (localStorage), one list per kind of person — the owner,
 * a director / manager, a member of staff — because their menus differ. A page
 * the saved list does not know (a new page, or one a permission added) keeps
 * its natural place; one that no longer exists is simply ignored. Pages only
 * move WITHIN their group, and Home stays first.
 */
import { useCallback, useEffect, useState } from "react";

const KEY = (kind: string) => `cos.navOrder.${kind}`;
const EVENT = "cos:nav-order";

function readNavOrder(kind: string): string[] {
  try {
    const raw = window.localStorage.getItem(KEY(kind));
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function useNavOrder(kind: string): [string[], (ids: string[] | null) => void] {
  const [order, setOrder] = useState<string[]>([]);
  useEffect(() => {
    setOrder(readNavOrder(kind));
    const on = (e: Event) => { if ((e as CustomEvent<string>).detail === kind) setOrder(readNavOrder(kind)); };
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, [kind]);
  const save = useCallback((ids: string[] | null) => {
    try {
      if (ids) window.localStorage.setItem(KEY(kind), JSON.stringify(ids));
      else window.localStorage.removeItem(KEY(kind));
    } catch { /* private window — the order just won't stick */ }
    setOrder(ids ?? []);
    window.dispatchEvent(new CustomEvent(EVENT, { detail: kind }));
  }, [kind]);
  return [order, save];
}

/** The stops in your order: groups keep their places, pages are sorted within
 *  each group by the saved list, unknown pages keep their natural position
 *  after the known ones, and "home" never moves. */
export function applyNavOrder<T extends { id: string; group: string }>(stops: T[], order: string[]): T[] {
  if (order.length === 0) return stops;
  const rank = new Map(order.map((id, i) => [id, i]));
  const groups: string[] = [];
  for (const s of stops) if (!groups.includes(s.group)) groups.push(s.group);
  const out: T[] = [];
  for (const g of groups) {
    const items = stops.filter((s) => s.group === g);
    const home = items.filter((s) => s.id === "home");
    const rest = items.filter((s) => s.id !== "home")
      .map((s, natural) => ({ s, natural }))
      .sort((a, b) => (rank.get(a.s.id) ?? 1e6 + a.natural) - (rank.get(b.s.id) ?? 1e6 + b.natural))
      .map((x) => x.s);
    out.push(...home, ...rest);
  }
  return out;
}

/** Move one page a step earlier (-1) or later (+1) within its group. Returns
 *  the new id order, or null when it cannot move that way. */
export function moveNavStop<T extends { id: string; group: string }>(stops: T[], id: string, dir: -1 | 1): string[] | null {
  const i = stops.findIndex((s) => s.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= stops.length) return null;
  if (stops[i].id === "home" || stops[j].id === "home" || stops[i].group !== stops[j].group) return null;
  const next = [...stops];
  [next[i], next[j]] = [next[j], next[i]];
  return next.map((s) => s.id);
}

"use client";

import { useSyncExternalStore } from "react";

/**
 * A tiny global store of the task list the operator is currently looking at —
 * the filtered/visible set on the hub Tasks view (or a company's open tasks).
 * The assistant reads this so bulk commands ("escalate these", "complete the
 * overdue ones") can resolve "these" to real task codes, including derived
 * flags (overdue/due-soon) that aren't DB columns.
 */
export type CurrentView = { codes: string[]; label?: string };

const EMPTY: CurrentView = { codes: [] };
let state: CurrentView = EMPTY;
const listeners = new Set<() => void>();

export function setCurrentView(v: CurrentView) {
  state = v;
  listeners.forEach((l) => l());
}
export function clearCurrentView() {
  if (state.codes.length === 0 && !state.label) return;
  setCurrentView(EMPTY);
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useCurrentView(): CurrentView {
  return useSyncExternalStore(subscribe, () => state, () => EMPTY);
}

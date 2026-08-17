/**
 * Note to-dos — the CLIENT-SAFE half. Phase 4 of memory/notes_module_plan.md.
 *
 * ⚠️ Same rule as `notes-shared.ts` and `note-links-shared.ts`: the server twin
 * imports `sb`, so anything a `"use client"` file needs lives HERE. This module
 * has walked into that trap twice; do not make it three.
 */

export type NoteTodo = {
  id: number;
  title: string;
  done: boolean;
  remindAt: string | null;
  dueAt: string | null;
  completedAt: string | null;
};

/**
 * When a reminder is set for, written the way a person would say it.
 *
 * Dates render in the viewer's zone (Dar es Salaam), which is the house rule for
 * every wall-clock in COS — the value itself is stored UTC.
 */
export function whenLabel(iso: string | null): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;

  const now = new Date();
  const sameDay = at.toDateString() === now.toDateString();
  const tomorrow = new Date(now.getTime() + 86_400_000);
  const isTomorrow = at.toDateString() === tomorrow.toDateString();

  const time = at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return `Today ${time}`;
  if (isTomorrow) return `Tomorrow ${time}`;
  return `${at.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} ${time}`;
}

/** A reminder whose moment has passed and which is still not done. */
export function isOverdue(todo: NoteTodo, now = Date.now()): boolean {
  if (todo.done || !todo.remindAt) return false;
  const at = new Date(todo.remindAt).getTime();
  return Number.isFinite(at) && at < now;
}

"use client";

/**
 * A small in-memory copy of recently read tasks, so a task record draws
 * STRAIGHT AWAY instead of showing "Loading PE-032…" (owner, 25 Sept 2026:
 * "I shouldn't feel like there's a loading screen at all").
 *
 * The record still fetches fresh every time it opens: it draws from here first
 * and swaps in the fresh copy the moment it lands (stale-while-revalidate). So
 * this can only ever make a record appear sooner, never show it wrong for long.
 *
 * Filled from three places: the side panel (it reads the same route), the
 * record itself, and `prefetchTaskDetail` for what you are ABOUT to open (a row
 * under the pointer, the task either side of the one you are on).
 *
 * ⚠️ A PREFETCH IS A PEEK. `/api/task-detail` stamps "the owner has seen this"
 * — that is what clears a task's unread dot. Prefetching with that stamp would
 * mark tasks read that were only hovered over, so prefetches pass `peek=1` and
 * the route skips the stamp. The record's own fetch, when it really opens,
 * still stamps it.
 */

type Entry = { data: unknown; at: number };

const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();
/** Keep the copy this long; after that a prefetch fetches again. */
const FRESH_MS = 60_000;
const MAX = 80;

export function cachedTaskDetail<T = unknown>(code: string | null | undefined): T | null {
  if (!code) return null;
  return (cache.get(code)?.data as T | undefined) ?? null;
}

export function storeTaskDetail(code: string, data: unknown) {
  cache.delete(code);
  cache.set(code, { data, at: Date.now() });
  // Oldest out first — a Map keeps insertion order.
  while (cache.size > MAX) cache.delete(cache.keys().next().value as string);
}

/** Read a task ahead of time, without marking it read. Cheap to call often:
 *  a fresh copy or a request already on its way is reused. */
export function prefetchTaskDetail(code: string | null | undefined): void {
  if (!code || typeof window === "undefined") return;
  const hit = cache.get(code);
  if (hit && Date.now() - hit.at < FRESH_MS) return;
  if (inflight.has(code)) return;
  const p = fetch(`/api/task-detail?code=${encodeURIComponent(code)}&peek=1`)
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => { if (d) storeTaskDetail(code, d); return d; })
    .catch(() => null)
    .finally(() => inflight.delete(code));
  inflight.set(code, p);
}

/** Forget a task's copy — after a write, so the next open is not stale. */
export function dropTaskDetail(code: string) {
  cache.delete(code);
}

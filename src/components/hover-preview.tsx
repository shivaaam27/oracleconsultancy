"use client";

import { useRef, useState, type ReactNode } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { Loader2 } from "lucide-react";

// Shared module-level cache so repeated hovers over the same entity don't
// refetch. Keyed by a caller-supplied string (e.g. "company:3", "task:DS-001").
const cache = new Map<string, unknown>();

/**
 * Generic lazy hover-preview. Wraps a single focusable child (the entity link)
 * in a Radix Tooltip; on first hover/focus it fetches `url`, caches the result,
 * and renders it via `render`. Keyboard-accessible; click on the child is
 * preserved (Radix merges handlers), so the link still opens its drawer.
 */
export function HoverPreview<T>({
  cacheKey,
  url,
  render,
  children,
  width = "w-60",
}: {
  cacheKey: string;
  url: string;
  render: (data: T) => ReactNode;
  children: ReactNode;
  width?: string;
}) {
  const [data, setData] = useState<T | null>(() => (cache.get(cacheKey) as T | undefined) ?? null);
  const [loading, setLoading] = useState(false);
  const fetched = useRef(cache.has(cacheKey));

  const load = async () => {
    if (fetched.current) return;
    fetched.current = true;
    setLoading(true);
    try {
      const res = await fetch(url);
      if (res.ok) {
        const json = (await res.json()) as T;
        cache.set(cacheKey, json);
        setData(json);
      } else {
        fetched.current = false; // allow retry on next hover
      }
    } catch {
      fetched.current = false;
    } finally {
      setLoading(false);
    }
  };

  return (
    <Tooltip.Provider delayDuration={350}>
      <Tooltip.Root onOpenChange={(o) => o && load()}>
        <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="top"
            align="start"
            sideOffset={8}
            collisionPadding={12}
            className={`z-[120] ${width} rounded-2xl glass-menu p-3 shadow-pill ring-1 ring-border/70`}
          >
            {data ? (
              render(data)
            ) : loading ? (
              <div className="flex items-center gap-2 text-xs text-fg-muted">
                <Loader2 size={13} className="animate-spin text-accent" /> Loading…
              </div>
            ) : (
              <div className="text-xs text-fg-muted">No preview available.</div>
            )}
            <Tooltip.Arrow className="fill-[var(--bg-elev)]" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

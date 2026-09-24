"use client";

/**
 * The two dark cards every Studio page opens with, fitted to a hand
 * (mockup M_Rules, rule 2 — "the list comes first", 25 Sept 2026).
 *
 * Phone (< md): ONE card at a time that you swipe, with dots under it — the two
 * stacked cards used to fill the whole first screen and push the list off it.
 * Tablet (md): side by side. Desk (lg): side by side, as before.
 *
 * Pure CSS scroll-snap; the only script is the dots (which card is showing,
 * and a tap on a dot goes there).
 */
import { Children, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export function StudioSwipeRow({ children, className, cols = 2 }: { children: ReactNode; className?: string; cols?: 2 | 3 }) {
  const track = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);
  const count = Children.toArray(children).filter(Boolean).length;
  const onScroll = () => {
    const el = track.current;
    if (el && el.clientWidth) setAt(Math.round(el.scrollLeft / el.clientWidth));
  };
  const go = (i: number) => {
    const el = track.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  };
  return (
    <div className="shrink-0">
      <div
        ref={track}
        onScroll={onScroll}
        className={cn(
          // phone: a snapping track that runs to the screen's edges
          "-mx-4 flex items-start snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          "[&>*]:w-full [&>*]:shrink-0 [&>*]:snap-center",
          // tablet and up: the grid it always was
          "md:mx-0 md:grid md:items-stretch md:gap-5 md:overflow-visible md:px-0 md:[&>*]:w-auto",
          cols === 3 ? "md:grid-cols-2 lg:grid-cols-3" : "md:grid-cols-2",
          className,
        )}
      >
        {children}
      </div>
      {count > 1 && (
        <div className="mt-2.5 flex justify-center gap-1.5 md:hidden" role="tablist" aria-label="Cards">
          {Array.from({ length: count }, (_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={at === i}
              aria-label={`Card ${i + 1} of ${count}`}
              onClick={() => go(i)}
              className={cn("h-1.5 rounded-full transition-all", at === i ? "w-4 bg-[var(--st-ink)]" : "w-1.5 bg-[var(--st-muted)] opacity-40")}
            />
          ))}
        </div>
      )}
    </div>
  );
}

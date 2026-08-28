"use client";

import { useEffect, useState } from "react";

/**
 * True while a media query matches.
 *
 * ⚠️ THE INITIAL VALUE IS READ SYNCHRONOUSLY WHERE THERE IS A WINDOW. A hook
 * that starts `false` and corrects itself in an effect renders one frame of the
 * wrong layout, which on a phone is a visible jump — and for the note editor it
 * would be a bordered box flashing before the full-screen sheet. The editor is
 * loaded `ssr: false`, so its first render IS a client render and the lazy
 * initialiser is simply right.
 *
 * `fallback` is what to answer with no window (a server render). Pick whichever
 * side of the query renders correctly when it turns out to be wrong for a frame.
 *
 * ⚠️ PREFER A TAILWIND VARIANT. Layout that CSS can express should be expressed
 * in CSS — it cannot flash and it costs no JavaScript. Reach for this only where
 * BEHAVIOUR differs: a scroll lock, an effect that must not run, a component that
 * must not be in the tree at all.
 */
export function useMediaQuery(query: string, fallback = false): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === "undefined" ? fallback : window.matchMedia(query).matches
  );

  useEffect(() => {
    const mq = window.matchMedia(query);
    const sync = () => setMatches(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [query]);

  return matches;
}

/** Below `lg` — where the desk rail gives way to the floating pill. */
export const BELOW_LG = "(max-width: 1023px)";

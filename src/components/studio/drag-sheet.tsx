"use client";

/**
 * A bottom sheet you can DRAG by its grip (owner, 26 Sept 2026: "I can extend
 * it upper and lower and even close it, so make it fluid"). One behaviour for
 * every phone sheet — the Filter panel and the task preview — so they open,
 * size and close the same way everywhere.
 *
 *  - It opens at ONE height (`base`), whatever is inside it; the inside scrolls.
 *    (The Filter sheet used to change height with each tab.) `base: "content"`
 *    = as tall as what it opened showing (the Filter's Company list), then
 *    held there for every other tab — no empty space under a short list.
 *  - Drag the grip up → it grows to `full`. Down from full → back to `base`.
 *    Down from base (or a quick flick) → it slides away and closes.
 *  - Only the grip strip takes the drag: buttons and lists under it keep
 *    their taps and scrolling.
 *
 * `enabled` false (a desk, where these are not sheets) = no inline sizing.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";

const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";

export function useDragSheet({
  open = true,
  enabled,
  onClose,
  base = "min(78dvh, 680px)",
  full = "calc(100dvh - 16px - env(safe-area-inset-top))",
}: {
  /** Each time it opens it starts afresh, at the base height. */
  open?: boolean;
  enabled: boolean;
  onClose: () => void;
  base?: string;
  full?: string;
}) {
  const [size, setSize] = useState<"base" | "full">("base");
  const [drag, setDrag] = useState<number | null>(null);
  const [leaving, setLeaving] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const start = useRef({ y: 0, t: 0, h: 0, max: 0 });
  // "content": measured once per opening, from what it opened showing.
  const [measured, setMeasured] = useState<number | null>(null);
  useLayoutEffect(() => { if (open) setMeasured(null); }, [open]);
  useLayoutEffect(() => {
    if (!open || !enabled || base !== "content" || measured !== null || !sheetRef.current) return;
    setMeasured(Math.min(sheetRef.current.offsetHeight, Math.round(window.innerHeight * 0.85)));
  });

  const close = useCallback(() => {
    if (!enabled) { onClose(); return; }
    setLeaving(true);
    window.setTimeout(onClose, 220);
  }, [enabled, onClose]);

  // A fresh open always starts at the base height.
  useEffect(() => { if (open) { setSize("base"); setLeaving(false); setDrag(null); } }, [open]);

  function down(e: ReactPointerEvent<HTMLElement>) {
    if (!enabled || e.button !== 0) return;
    const el = sheetRef.current;
    start.current = { y: e.clientY, t: performance.now(), h: el?.offsetHeight ?? 0, max: window.innerHeight - 16 };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* the pointer has already gone */ }
    setDrag(0);
  }
  function move(e: ReactPointerEvent<HTMLElement>) {
    if (drag === null) return;
    setDrag(e.clientY - start.current.y);
  }
  function up(e: ReactPointerEvent<HTMLElement>) {
    if (drag === null) return;
    const d = e.clientY - start.current.y;
    const v = d / Math.max(1, performance.now() - start.current.t); // px per ms
    setDrag(null);
    if (d > 0) {
      const far = d > start.current.h * 0.45 || v > 1.1;
      if (size === "full" && !far) setSize("base");
      else if (d > 90 || v > 0.6) close();
    } else if (base !== "auto" && (-d > 40 || v < -0.45)) {
      setSize("full");
    }
  }

  const style: CSSProperties | undefined = !enabled ? undefined : {
    // A menu sized by its contents (base "auto") only drags DOWN, to close.
    height: drag !== null && drag < 0 && base !== "auto"
      ? `${Math.min(start.current.max, start.current.h - drag)}px`
      : size === "full" ? full
      : base === "content" ? (measured === null ? undefined : `${measured}px`)
      : base,
    maxHeight: full,
    transform: leaving ? "translateY(105%)" : drag !== null && drag > 0 ? `translateY(${drag}px)` : undefined,
    transition: drag !== null ? "none" : `height 260ms ${EASE}, transform 240ms ${EASE}`,
  };

  const grip = {
    onPointerDown: down,
    onPointerMove: move,
    onPointerUp: up,
    onPointerCancel: up,
    style: { touchAction: "none" } as CSSProperties,
  };

  return { sheetRef, style, grip, size, setSize, close, leaving };
}

/** The grip: a full-width strip you can take hold of, with the pill in it. */
export function SheetGrip(props: ReturnType<typeof useDragSheet>["grip"] & { className?: string }) {
  const { className, ...grip } = props;
  return (
    <div {...grip} aria-hidden className={`flex h-6 w-full shrink-0 cursor-grab items-center justify-center active:cursor-grabbing ${className ?? ""}`}>
      <span className="h-[5px] w-10 rounded-full bg-[var(--sh-chip-line,var(--st-field-line))]" />
    </div>
  );
}

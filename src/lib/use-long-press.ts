"use client";

import { useRef, useCallback } from "react";

/** Fire a short haptic where supported (Android). iOS Safari is a silent no-op. */
export function triggerHaptic(ms = 9) {
  try {
    const nav = navigator as Navigator & { vibrate?: (p: number | number[]) => boolean };
    nav.vibrate?.(ms);
  } catch { /* unsupported */ }
}

/**
 * Long-press detector. Returns pointer handlers + a `consumed` ref you can check
 * in the element's onClick to suppress the click that follows a long-press.
 * Cancels if the finger moves (so it never fights scrolling).
 */
export function useLongPress(onLongPress: () => void, delay = 380) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const consumed = useRef(false);

  const clear = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    consumed.current = false;
    start.current = { x: e.clientX, y: e.clientY };
    clear();
    timer.current = setTimeout(() => {
      consumed.current = true;
      triggerHaptic();
      onLongPress();
    }, delay);
  }, [onLongPress, delay, clear]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!start.current) return;
    if (Math.abs(e.clientX - start.current.x) > 8 || Math.abs(e.clientY - start.current.y) > 8) clear();
  }, [clear]);

  return {
    handlers: { onPointerDown, onPointerMove, onPointerUp: clear, onPointerLeave: clear, onPointerCancel: clear },
    consumed,
  };
}

"use client";

/** Fire a short haptic where supported (Android). iOS Safari is a silent no-op. */
export function triggerHaptic(ms = 9) {
  try {
    const nav = navigator as Navigator & { vibrate?: (p: number | number[]) => boolean };
    nav.vibrate?.(ms);
  } catch { /* unsupported */ }
}

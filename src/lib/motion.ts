import type { Transition, Variants } from "framer-motion";

/* ═══════════════════════════════════════════════════════════════════════
 * Shared motion presets — one source of truth so animation feels consistent
 * across the app (sheets, popovers, tabs, cards). Pair with the CSS motion
 * tokens (--ease-spring, --dur-*). All respect reduced-motion via the global
 * <MotionConfig reducedMotion="user"> in the layout.
 * ═══════════════════════════════════════════════════════════════════════ */

/** Standard spring — sheets, drawers, morphing indicators. */
export const spring: Transition = { type: "spring", stiffness: 380, damping: 32 };
/** Softer spring — large surfaces / hero entrances. */
export const springSoft: Transition = { type: "spring", stiffness: 260, damping: 30 };
/** Snappy spring — small controls, segmented morph. */
export const springSnappy: Transition = { type: "spring", stiffness: 520, damping: 36 };
/** Quick eased tween — fades, opacity. */
export const easeOut: Transition = { duration: 0.22, ease: [0.16, 1, 0.3, 1] };

/** Fade + rise (route/section transitions). */
export const fadeUp: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
};

/** Centred pop-up (dialogs/inspector). */
export const popIn: Variants = {
  initial: { opacity: 0, scale: 0.97, y: 8 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.97, y: 8 },
};

/** Right-anchored drawer (where a side panel is still wanted). */
export const slideRight: Variants = {
  initial: { x: "100%" },
  animate: { x: 0 },
  exit: { x: "100%" },
};

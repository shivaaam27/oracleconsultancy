"use client";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import type { ReactNode } from "react";

/** Crossfade between routes with no blank gap.
 *
 * We deliberately avoid `mode="wait"`: that fades the old page fully OUT to
 * opacity 0 and only THEN mounts the new one, leaving a frame where nothing but
 * the body background shows — read as a "white flash" on light themes and on the
 * PWA/standalone shell. Instead both pages stay mounted and crossfade; the
 * outgoing one is lifted out of flow (absolute) so there's no layout jump, while
 * the incoming one rises in. The result is a continuous flow with no blank.
 *
 * Reduced-motion is honoured globally via <MotionConfig reducedMotion="user"> in
 * the root layout (it strips the transform/opacity tweens), so we don't gate here. */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="relative">
      <AnimatePresence initial={false}>
        <motion.div
          key={pathname}
          className="page-flow"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          // Lift the old page out of flow the instant it starts leaving so the
          // incoming page takes its place (no double-height jump, no blank gap).
          // `position` isn't tweened — framer applies it immediately.
          exit={{ opacity: 0, position: "absolute", top: 0, left: 0 }}
          transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
          style={{ width: "100%" }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

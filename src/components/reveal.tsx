"use client";

import { motion } from "framer-motion";
import { fadeUp, easeOut } from "@/lib/motion";

/* A lightweight entrance wrapper: children fade + rise in on mount. Stagger a
 * group by passing an increasing `delay`. Reduced-motion safe — the global
 * <MotionConfig reducedMotion="user"> strips the transform, leaving a gentle
 * fade (or nothing). Usable from server components (children are passed in). */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      variants={fadeUp}
      initial="initial"
      animate="animate"
      transition={{ ...easeOut, delay }}
    >
      {children}
    </motion.div>
  );
}

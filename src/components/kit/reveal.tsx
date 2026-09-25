"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { fadeUp, easeOut } from "@/lib/motion";

/* A lightweight entrance wrapper: children fade + rise in on mount. Stagger a
 * group by passing an increasing `delay`. Reduced-motion safe two ways:
 *   1. the OS "prefers reduced motion" media query (framer's useReducedMotion);
 *   2. the portal's manual toggle, which sets data-motion="reduced" on <html>
 *      — framer's JS animations don't watch that attribute, so we check it here.
 * When either is on, we render a plain wrapper with no transform. Usable from
 * server components (children are passed in). */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const prefersReduced = useReducedMotion();
  const [manualReduced, setManualReduced] = useState(false);
  useEffect(() => {
    setManualReduced(document.documentElement.getAttribute("data-motion") === "reduced");
  }, []);

  if (prefersReduced || manualReduced) {
    return <div className={className}>{children}</div>;
  }

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

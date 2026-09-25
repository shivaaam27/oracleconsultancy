"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

/** Wraps form content; gives a polite shake whenever `errorKey` changes. */
export function ShakeOnError({ errorKey, children }: { errorKey: string | null; children: React.ReactNode }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (errorKey) setTick((t) => t + 1);
  }, [errorKey]);
  return (
    <motion.div
      key={tick}
      initial={tick > 0 ? { x: 0 } : false}
      animate={tick > 0 ? { x: [0, -8, 8, -5, 5, 0] } : undefined}
      transition={{ duration: 0.35 }}
    >
      {children}
    </motion.div>
  );
}

"use client";

import { useRef, useState, type ReactNode } from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { CheckCircle2, AlertOctagon, Loader2 } from "lucide-react";
import { springSnappy } from "@/lib/motion";

/**
 * iOS-style swipeable row. Swipe right past the threshold → primary action
 * (complete); swipe left → secondary (escalate). Coloured reveals sit behind
 * the row; a plain tap (no drag) calls onTap. Snap-back is a spring.
 *
 * Touch + pointer both work; a real drag suppresses the tap so opening the
 * inspector by click still feels right on desktop.
 */
const THRESHOLD = 84;

export function SwipeRow({
  children,
  onTap,
  onSwipeRight,
  onSwipeLeft,
  rightLabel = "Complete",
  leftLabel = "Escalate",
  className = "",
}: {
  children: ReactNode;
  onTap?: () => void;
  onSwipeRight?: () => void | Promise<void>;
  onSwipeLeft?: () => void | Promise<void>;
  rightLabel?: string;
  leftLabel?: string;
  className?: string;
}) {
  const x = useMotionValue(0);
  const dragged = useRef(false);
  const [busy, setBusy] = useState(false);

  const rightReveal = useTransform(x, [8, THRESHOLD], [0, 1]);
  const leftReveal = useTransform(x, [-THRESHOLD, -8], [1, 0]);

  async function handleDragEnd(_: unknown, info: { offset: { x: number }; velocity: { x: number } }) {
    const far = (d: number) => Math.abs(info.offset.x) > THRESHOLD || (Math.abs(info.offset.x) > 56 && Math.abs(info.velocity.x) > 320 && Math.sign(info.offset.x) === d);
    if (onSwipeRight && info.offset.x > 0 && far(1)) {
      setBusy(true);
      await onSwipeRight(); // parent typically removes the row
      return;
    }
    if (onSwipeLeft && info.offset.x < 0 && far(-1)) {
      setBusy(true);
      await onSwipeLeft();
      animate(x, 0, springSnappy);
      setBusy(false);
      return;
    }
    animate(x, 0, springSnappy);
  }

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* right-swipe reveal (complete) */}
      {onSwipeRight && (
        <motion.div style={{ opacity: rightReveal }} className="absolute inset-0 flex items-center gap-2 pl-5 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-sm font-medium pointer-events-none">
          <CheckCircle2 size={18} /> {rightLabel}
        </motion.div>
      )}
      {/* left-swipe reveal (escalate) */}
      {onSwipeLeft && (
        <motion.div style={{ opacity: leftReveal }} className="absolute inset-0 flex items-center justify-end gap-2 pr-5 bg-red-500/15 text-red-600 dark:text-red-400 text-sm font-medium pointer-events-none">
          {leftLabel} <AlertOctagon size={18} />
        </motion.div>
      )}

      <motion.div
        drag={busy ? false : "x"}
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: onSwipeLeft ? 0.55 : 0.04, right: onSwipeRight ? 0.55 : 0.04 }}
        style={{ x }}
        onDragStart={() => { dragged.current = true; }}
        onDragEnd={handleDragEnd}
        onClick={() => { if (dragged.current) { dragged.current = false; return; } onTap?.(); }}
        className="relative bg-bg-elev select-none"
      >
        {children}
        {busy && (
          <div className="absolute inset-0 bg-bg-elev/70 flex items-center justify-center">
            <Loader2 size={16} className="animate-spin text-accent" />
          </div>
        )}
      </motion.div>
    </div>
  );
}

"use client";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import type { ReactNode } from "react";

/** A soft rise-in for each new page — and ONLY ever one page on screen.
 *
 * ⚠️ THIS USED TO CROSSFADE, AND THE CROSSFADE DUPLICATED WHOLE PAGES ON THE
 * LIVE SITE (owner, 22 Sept 2026: the task list, and then the task record,
 * drawn twice, one under the other). `AnimatePresence` kept the outgoing page
 * mounted for its 260ms exit — but that "outgoing page" is `{children}`, which
 * is Next's router slot, and it renders whatever the router says NOW. So the
 * leaving copy was never the old page: it was a second live copy of the NEW
 * one, with its own filter bar, its own URL-syncing hooks and its own search
 * box, all reading the current address. On a fast machine, going list → task →
 * back inside that window left the copy stuck in the page, fully visible — and
 * two filter bars both writing the address is how a filter can reset itself.
 *
 * So there is no exit any more. The new page replaces the old one in the same
 * frame and fades up from 40% (never from 0, which is the "white flash" the
 * old `mode="wait"` version was removed for). Do not reintroduce
 * `AnimatePresence` around `{children}`.
 *
 * Reduced-motion is honoured globally via <MotionConfig reducedMotion="user"> in
 * the root layout (it strips the transform/opacity tweens), so we don't gate here. */
export function PageTransition({
  children,
  stableUnder,
}: {
  children: ReactNode;
  /**
   * Route prefixes under which this instance does NOT re-animate — the key
   * collapses to the prefix, so every address inside it is "the same page".
   *
   * ⚠️ THE ROOT INSTANCE MUST PASS `["/portal"]`. For portal routes the root
   * layout's `{children}` is the ENTIRE portal layout, sidebar and all, and the
   * animation's `transform` makes the wrapper the containing block for
   * `position: fixed` — the portal's pinned sidebar rode the animation on every
   * click. With the key collapsed this instance animates into the portal once;
   * the portal layout's own instance (which wraps only the page) does the rest.
   */
  stableUnder?: string[];
}) {
  const pathname = usePathname();
  const key =
    stableUnder?.find((p) => pathname === p || pathname.startsWith(p + "/")) ?? pathname;
  return (
    <motion.div
      key={key}
      className="page-flow"
      initial={{ opacity: 0.4, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      style={{ width: "100%" }}
    >
      {children}
    </motion.div>
  );
}

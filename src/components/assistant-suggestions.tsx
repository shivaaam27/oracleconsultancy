"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { motion, AnimatePresence, type PanInfo } from "framer-motion";
import { ChevronUp } from "lucide-react";
import { cn } from "@/lib/cn";
import { spring, springSnappy } from "@/lib/motion";
import { derivePageContext } from "@/lib/page-context";
import { suggestionsFor } from "@/lib/page-suggestions";
import { askAssistant } from "@/lib/assistant-bridge";

/* --------------------------------------------------------------------- */
/* The floating suggestion reveal — context-aware AI prompts that surface  */
/* above the AUMIO pill without opening the panel.                         */
/*                                                                         */
/*   peek   → idle hint bar, a thin edge above the pill                    */
/*   open   → the 4 prompts fanned out, each tappable                      */
/*   hidden → tucked away (mobile: deliberate second swipe-down)           */
/*                                                                         */
/* Mobile: swipe the hint up to open, swipe the stack down to tuck.        */
/* Desktop: hover the hint/stack to reveal; click away to settle back.     */
/* --------------------------------------------------------------------- */

type RevealState = "peek" | "open";

export function AssistantSuggestions() {
  const pathname = usePathname() || "/";
  const searchParams = useSearchParams();
  const pageContext = derivePageContext(pathname, searchParams);
  const suggestions = suggestionsFor(pageContext);

  const [state, setState] = useState<RevealState>("peek");
  const [isMobile, setIsMobile] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track viewport so gestures (mobile) vs hover (desktop) apply correctly.
  useEffect(() => {
    const m = window.matchMedia("(max-width: 639px)");
    const u = () => setIsMobile(m.matches);
    u(); m.addEventListener("change", u);
    return () => m.removeEventListener("change", u);
  }, []);

  // Reset to the gentle peek hint whenever the page (and thus the prompts) change.
  useEffect(() => { setState("peek"); }, [pathname, searchParams]);

  // Hide entirely while the assistant panel itself is open.
  useEffect(() => {
    const h = (e: Event) => setPanelOpen(!!(e as CustomEvent).detail?.open);
    window.addEventListener("cos:assistant-state", h);
    return () => window.removeEventListener("cos:assistant-state", h);
  }, []);

  // Settle back to the peek chevron when tapping/clicking anywhere outside the
  // reveal (both mobile and desktop).
  useEffect(() => {
    if (state !== "open") return;
    const onDown = (e: PointerEvent) => {
      if (!(e.target as HTMLElement)?.closest("[data-suggest-reveal]")) setState("peek");
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [state]);

  // Mobile: if left untouched, ease back to the peek chevron on its own.
  useEffect(() => {
    if (!isMobile || state !== "open") return;
    const t = setTimeout(() => setState("peek"), 5000);
    return () => clearTimeout(t);
  }, [isMobile, state]);

  function clearHover() { if (hoverTimer.current) { clearTimeout(hoverTimer.current); hoverTimer.current = null; } }
  function onEnter() { if (isMobile) return; clearHover(); setState("open"); }
  function onLeave() { if (isMobile) return; clearHover(); hoverTimer.current = setTimeout(() => setState("peek"), 250); }

  function onStackDragEnd(_: unknown, info: PanInfo) {
    // Swipe the open stack down → tuck it back into the peek chevron.
    const down = info.offset.y > 60 || info.velocity.y > 500;
    if (down) setState("peek");
  }
  function onPeekDragEnd(_: unknown, info: PanInfo) {
    // Swipe the chevron up → reveal; swipe it down → collapse.
    const up = info.offset.y < -40 || info.velocity.y < -450;
    const down = info.offset.y > 40 || info.velocity.y > 450;
    if (up) setState("open");
    else if (down) setState("peek");
  }

  function pick(q: string) { askAssistant(q); setState("peek"); }

  if (panelOpen || suggestions.length === 0) return null;

  const open = state === "open";

  return (
    <div
      data-suggest-reveal
      data-focus-hide
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      className="fixed z-[58] right-4 sm:right-5 bottom-[calc(8.6rem+env(safe-area-inset-bottom))] sm:bottom-[calc(4.6rem+env(safe-area-inset-bottom))] w-[min(17.5rem,calc(100vw-2rem))] flex flex-col items-end pointer-events-none"
    >
      {/* Cards genie out of — and retract into — the chevron below them. The
          chevron stays pinned (container is bottom-anchored), so the stack only
          ever grows upward from / collapses down toward the chevron. */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="cards"
            drag={isMobile ? "y" : false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.04, bottom: 0.6 }}
            dragMomentum={false}
            onDragEnd={onStackDragEnd}
            initial={{ opacity: 0, scale: 0.5, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.5, y: 14 }}
            transition={{ type: "spring", stiffness: 460, damping: 36, mass: 0.8 }}
            style={{ transformOrigin: "bottom right" }}
            className="pointer-events-auto mb-3 w-full flex flex-col items-stretch gap-1.5 touch-pan-x"
          >
            {suggestions.map((s, i) => {
              const Icon = s.icon;
              return (
                <motion.button
                  key={s.label}
                  type="button"
                  onClick={() => pick(s.q)}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...springSnappy, delay: 0.03 + i * 0.045 }}
                  whileTap={{ scale: 0.97 }}
                  className="group w-full flex items-center gap-2.5 glass glass-menu elevated rounded-2xl py-2.5 pl-2.5 pr-3.5 text-left hover:bg-bg-muted/50 transition-colors"
                >
                  <span className="flex items-center justify-center h-7 w-7 rounded-full bg-accent-soft text-accent shrink-0 group-hover:scale-105 transition-transform">
                    <Icon size={14} strokeWidth={2.2} />
                  </span>
                  <span className="text-[13px] font-medium leading-snug text-fg">{s.label}</span>
                </motion.button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* The chevron — always present; it is the origin/destination of the reveal. */}
      <motion.button
        type="button"
        drag={isMobile ? "y" : false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0.6, bottom: 0.6 }}
        dragMomentum={false}
        onDragEnd={onPeekDragEnd}
        onClick={() => setState(open ? "peek" : "open")}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={spring}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.9 }}
        aria-label={open ? "Hide AI suggestions" : "Show AI suggestions"}
        aria-expanded={open}
        className="pointer-events-auto mr-[0.6rem] sm:mr-[0.7rem] inline-flex items-center justify-center h-9 w-9 rounded-full glass elevated shadow-pill text-accent ring-1 ring-border/60 touch-pan-x"
      >
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
        >
          <ChevronUp size={16} />
        </motion.span>
      </motion.button>
    </div>
  );
}

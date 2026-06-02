"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { motion, AnimatePresence, type PanInfo } from "framer-motion";
import { ChevronUp } from "lucide-react";
import { cn } from "@/lib/cn";
import { spring, springSnappy } from "@/lib/motion";
import { derivePageContext } from "@/lib/page-context";
import { suggestionsFor } from "@/lib/page-suggestions";
import { askAssistant } from "./floating-assistant";

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

type RevealState = "peek" | "open" | "hidden";

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

  // Desktop: settle back to peek when clicking anywhere outside the reveal.
  useEffect(() => {
    if (isMobile || state !== "open") return;
    const onDown = (e: PointerEvent) => {
      if (!(e.target as HTMLElement)?.closest("[data-suggest-reveal]")) setState("peek");
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [isMobile, state]);

  function clearHover() { if (hoverTimer.current) { clearTimeout(hoverTimer.current); hoverTimer.current = null; } }
  function onEnter() { if (isMobile) return; clearHover(); setState("open"); }
  function onLeave() { if (isMobile) return; clearHover(); hoverTimer.current = setTimeout(() => setState("peek"), 250); }

  function onStackDragEnd(_: unknown, info: PanInfo) {
    const down = info.offset.y > 60 || info.velocity.y > 500;
    if (down) setState("hidden");
  }
  function onPeekDragEnd(_: unknown, info: PanInfo) {
    const up = info.offset.y < -40 || info.velocity.y < -450;
    const down = info.offset.y > 40 || info.velocity.y > 450;
    if (up) setState("open");
    else if (down) setState("hidden");
  }

  function pick(q: string) { askAssistant(q); setState("peek"); }

  if (panelOpen || suggestions.length === 0) return null;

  return (
    <div
      data-suggest-reveal
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      className="fixed z-[58] right-4 sm:right-5 bottom-[calc(8.6rem+env(safe-area-inset-bottom))] sm:bottom-[calc(4.6rem+env(safe-area-inset-bottom))] flex flex-col items-end pointer-events-none"
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {state === "open" ? (
          <motion.div
            key="open"
            drag={isMobile ? "y" : false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.05, bottom: 0.6 }}
            dragMomentum={false}
            onDragEnd={onStackDragEnd}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={spring}
            className="pointer-events-auto flex flex-col items-end gap-2 w-[min(17rem,calc(100vw-2rem))] touch-pan-x"
          >
            {isMobile && (
              <span className="mb-0.5 h-1 w-9 rounded-full bg-fg-subtle/40 self-center" aria-hidden />
            )}
            {suggestions.map((s, i) => {
              const Icon = s.icon;
              return (
                <motion.button
                  key={s.label}
                  type="button"
                  onClick={() => pick(s.q)}
                  initial={{ opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ ...springSnappy, delay: i * 0.035 }}
                  className="group w-full inline-flex items-center gap-2.5 glass glass-menu elevated shadow-pill rounded-2xl px-3.5 py-2.5 text-left text-[13px] text-fg hover:bg-bg-muted/60 transition-colors active:scale-[0.98]"
                >
                  <Icon size={15} className="shrink-0 text-accent" />
                  <span className="truncate">{s.label}</span>
                </motion.button>
              );
            })}
          </motion.div>
        ) : state === "peek" ? (
          // Idle hint — a small circular chevron that invites a swipe-up / hover.
          <motion.button
            key="peek"
            type="button"
            drag={isMobile ? "y" : false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.6, bottom: 0.2 }}
            dragMomentum={false}
            onDragEnd={onPeekDragEnd}
            onClick={() => setState("open")}
            initial={{ opacity: 0, y: 8, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.8 }}
            transition={spring}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.9 }}
            aria-label="Show AI suggestions"
            className="pointer-events-auto mr-[0.6rem] sm:mr-[0.7rem] inline-flex items-center justify-center h-9 w-9 rounded-full glass elevated shadow-pill text-accent ring-1 ring-border/60 touch-pan-x"
          >
            <motion.span
              animate={{ y: [0, -1.5, 0] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
            >
              <ChevronUp size={16} />
            </motion.span>
          </motion.button>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

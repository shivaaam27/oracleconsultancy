"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence, useDragControls } from "framer-motion";
import { X } from "lucide-react";
import { spring } from "@/lib/motion";
import { useSuppressContextActions } from "./context-actions";

/**
 * A route-driven modal used by intercepting routes: the page underneath stays
 * mounted (parallel @modal slot), so opening this feels like an overlay rather
 * than a navigation. Closing pops the history entry (router.back), revealing the
 * originating section exactly as it was.
 *
 * Mobile: an iOS-style bottom sheet you can drag down to dismiss (drag is
 * initiated from the grab handle so it never fights the scrollable body or
 * inputs). Desktop: a centered card. The body is flush — children own their
 * scroll area and any sticky footer.
 */
export function RouteModal({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  const router = useRouter();
  const close = () => router.back();
  const dragControls = useDragControls();
  useSuppressContextActions();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AnimatePresence>
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={close}
        className="fixed inset-0 z-[95] bg-black/45 backdrop-blur-[3px]"
      />
      <motion.div
        key="panel"
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        transition={spring}
        drag="y"
        dragControls={dragControls}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.6 }}
        onDragEnd={(_, info) => { if (info.offset.y > 110 || info.velocity.y > 600) close(); }}
        className="fixed z-[96] inset-x-0 bottom-0 sm:inset-0 sm:m-auto sm:h-fit sm:max-w-2xl sm:w-[calc(100vw-2rem)] flex flex-col max-h-[92svh] sm:max-h-[88vh]"
      >
        <div className="glass glass-menu elevated rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col flex-1 min-h-0">
          {/* Grab handle (mobile) — the drag affordance. */}
          <div
            onPointerDown={(e) => dragControls.start(e)}
            className="sm:hidden pt-2.5 pb-1.5 flex justify-center shrink-0 cursor-grab active:cursor-grabbing touch-none"
          >
            <span className="h-1.5 w-10 rounded-full bg-fg-subtle/40" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between gap-3 px-5 py-2.5 sm:py-3.5 border-b border-border/60 shrink-0">
            <div className="min-w-0">
              <h2 className="text-base font-semibold tracking-tight truncate">{title}</h2>
              {subtitle && <p className="text-xs text-fg-muted mt-0.5 truncate">{subtitle}</p>}
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="shrink-0 h-8 w-8 inline-flex items-center justify-center rounded-full text-fg-muted hover:text-fg hover:bg-bg-muted transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Body — children own scroll + any sticky footer. */}
          <div className="flex-1 min-h-0 flex flex-col">
            {children}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

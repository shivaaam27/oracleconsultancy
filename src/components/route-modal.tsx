"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { spring } from "@/lib/motion";

/**
 * A route-driven modal used by intercepting routes: the page underneath stays
 * mounted (parallel @modal slot), so opening this feels like an overlay rather
 * than a navigation. Closing pops the history entry (router.back), revealing the
 * originating section exactly as it was. Centered card on desktop, bottom sheet
 * on mobile.
 */
export function RouteModal({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  const router = useRouter();
  const close = () => router.back();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    // Lock background scroll while the modal is open.
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
        // Bottom sheet on mobile, centered card on desktop.
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 24, scale: 0.98 }}
        transition={spring}
        className="fixed z-[96] inset-x-0 bottom-0 sm:inset-0 sm:m-auto sm:h-fit sm:max-w-2xl sm:w-[calc(100vw-2rem)] flex flex-col max-h-[92svh] sm:max-h-[88vh]"
      >
        <div className="glass glass-menu elevated rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col max-h-[92svh] sm:max-h-[88vh]">
          <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-border/60 shrink-0">
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
          <div className="overflow-y-auto px-5 py-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
            {children}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

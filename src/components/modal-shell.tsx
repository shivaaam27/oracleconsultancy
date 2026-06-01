"use client";

import { useEffect } from "react";
import { motion, AnimatePresence, useDragControls } from "framer-motion";
import { X } from "lucide-react";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/cn";
import { useContextBarSuppressed } from "./context-actions";

/**
 * The unified pop-up shell for the whole app. Every modal / drawer / sheet uses
 * this so they share one design language:
 *  - mobile: an iOS-style bottom sheet with a grab handle and drag-to-dismiss;
 *  - desktop: a centred glass card;
 *  - a consistent header (leading slot or title/subtitle, trailing slot, close);
 *  - scroll-locked, dimmed, blurred backdrop; Esc / backdrop / drag to close.
 *
 * The body is flush — children own their scroll area and any sticky footer.
 */
export function ModalShell({
  open,
  onClose,
  title,
  subtitle,
  ariaLabel,
  headerLeading,
  headerTrailing,
  maxWidthClass = "sm:max-w-lg",
  suppressBar = true,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Accessible name for screen readers when there's no visible text title. */
  ariaLabel?: string;
  /** Replaces the title/subtitle area on the left of the header. */
  headerLeading?: React.ReactNode;
  /** Extra controls shown before the close button. */
  headerTrailing?: React.ReactNode;
  /** Desktop max width utility, e.g. "sm:max-w-2xl". */
  maxWidthClass?: string;
  /** Hide the context action bar while open (default true). */
  suppressBar?: boolean;
  children: React.ReactNode;
}) {
  const dragControls = useDragControls();
  useContextBarSuppressed(open && suppressBar);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="fixed inset-0 z-[95] bg-black/45 backdrop-blur-[3px]"
          />
          <motion.div
            key="panel"
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={spring}
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => { if (info.offset.y > 110 || info.velocity.y > 600) onClose(); }}
            className={cn(
              "fixed z-[96] inset-x-0 bottom-0 sm:inset-0 sm:m-auto sm:h-fit sm:w-[calc(100vw-2rem)] flex flex-col max-h-[92svh] sm:max-h-[88vh]",
              maxWidthClass
            )}
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
              <div className="flex items-center justify-between gap-3 px-5 py-2.5 sm:py-3 border-b border-border/60 shrink-0">
                <div className="min-w-0 flex items-center gap-2">
                  {headerLeading ?? (
                    <div className="min-w-0">
                      {title && <h2 className="text-base font-semibold tracking-tight truncate">{title}</h2>}
                      {subtitle && <p className="text-xs text-fg-muted mt-0.5 truncate">{subtitle}</p>}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {headerTrailing}
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close"
                    className="h-8 w-8 inline-flex items-center justify-center rounded-full text-fg-muted hover:text-fg hover:bg-bg-muted transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Body — children own scroll + any sticky footer. */}
              <div className="flex-1 min-h-0 flex flex-col">
                {children}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

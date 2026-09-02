"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useDragControls, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

/* ═══════════════════════════════════════════════════════════════════════
 * BottomSheet — the canonical iPhone-style action sheet for the portal.
 *
 *  • Mobile: rises from the bottom on a spring, rounded top, a grabber you can
 *    drag down to dismiss (matches the capture-wizard mechanics), safe-area
 *    padded, body scrolls, sticky footer for the primary action.
 *  • Desktop: a centred liquid-glass dialog (popIn).
 *  • Reduced-motion safe two ways (OS query + the portal's manual
 *    data-motion="reduced" toggle): no slide/drag, instant show.
 *  • Backdrop click + Escape close; background scroll locked while open.
 *
 * Compose the form/content as children; pass a sticky `footer` for the
 * confirm button so it stays reachable above the keyboard.
 * ═══════════════════════════════════════════════════════════════════════ */

function useReduced(): boolean {
  const prefers = useReducedMotion();
  const [manual, setManual] = useState(false);
  useEffect(() => {
    setManual(document.documentElement.getAttribute("data-motion") === "reduced");
  }, []);
  return !!prefers || manual;
}

export function BottomSheet({
  open,
  onClose,
  title,
  icon,
  children,
  footer,
  maxWidth = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: string;
}) {
  const reduce = useReduced();
  const dragControls = useDragControls();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Escape to close + lock background scroll while the sheet is up.
  useEffect(() => {
    if (!open) return;
    // `defaultPrevented` = an open dropdown/menu inside took this Escape.
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !e.defaultPrevented) onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="sheet-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-[90] bg-black/45 backdrop-blur-[2px]"
          />
          <motion.div
            key="sheet-panel"
            role="dialog"
            aria-modal="true"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 28, scale: 0.985 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.985 }}
            transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 360, damping: 32 }}
            drag={reduce ? false : "y"}
            dragListener={false}
            dragControls={dragControls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.55 }}
            onDragEnd={(_, info) => { if (info.offset.y > 110 || info.velocity.y > 700) onClose(); }}
            className={cn(
              "fixed z-[91] inset-x-0 bottom-0 origin-bottom",
              "sm:inset-0 sm:m-auto sm:h-fit sm:origin-center sm:px-4",
              maxWidth, "sm:mx-auto"
            )}
          >
            <div className="flex max-h-[90svh] flex-col overflow-hidden glass glass-menu elevated rounded-t-3xl sm:rounded-3xl pb-[env(safe-area-inset-bottom)]">
              {/* Grabber — drag to dismiss (mobile only). */}
              <div
                onPointerDown={(e) => !reduce && dragControls.start(e)}
                className="sm:hidden flex justify-center pt-2.5 pb-1 cursor-grab active:cursor-grabbing touch-none"
              >
                <span className="h-1 w-10 rounded-full bg-fg-subtle/40" />
              </div>

              <div className="flex items-center gap-2.5 px-5 pt-3 pb-3 sm:pt-5">
                {icon && <span className="text-accent">{icon}</span>}
                <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-full bg-bg-subtle/70 text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg active:scale-95"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5">
                {children}
              </div>

              {footer && (
                <div className="border-t border-border/60 bg-bg-elev/40 px-5 py-3.5 backdrop-blur-sm">
                  {footer}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}

/* A trigger + sheet bundled together — handy when a button opens the sheet and
 * you don't want to hand-wire open state. `render` receives a `close` fn. */
export function SheetButton({
  trigger,
  title,
  icon,
  footer,
  children,
  maxWidth,
}: {
  trigger: (open: () => void) => ReactNode;
  title: ReactNode;
  icon?: ReactNode;
  footer?: (close: () => void) => ReactNode;
  children: (close: () => void) => ReactNode;
  maxWidth?: string;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <>
      {trigger(() => setOpen(true))}
      <BottomSheet open={open} onClose={close} title={title} icon={icon} footer={footer?.(close)} maxWidth={maxWidth}>
        {children(close)}
      </BottomSheet>
    </>
  );
}

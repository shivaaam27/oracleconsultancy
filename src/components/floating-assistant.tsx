"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence, useDragControls, type PanInfo } from "framer-motion";
import { Sparkles, X, Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { AskCOS } from "./ask-cos";
import { derivePageContext } from "@/lib/page-context";

/** Open the assistant from anywhere (nav, /ask redirect). `full` opens full-screen. */
export function openAssistant(full = false) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("cos:assistant", { detail: { full } }));
}

function CosMark({ size = 18 }: { size?: number }) {
  return (
    <span className="inline-flex items-center justify-center rounded-lg bg-accent" style={{ width: size + 10, height: size + 10 }}>
      <Sparkles size={size} className="text-accent-fg" />
    </span>
  );
}

/**
 * App-wide COS assistant. A floating launcher opens a panel that reuses AskCOS.
 * Three sizes: desktop popover / mobile bottom-sheet (the "half" state) and a
 * full-screen page. Toggle with the expand icon; on mobile, drag the handle —
 * up to go full, down to dismiss. AskCOS stays mounted across sizes so the
 * conversation is preserved.
 */
export function FloatingAssistant() {
  const [open, setOpen] = useState(false);
  const [full, setFull] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const pathname = usePathname();
  const pageContext = derivePageContext(pathname);
  const dragControls = useDragControls();

  useEffect(() => { setOpen(false); setFull(false); }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { if (full) setFull(false); else setOpen(false); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, full]);

  useEffect(() => {
    const m = window.matchMedia("(max-width: 639px)");
    const u = () => setIsMobile(m.matches);
    u(); m.addEventListener("change", u);
    return () => m.removeEventListener("change", u);
  }, []);

  useEffect(() => {
    const h = (e: Event) => { setOpen(true); setFull(!!(e as CustomEvent).detail?.full); };
    window.addEventListener("cos:assistant", h);
    return () => window.removeEventListener("cos:assistant", h);
  }, []);

  function onDragEnd(_: unknown, info: PanInfo) {
    const { offset, velocity } = info;
    if (full) {
      if (offset.y > 130 || velocity.y > 700) setFull(false);
      return;
    }
    if (offset.y > 130 || velocity.y > 700) { setOpen(false); return; }
    if (offset.y < -90 || velocity.y < -700) { setFull(true); return; }
  }

  return (
    <>
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop — mobile half, and everywhere when full */}
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setOpen(false)}
              className={cn("fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]", full ? "block" : "sm:hidden")}
            />

            <motion.div
              key="panel"
              layout
              drag={isMobile ? "y" : false}
              dragControls={dragControls}
              dragListener={false}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0.35, bottom: 0.7 }}
              dragSnapToOrigin
              onDragEnd={onDragEnd}
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 16 }}
              transition={{ type: "spring", stiffness: 360, damping: 32, mass: 0.7 }}
              className={cn(
                "fixed z-[70] flex flex-col overflow-hidden glass glass-menu",
                full
                  ? "inset-0 rounded-none h-full"
                  : "inset-x-0 bottom-0 rounded-t-2xl max-h-[85svh] sm:inset-x-auto sm:right-5 sm:bottom-24 sm:w-[390px] sm:rounded-2xl sm:max-h-[min(720px,calc(100vh-8rem))]"
              )}
            >
              {/* Grab handle (mobile) — drag up to go full, down to dismiss/minimise */}
              <div
                className="sm:hidden pt-2 pb-1 flex justify-center cursor-grab active:cursor-grabbing touch-none shrink-0"
                onPointerDown={(e) => isMobile && dragControls.start(e)}
              >
                <span className="h-1 w-9 rounded-full bg-fg-subtle/40" />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-border shrink-0">
                <div className="flex items-center gap-2">
                  <CosMark size={14} />
                  <div className="flex flex-col leading-tight">
                    <span className="font-semibold text-sm tracking-tight">COS Assistant</span>
                    <span className="text-[10px] text-fg-muted">{pageContext.label}</span>
                  </div>
                </div>
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => setFull((f) => !f)}
                    aria-label={full ? "Minimise" : "Full screen"}
                    title={full ? "Minimise" : "Full screen"}
                    className="inline-flex items-center justify-center h-7 w-7 rounded-full text-fg-muted hover:text-fg hover:bg-bg-muted/60 transition-colors"
                  >
                    {full ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Close"
                    className="inline-flex items-center justify-center h-7 w-7 rounded-full text-fg-muted hover:text-fg hover:bg-bg-muted/60 transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              {/* Chat — AskCOS stays mounted; density follows the size */}
              <div className="flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
                <div className={cn(full && "mx-auto w-full max-w-3xl")}>
                  <AskCOS embedded minimal={!full} pageContext={pageContext} />
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Launcher */}
      <motion.button
        type="button"
        aria-label={open ? "Close COS assistant" : "Open COS assistant"}
        onClick={() => setOpen((o) => !o)}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.92 }}
        className={cn(
          "fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[60] inline-flex items-center justify-center h-14 w-14 rounded-full bg-accent text-accent-fg shadow-lg shadow-accent/25 ring-1 ring-black/5 hover:shadow-xl transition-shadow sm:right-5 sm:bottom-[calc(1rem+env(safe-area-inset-bottom))]",
          open && "hidden sm:inline-flex",
          full && "hidden"
        )}
      >
        <AnimatePresence mode="wait" initial={false}>
          {open ? (
            <motion.span key="close" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.15 }}><X size={24} /></motion.span>
          ) : (
            <motion.span key="open" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.15 }}><Sparkles size={24} /></motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </>
  );
}

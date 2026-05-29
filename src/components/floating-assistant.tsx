"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { AskCOS } from "./ask-cos";
import { derivePageContext } from "@/lib/page-context";

// The COS brand mark — accent rounded square with a sparkle, matching the nav brand.
function CosMark({ size = 18 }: { size?: number }) {
  return (
    <span className="inline-flex items-center justify-center rounded-lg bg-accent" style={{ width: size + 10, height: size + 10 }}>
      <Sparkles size={size} className="text-accent-fg" />
    </span>
  );
}

// Persistent, app-wide COS assistant: a floating launcher that pops open a minimal
// chat panel (chat box · voice · send) reusing the AskCOS widget.
export function FloatingAssistant() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const pageContext = derivePageContext(pathname);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <AnimatePresence>
        {open && (
          <>
            {/* Mobile backdrop */}
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-40 bg-black/25 backdrop-blur-[2px] sm:hidden"
            />

            {/* Panel — bottom sheet on mobile, popover anchored to the launcher on desktop */}
            <motion.div
              key="panel"
              initial={{ opacity: 0, scale: 0.85, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 12 }}
              transition={{ type: "spring", stiffness: 380, damping: 30, mass: 0.7 }}
              className="fixed z-[70] origin-bottom sm:origin-bottom-right inset-x-0 bottom-0 sm:inset-x-auto sm:right-5 sm:bottom-24 sm:w-[380px]"
            >
              <div className="flex max-h-[calc(100svh-1rem)] flex-col overflow-hidden glass rounded-t-2xl sm:max-h-[min(720px,calc(100vh-8rem))] sm:rounded-2xl rounded-b-none sm:rounded-b-2xl">
                {/* Header */}
                <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-border">
                  <div className="flex items-center gap-2">
                    <CosMark size={14} />
                    <div className="flex flex-col leading-tight">
                      <span className="font-semibold text-sm tracking-tight">COS Assistant</span>
                      <span className="text-[10px] text-fg-muted">{pageContext.label}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Close"
                    className="inline-flex items-center justify-center h-7 w-7 rounded-full text-fg-muted hover:text-fg hover:bg-bg-muted/60 transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>
                {/* Chat */}
                <div className="overflow-y-auto pb-[env(safe-area-inset-bottom)]">
                  <AskCOS embedded minimal pageContext={pageContext} />
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Launcher — COS mark, morphs to a close icon while open */}
      <motion.button
        type="button"
        aria-label={open ? "Close COS assistant" : "Open COS assistant"}
        onClick={() => setOpen(o => !o)}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.92 }}
        className={cn(
          "fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[60] inline-flex items-center justify-center h-14 w-14 rounded-full bg-accent text-accent-fg shadow-lg shadow-accent/25 ring-1 ring-black/5 hover:shadow-xl transition-shadow sm:right-5 sm:bottom-[calc(1rem+env(safe-area-inset-bottom))]",
          open && "hidden sm:inline-flex"
        )}
      >
        <AnimatePresence mode="wait" initial={false}>
          {open ? (
            <motion.span
              key="close"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <X size={24} />
            </motion.span>
          ) : (
            <motion.span
              key="open"
              initial={{ rotate: 90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: -90, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <Sparkles size={24} />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </>
  );
}

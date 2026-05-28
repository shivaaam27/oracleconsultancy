"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, X } from "lucide-react";
import { AskCOS } from "./ask-cos";

// Persistent, app-wide COS assistant. A floating circular button sits in the
// bottom-right corner on every page; clicking it opens a chat panel that reuses
// the existing AskCOS widget (ask / command / digest + voice).
export function FloatingAssistant() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the panel on route change so it never lingers awkwardly mid-navigation.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Esc closes the panel.
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
      {/* Launcher button — bottom-right, clear of the centre nav pill */}
      <motion.button
        type="button"
        aria-label={open ? "Close COS assistant" : "Open COS assistant"}
        onClick={() => setOpen(o => !o)}
        initial={false}
        animate={{ rotate: open ? 90 : 0 }}
        whileTap={{ scale: 0.9 }}
        className="fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-50 inline-flex items-center justify-center h-14 w-14 rounded-full bg-accent text-accent-fg shadow-lg ring-1 ring-black/10 hover:opacity-90 transition-opacity"
      >
        {open ? <X size={22} /> : <Bot size={24} />}
      </motion.button>

      <AnimatePresence>
        {open && (
          <>
            {/* Mobile backdrop — tap to dismiss */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm sm:hidden"
            />

            {/* Panel: bottom sheet on mobile, floating card on desktop */}
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 320, damping: 30 }}
              className="fixed z-50 inset-x-0 bottom-0 sm:inset-x-auto sm:right-4 sm:bottom-[calc(5.5rem+env(safe-area-inset-bottom))] sm:w-[420px] max-h-[80vh] flex flex-col"
            >
              <div className="card overflow-hidden shadow-2xl ring-1 ring-border rounded-b-none sm:rounded-2xl flex flex-col">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-bg-subtle">
                  <div className="flex items-center gap-2">
                    <Bot size={16} className="text-accent" />
                    <span className="font-semibold text-sm">COS Assistant</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Close"
                    className="inline-flex items-center justify-center h-7 w-7 rounded-full text-fg-muted hover:text-fg hover:bg-bg-muted/60 transition-colors"
                  >
                    <X size={15} />
                  </button>
                </div>
                <div className="overflow-y-auto">
                  <AskCOS embedded />
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

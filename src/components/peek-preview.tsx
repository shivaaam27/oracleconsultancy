"use client";

import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/cn";
import { spring } from "@/lib/motion";
import type { ReactNode } from "react";

export type PeekAction = {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  tone?: "default" | "danger" | "accent";
};

/**
 * iOS "peek & pop" preview. Opened by a long-press; shows a floating glass
 * preview card over a dimmed/lifted background, with quick actions beneath.
 * Tap the card → open fully; tap the backdrop → collapse.
 */
export function PeekPreview({
  open, onClose, onOpen, title, subtitle, body, actions = [], editor,
}: {
  open: boolean;
  onClose: () => void;
  onOpen?: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  body?: ReactNode;
  actions?: PeekAction[];
  /** Optional inline quick-edit panel shown between the preview and the actions. */
  editor?: ReactNode;
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="fixed inset-0 z-[85] bg-black/45 backdrop-blur-[3px]"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.86, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 8 }}
            transition={spring}
            className="fixed z-[86] inset-x-4 top-1/2 -translate-y-1/2 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-[420px] mx-auto flex flex-col gap-2 select-none"
          >
            {/* Preview card — tap to open */}
            <button
              type="button"
              onClick={() => { onClose(); onOpen?.(); }}
              className="glass rounded-2xl p-4 text-left w-full active:scale-[0.99] transition-transform"
            >
              <div className="text-[15px] font-semibold leading-snug">{title}</div>
              {subtitle && <div className="text-xs text-fg-muted mt-0.5">{subtitle}</div>}
              {body && <div className="text-sm text-fg-muted mt-2 leading-relaxed">{body}</div>}
            </button>

            {/* Inline quick-edit panel */}
            {editor && (
              <div className="glass glass-menu rounded-2xl p-3">{editor}</div>
            )}

            {/* Quick actions */}
            {actions.length > 0 && (
              <div className="glass glass-menu rounded-2xl overflow-hidden divide-y divide-border/60">
                {actions.map((a) => (
                  <button
                    key={a.label}
                    type="button"
                    onClick={() => { onClose(); a.onClick(); }}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-3 text-sm text-left active:bg-bg-muted/60 transition-colors",
                      a.tone === "danger" ? "text-danger" : a.tone === "accent" ? "text-accent font-medium" : "text-fg"
                    )}
                  >
                    {a.icon}
                    {a.label}
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

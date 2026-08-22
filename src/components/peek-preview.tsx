"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquarePlus, ChevronDown, Clock3 } from "lucide-react";
import { cn } from "@/lib/cn";
import { spring } from "@/lib/motion";
import type { ReactNode } from "react";

export type PeekAction = {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  tone?: "default" | "danger" | "accent";
};

/** Initials from a display name (e.g. "Aisha Khan" → "AK", "You" → "Y"). */
function peekInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Compact relative time for the peek meta line ("9h ago", "3d ago"). */
function peekAgo(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  const d = Math.round(s / 86400);
  if (d < 7) return `${d}d ago`;
  if (d < 30) return `${Math.round(d / 7)}w ago`;
  return `${Math.round(d / 30)}mo ago`;
}

/** Full local date+time for the meta-line tooltip. */
function peekExact(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

/**
 * iOS "peek & pop" preview. Opened by a long-press; shows a floating glass
 * preview card over a dimmed background. The info card surfaces the best
 * read-only context; a quick-update editor expands inline behind an icon, and
 * the actions sit in a single minimal row.
 */
export function PeekPreview({
  open, onClose, onOpen, title, subtitle, body, pills, quickUpdate,
  creator, when, whenISO,
  actions = [], actionsLayout = "list",
}: {
  open: boolean;
  onClose: () => void;
  onOpen?: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  body?: ReactNode;
  /** Status/priority badges shown under the subtitle. */
  pills?: ReactNode;
  /** Optional quick-update editor revealed inline behind the update icon. */
  quickUpdate?: ReactNode;
  /** Who last touched / authored the latest activity (shown as an avatar + name). */
  creator?: string | null;
  /** A ready-made relative-time label (e.g. "9h ago"). Ignored if `whenISO` is set. */
  when?: string | null;
  /** ISO timestamp — rendered as a relative time with an exact-time tooltip. */
  whenISO?: string | null;
  actions?: PeekAction[];
  actionsLayout?: "list" | "row";
}) {
  const [showUpdate, setShowUpdate] = useState(false);

  // Close on Escape and lock the page behind from scrolling while open.
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
    <AnimatePresence onExitComplete={() => setShowUpdate(false)}>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="fixed inset-0 z-[85] bg-black/45 backdrop-blur-[3px]"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, scale: 0.9, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 8 }}
            transition={spring}
            className="fixed z-[86] inset-x-4 top-1/2 -translate-y-1/2 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-[420px] mx-auto flex flex-col gap-2 select-none"
          >
            {/* Info card — tappable region is a div (not a button) so interactive
                pills/body inside don't create invalid nested buttons. */}
            <div className="glass glass-menu elevated rounded-2xl overflow-hidden">
              <div className="p-4">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => { onClose(); onOpen?.(); }}
                  className="block text-left w-full cursor-pointer"
                >
                  {subtitle && <div className="text-xs text-fg-muted mb-1.5">{subtitle}</div>}
                  <div className="text-[15px] font-semibold leading-snug">{title}</div>
                </div>
                {(creator || when || whenISO) && (
                  <div className="flex items-center gap-1.5 mt-2 text-xs text-fg-muted">
                    {creator && (
                      <>
                        <span
                          className="inline-flex items-center justify-center h-[18px] w-[18px] rounded-full bg-accent-soft text-accent text-[9px] font-semibold leading-none shrink-0"
                          aria-hidden
                        >
                          {peekInitials(creator)}
                        </span>
                        <span className="font-medium text-fg">{creator}</span>
                      </>
                    )}
                    {(when || whenISO) && (
                      <span
                        className="inline-flex items-center gap-1 text-fg-subtle"
                        title={whenISO ? peekExact(whenISO) : undefined}
                      >
                        {creator && <span aria-hidden>·</span>}
                        <Clock3 size={11} className="opacity-70" />
                        {whenISO ? peekAgo(whenISO) : when}
                      </span>
                    )}
                  </div>
                )}
                {pills && <div className="flex flex-wrap gap-1.5 mt-2">{pills}</div>}
                {body && (
                  <div className="text-sm mt-2.5 leading-relaxed">{body}</div>
                )}
              </div>

              {/* Collapsible quick update */}
              {quickUpdate && (
                <div className="border-t border-border/60">
                  <button
                    type="button"
                    onClick={() => setShowUpdate((s) => !s)}
                    aria-expanded={showUpdate}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-fg-muted hover:text-fg transition-colors"
                  >
                    <MessageSquarePlus size={13} className="text-accent" />
                    Quick update
                    <ChevronDown size={14} className={cn("ml-auto transition-transform", showUpdate && "rotate-180")} />
                  </button>
                  <AnimatePresence initial={false}>
                    {showUpdate && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 pb-4">{quickUpdate}</div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>

            {/* Actions */}
            {actions.length > 0 && (
              actionsLayout === "row" ? (
                <div className="glass glass-menu elevated rounded-2xl p-1.5 flex items-stretch gap-1">
                  {actions.map((a) => (
                    <button
                      key={a.label}
                      type="button"
                      onClick={() => { onClose(); a.onClick(); }}
                      className={cn(
                        "flex-1 flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl text-xs font-medium active:scale-95 transition-all",
                        a.tone === "danger" ? "text-danger hover:bg-danger-soft/60"
                          : a.tone === "accent" ? "text-accent bg-accent-soft/50 hover:bg-accent-soft/80"
                          : "text-fg-muted hover:bg-bg-muted/60 hover:text-fg"
                      )}
                    >
                      <span className="text-[17px] leading-none">{a.icon}</span>
                      {a.label}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="glass glass-menu elevated rounded-2xl overflow-hidden divide-y divide-border/60">
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
              )
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

"use client";
/* StudioSheet — the one pop-up a Studio page opens for a form (edit a recurring
 * rule, write an announcement, add an event). It is the same card as "+ New"
 * and the Go-to panel: it rises from the footer, wears the theme-following
 * `.st-sheet` colours with the dotted texture, and closes on Esc or a click
 * outside. BottomSheet stays for Desk pages and the portal.
 *
 * Desk controls inside it (FluidSelect, Combobox, the date picker) follow the
 * sheet's light or dark because `.st-sheet` re-points Desk's tokens. */
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

export function StudioSheet({
  open, onClose, title, icon, children, footer, width = 560,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    // `defaultPrevented` = an open menu inside the sheet took this Escape.
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !e.defaultPrevented) onClose(); };
    // On window so a menu inside (listening on document) claims Escape first.
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!mounted || !open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[55]" role="dialog" aria-modal="true">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default bg-[rgba(14,15,16,0.35)]" />
      <div
        style={{ width: `min(${width}px, calc(100vw - 24px))` }}
        className={cn(
          "studio st-sheet st-sheet-dots st-pop absolute bottom-[calc(64px+env(safe-area-inset-bottom)+8px)] left-1/2 flex max-h-[calc(100dvh-100px)] -translate-x-1/2 flex-col overflow-hidden rounded-3xl",
          "shadow-[0_30px_80px_rgba(0,0,0,0.35)]",
        )}
      >
        <div className="flex items-center gap-2.5 px-5 pb-2 pt-4">
          {icon && <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[var(--sh-hover)] text-[var(--sh-sub)]">{icon}</span>}
          <div className="min-w-0 flex-1 truncate text-[17px] font-medium tracking-[-0.01em]">{title}</div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-[var(--sh-chip-line)] text-[var(--sh-sub)] hover:text-[var(--sh-fg)]"><X size={13} /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">{children}</div>
        {footer && <div className="border-t border-[var(--sh-line)] px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

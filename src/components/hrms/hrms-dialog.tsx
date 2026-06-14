"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * THE canonical centred-form dialog for the whole app (HRMS forms, register
 * rows, anything that isn't the task drawer). One shell so every pop-up shares
 * a single design language:
 *  - mobile: a bottom-anchored sheet with a grab handle (rounded-t-3xl);
 *  - desktop: a centred glass card (rounded-3xl);
 *  - Radix gives Escape-to-close, body-scroll-lock, focus trap and
 *    role="dialog" / aria-modal for free — keep using it;
 *  - a consistent dimmed, blurred backdrop and the standard glass/elevation
 *    tokens (no raw shadow-2xl).
 *
 * Backward compatible: the original `open` / `onOpenChange` / `title` /
 * `children` props are unchanged. Everything else is optional and additive.
 */

const widthClass = {
  sm: "sm:w-[min(420px,calc(100vw-2rem))]",
  md: "sm:w-[min(520px,calc(100vw-2rem))]",
  lg: "sm:w-[min(680px,calc(100vw-2rem))]",
} as const;

export function HrmsDialog({
  open,
  onOpenChange,
  onClose,
  title,
  sub,
  width = "md",
  footer,
  children,
}: {
  open: boolean;
  /** Radix-style controlled handler (receives the next open state). */
  onOpenChange?: (o: boolean) => void;
  /** Convenience close handler — fires when the dialog requests to close. */
  onClose?: () => void;
  title?: React.ReactNode;
  /** Optional one-line subtitle under the title. */
  sub?: React.ReactNode;
  /** Card width on desktop: a preset ('sm' | 'md' | 'lg') or a px number. */
  width?: "sm" | "md" | "lg" | number;
  /** Optional sticky footer slot (e.g. Cancel / Save actions). */
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const handleOpenChange = (next: boolean) => {
    onOpenChange?.(next);
    if (!next) onClose?.();
  };

  const isPreset = typeof width === "string";

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-[95] bg-black/45 backdrop-blur-[3px]
            data-[state=open]:animate-in data-[state=open]:fade-in-0
            data-[state=closed]:animate-out data-[state=closed]:fade-out-0"
        />
        <Dialog.Content
          aria-describedby={undefined}
          style={isPreset ? undefined : { ["--hrms-w" as string]: `${width}px` }}
          className={cn(
            // Mobile: bottom sheet. Desktop: centred card.
            "fixed z-[96] inset-x-0 bottom-0 sm:inset-0 sm:m-auto sm:h-fit",
            "flex flex-col max-h-[92svh] sm:max-h-[88vh] outline-none",
            isPreset
              ? widthClass[width]
              : "sm:w-[min(var(--hrms-w),calc(100vw-2rem))]",
            // Entrance/exit: slide from bottom on mobile, zoom on desktop.
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0",
            "data-[state=open]:slide-in-from-bottom-4 data-[state=closed]:slide-out-to-bottom-4",
            "sm:data-[state=open]:slide-in-from-bottom-0 sm:data-[state=closed]:slide-out-to-bottom-0",
            "sm:data-[state=open]:zoom-in-95 sm:data-[state=closed]:zoom-out-95"
          )}
        >
          <div className="glass glass-menu elevated rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col flex-1 min-h-0">
            {/* Grab handle (mobile only) — visual drag affordance. */}
            <div className="sm:hidden pt-2.5 pb-1.5 flex justify-center shrink-0">
              <span className="h-1.5 w-10 rounded-full bg-fg-subtle/40" />
            </div>

            {/* Header */}
            {(title || sub) && (
              <div className="flex items-center justify-between gap-3 px-5 py-3 sm:py-3.5 border-b border-border/60 shrink-0">
                <div className="min-w-0">
                  {title && (
                    <Dialog.Title className="text-sm font-semibold tracking-tight truncate">
                      {title}
                    </Dialog.Title>
                  )}
                  {sub && (
                    <p className="text-xs text-fg-muted mt-0.5 truncate">{sub}</p>
                  )}
                </div>
                <Dialog.Close asChild>
                  <button
                    type="button"
                    aria-label="Close"
                    className="h-8 w-8 shrink-0 inline-flex items-center justify-center rounded-full text-fg-muted hover:text-fg hover:bg-bg-muted transition-colors"
                  >
                    <X size={16} />
                  </button>
                </Dialog.Close>
              </div>
            )}
            {/* When there's no title, still offer a close affordance. */}
            {!title && !sub && (
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Close"
                  className="absolute right-3 top-3 z-10 h-8 w-8 inline-flex items-center justify-center rounded-full text-fg-muted hover:text-fg hover:bg-bg-muted transition-colors"
                >
                  <X size={16} />
                </button>
              </Dialog.Close>
            )}

            {/* Body — scrolls; children own their form layout. */}
            <div className="flex-1 min-h-0 overflow-y-auto p-5">{children}</div>

            {/* Optional sticky footer. */}
            {footer && (
              <div className="shrink-0 border-t border-border/60 px-5 py-3 flex items-center justify-end gap-2">
                {footer}
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

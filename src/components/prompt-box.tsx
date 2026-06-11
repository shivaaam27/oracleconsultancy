"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  disabled?: boolean;
  /** Rendered at the bottom-right, inside the box (mic, send, parse…). */
  actions?: ReactNode;
  /** Optional bottom-left node (hint, status). */
  hint?: ReactNode;
  minHeight?: number;
  maxHeight?: number;
  autoFocus?: boolean;
  /** Enter submits (Shift+Enter newline). When false, only ⌘/Ctrl+Enter submits. */
  submitOnEnter?: boolean;
  className?: string;
};

export function PromptBox({
  value,
  onChange,
  onSubmit,
  placeholder,
  disabled = false,
  actions,
  hint,
  minHeight = 0,
  maxHeight = 200,
  autoFocus = false,
  submitOnEnter = true,
  className,
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Auto-grow between minHeight and maxHeight, then scroll.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(minHeight, Math.min(el.scrollHeight, maxHeight))}px`;
  }, [value, minHeight, maxHeight]);

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-bg-elev shadow-sm transition-all",
        "focus-within:border-accent/50 focus-within:ring-2 focus-within:ring-accent/30",
        disabled && "opacity-60",
        className
      )}
    >
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
          if (submitOnEnter && !e.shiftKey) {
            e.preventDefault();
            if (!disabled) onSubmit();
          } else if (!submitOnEnter && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            if (!disabled) onSubmit();
          }
        }}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        style={minHeight ? { minHeight } : undefined}
        autoFocus={autoFocus}
        className="w-full resize-none !bg-transparent !border-0 !shadow-none px-4 pt-3 pb-1 text-sm leading-relaxed outline-none focus:!shadow-none focus:!ring-0 placeholder:text-fg-muted disabled:cursor-not-allowed"
      />
      <div className="flex items-center justify-between gap-2 px-2.5 pb-2 pt-0.5">
        <div className="min-w-0 text-xs text-fg-subtle truncate">{hint}</div>
        <div className="flex items-center gap-1.5 shrink-0">{actions}</div>
      </div>
    </div>
  );
}

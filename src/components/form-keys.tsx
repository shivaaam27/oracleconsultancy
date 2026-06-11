"use client";

import type { ComponentProps, KeyboardEvent } from "react";
import { cn } from "@/lib/cn";

/**
 * Universal "Enter submits, Shift/Alt+Enter for a new line" behaviour for
 * textareas inside data-entry forms. Attach as `onKeyDown` to a textarea (or
 * use `<SubmitTextarea/>` from server components, which can't pass handlers).
 *
 * - Enter (no modifier)        → submit the field's form (`requestSubmit`).
 * - Shift+Enter OR Alt+Enter   → default behaviour (insert a new line).
 * - IME composition is respected (won't submit mid-composition — important for
 *   Swahili/Hindi/Gujarati input).
 *
 * Do NOT use on genuine long-form writing areas (letter body, meeting notes,
 * the AskCOS chat) where Enter should always be a new line.
 */
export function submitOnEnterKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
  if (
    e.key === "Enter" &&
    !e.shiftKey &&
    !e.altKey &&
    !e.ctrlKey &&
    !e.metaKey &&
    !(e.nativeEvent as unknown as { isComposing?: boolean }).isComposing
  ) {
    e.preventDefault();
    e.currentTarget.form?.requestSubmit();
  }
}

/**
 * A textarea pre-wired with the submit-on-Enter behaviour. Use this from server
 * components (which can't attach the `onKeyDown` handler themselves). Mirrors the
 * shared `Textarea` styling.
 */
export function SubmitTextarea({ className, onKeyDown, ...p }: ComponentProps<"textarea">) {
  return (
    <textarea
      {...p}
      onKeyDown={(e) => {
        submitOnEnterKeyDown(e);
        onKeyDown?.(e);
      }}
      className={cn("w-full px-3 py-2 text-sm rounded-lg", className)}
    />
  );
}

/** A subtle inline hint describing the Enter / new-line keys, for form footers. */
export function EnterHint({ verb = "save", className }: { verb?: string; className?: string }) {
  const kbd = "rounded border border-border bg-bg-subtle px-1 py-0.5 text-[10px] font-medium text-fg-muted";
  return (
    <p className={cn("text-[11px] text-fg-subtle", className)}>
      <kbd className={kbd}>Enter</kbd> to {verb} · <kbd className={kbd}>Shift</kbd>/<kbd className={kbd}>Alt</kbd>+<kbd className={kbd}>Enter</kbd> for a new line
    </p>
  );
}

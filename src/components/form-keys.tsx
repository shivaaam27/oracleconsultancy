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

/** Inline per-field validation message (danger tone). Renders nothing when empty. */
export function FieldError({ message, className }: { message?: string | null; className?: string }) {
  if (!message) return null;
  return <p role="alert" className={cn("mt-1 text-xs text-danger", className)}>{message}</p>;
}

/** Classes to mark an input visually invalid (red ring + border). */
export const invalidFieldClass = "ring-1 ring-danger/60 border-danger/60";

/** A subtle inline hint describing the Enter / new-line keys, for form footers. */
/**
 * "Enter to save · Shift/Alt+Enter for a new line".
 *
 * Hidden on a phone. There is no Enter key to press, so it is advice nobody can
 * take — and it is not free: at 375px it wrapped to THREE lines of keycaps
 * beside the Create button, which then had to break "Create task" across two
 * lines to fit next to it.
 */
export function EnterHint({ verb = "save", className }: { verb?: string; className?: string }) {
  const kbd = "rounded border border-border bg-bg-subtle px-1 py-0.5 text-xs font-medium text-fg-muted";
  return (
    <p className={cn("hidden text-xs text-fg-subtle sm:block", className)}>
      <kbd className={kbd}>Enter</kbd> to {verb} · <kbd className={kbd}>Shift</kbd>/<kbd className={kbd}>Alt</kbd>+<kbd className={kbd}>Enter</kbd> for a new line
    </p>
  );
}

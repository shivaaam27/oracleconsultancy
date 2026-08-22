"use client";

import { Sparkles, Mic } from "lucide-react";
import { useCommandPalette } from "@/components/command-palette";

/** The universal command bar — the fastest way to anywhere. Opens the ⌘K palette
 *  (search · ask ORI · do). Voice lives inside the palette. */
export function CommandBar() {
  const { open } = useCommandPalette();
  return (
    <button
      type="button"
      onClick={open}
      aria-label="Ask ORI, find anything, or say what you need"
      className="flex w-full items-center gap-3 rounded-2xl bg-bg-subtle/60 px-4 py-3 text-left ring-1 ring-border/60 backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:ring-accent/30"
    >
      <Sparkles size={18} className="shrink-0 text-accent" />
      <span className="min-w-0 flex-1 truncate text-sm text-fg-subtle">Ask ORI, find anything, or say what you need…</span>
      <Mic size={17} className="shrink-0 text-fg-muted" />
      <span className="shrink-0 border-l border-border/60 pl-2.5 text-xs font-medium text-fg-subtle">⌘K</span>
    </button>
  );
}

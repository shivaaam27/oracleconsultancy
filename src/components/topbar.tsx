"use client";
import { Search } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import { useCommandPalette } from "./command-palette";

export function Topbar() {
  const { open } = useCommandPalette();
  return (
    <div className="h-14 border-b border-border bg-bg-elev/80 backdrop-blur-md sticky top-0 z-30 flex items-center px-6 gap-4">
      <button
        onClick={open}
        className="flex-1 max-w-xl flex items-center gap-2.5 px-3 py-1.5 text-sm rounded-md bg-bg-muted/60 hover:bg-bg-muted border border-border text-fg-muted hover:text-fg transition-colors"
      >
        <Search size={14} />
        <span>Search tasks, people, or jump to…</span>
        <kbd className="ml-auto text-[10px] font-mono bg-bg-elev border border-border px-1.5 py-0.5 rounded">⌘K</kbd>
      </button>
      <div className="flex-1" />
      <ThemeToggle />
    </div>
  );
}

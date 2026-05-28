"use client";

import { useState } from "react";
import { Bot, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import { QuickCapture } from "./quick-capture";
import { AskCOS } from "./ask-cos";

type Mode = "ask" | "capture";
type Props = { companies: { id: number; name: string }[] };

export function CosBar({ companies }: Props) {
  const [mode, setMode] = useState<Mode>("ask");

  return (
    <section className="space-y-2">
      {/* Section identity */}
      <div className="flex items-center gap-2 px-1">
        <Bot size={15} className="text-accent" />
        <h2 className="text-sm font-semibold">Ask COS</h2>
        <span className="text-xs text-fg-muted">— your command-centre assistant</span>
      </div>

      <div className="card overflow-hidden shadow-md ring-1 ring-border">
        {/* Toggle header */}
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-bg-subtle">
        <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-bg-muted/60 border border-border">
          <button
            onClick={() => setMode("ask")}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1 text-sm rounded-md transition-colors",
              mode === "ask"
                ? "bg-bg-elev text-fg font-medium shadow-sm"
                : "text-fg-muted hover:text-fg"
            )}
          >
            <Bot size={14} /> Ask
          </button>
          <button
            onClick={() => setMode("capture")}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1 text-sm rounded-md transition-colors",
              mode === "capture"
                ? "bg-bg-elev text-fg font-medium shadow-sm"
                : "text-fg-muted hover:text-fg"
            )}
          >
            <Sparkles size={14} /> Capture
          </button>
        </div>
        <span className="text-xs text-fg-muted hidden sm:block">
          {mode === "ask"
            ? "Ask a question or run a command"
            : "Type rough notes — the system drafts the task"}
        </span>
      </div>

        {/* Body — only the active mode is mounted */}
        {mode === "ask" ? (
          <AskCOS embedded />
        ) : (
          <QuickCapture companies={companies} embedded />
        )}
      </div>
    </section>
  );
}

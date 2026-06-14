"use client";

import { useState } from "react";
import Link from "next/link";
import { ShieldAlert, ChevronDown, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  SEVERITY_LABEL,
  SEVERITY_TONE,
  type Finding,
} from "@/lib/safety-net-shared";

const TONE_DOT: Record<"danger" | "warn" | "muted", string> = {
  danger: "bg-danger",
  warn: "bg-warn",
  muted: "bg-fg-subtle",
};
const TONE_CHIP: Record<"danger" | "warn" | "muted", string> = {
  danger: "bg-danger-soft text-danger",
  warn: "bg-warn-soft text-warn",
  muted: "bg-bg-muted text-fg-muted",
};

/**
 * "Safety net" — data-quality findings (things MISSING or INCONSISTENT, not
 * normal expiry alerts). Calm by default: collapsed to a one-line summary, with
 * an all-clear state when there's nothing to fix.
 */
export function SafetyNetPanel({ findings }: { findings: Finding[] }) {
  const [open, setOpen] = useState(false);
  const high = findings.filter((f) => f.severity === "high").length;
  const medium = findings.filter((f) => f.severity === "medium").length;
  const low = findings.filter((f) => f.severity === "low").length;

  if (findings.length === 0) {
    return (
      <div className="glass rounded-2xl p-4 flex items-center gap-2 text-sm text-fg-muted">
        <CheckCircle2 size={16} className="text-success" />
        Safety net: no data-quality issues found.
      </div>
    );
  }

  const summary = [high && `${high} high`, medium && `${medium} medium`, low && `${low} low`]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="glass elevated rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-bg-muted/40 transition-colors"
      >
        <ShieldAlert size={16} className={high ? "text-danger" : "text-warn"} />
        <span className="text-sm font-semibold">Safety net</span>
        <span className="text-xs text-fg-muted">{summary}</span>
        <ChevronDown size={15} className={cn("ml-auto text-fg-subtle transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <ul className="divide-y divide-border/50 border-t border-border/50">
          {findings.map((f) => {
            const tone = SEVERITY_TONE[f.severity];
            const row = (
              <div className="flex items-start gap-2.5 px-4 py-2.5">
                <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", TONE_DOT[tone])} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium text-fg">{f.title}</span>
                  <span className="block text-[11px] text-fg-muted">{f.detail}</span>
                </span>
                <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium", TONE_CHIP[tone])}>
                  {SEVERITY_LABEL[f.severity]}
                </span>
              </div>
            );
            return (
              <li key={f.id} className="hover:bg-bg-muted/30 transition-colors">
                {f.href ? <Link href={f.href}>{row}</Link> : row}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

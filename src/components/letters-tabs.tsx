"use client";

import { useState, type ReactNode } from "react";
import { Mail, Building2 } from "lucide-react";
import { cn } from "@/lib/cn";

/** Segmented toggle for the combined Letters page: the letters themselves,
 *  and the per-company letterhead branding they are printed on. */
export function LettersTabs({
  lettersSlot,
  letterheadsSlot,
  letterCount,
  letterheadReadyCount,
  letterheadTotal,
  initial = "letters",
}: {
  lettersSlot: ReactNode;
  letterheadsSlot: ReactNode;
  letterCount: number;
  letterheadReadyCount: number;
  letterheadTotal: number;
  initial?: "letters" | "letterheads";
}) {
  const [tab, setTab] = useState<"letters" | "letterheads">(initial);

  const tabs = [
    { key: "letters" as const, label: "Letters", icon: Mail, count: `${letterCount}` },
    { key: "letterheads" as const, label: "Letterheads", icon: Building2, count: `${letterheadReadyCount}/${letterheadTotal}` },
  ];

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-xl bg-bg-subtle p-1 ring-1 ring-border/60">
        {tabs.map(({ key, label, icon: Icon, count }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              tab === key ? "bg-bg-elev text-fg shadow-sm" : "text-fg-muted hover:text-fg"
            )}
          >
            <Icon size={14} />
            {label}
            <span className={cn("text-[11px] tabular", tab === key ? "text-fg-muted" : "text-fg-subtle")}>{count}</span>
          </button>
        ))}
      </div>
      {tab === "letters" ? lettersSlot : letterheadsSlot}
    </div>
  );
}

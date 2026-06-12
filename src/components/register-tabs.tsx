"use client";

import { useState, type ReactNode } from "react";
import { Laptop, Building, Wrench } from "lucide-react";
import { cn } from "@/lib/cn";

type TabKey = "assets" | "tools" | "vendors";

/** Segmented toggle for the combined Asset, Tools & Vendor Register. */
export function RegisterTabs({
  assetsSlot,
  toolsSlot,
  vendorsSlot,
  assetCount,
  toolCount,
  vendorCount,
  initial = "assets",
}: {
  assetsSlot: ReactNode;
  toolsSlot: ReactNode;
  vendorsSlot: ReactNode;
  assetCount: number;
  toolCount: number;
  vendorCount: number;
  initial?: TabKey;
}) {
  const [tab, setTab] = useState<TabKey>(initial);

  const tabs = [
    { key: "assets" as const, label: "Assets", icon: Laptop, count: assetCount },
    { key: "tools" as const, label: "Tools", icon: Wrench, count: toolCount },
    { key: "vendors" as const, label: "Vendors", icon: Building, count: vendorCount },
  ];

  return (
    <div className="space-y-4">
      <div className="flex rounded-xl bg-bg-subtle p-1 ring-1 ring-border/60 overflow-x-auto">
        {tabs.map(({ key, label, icon: Icon, count }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              "inline-flex flex-1 sm:flex-none items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap",
              tab === key ? "bg-bg-elev text-fg shadow-sm" : "text-fg-muted hover:text-fg"
            )}
          >
            <Icon size={14} /> {label}
            <span className={cn(
              "inline-flex items-center justify-center min-w-[20px] h-[18px] px-1 rounded-full text-[11px] tabular",
              tab === key ? "bg-accent-soft/70 text-accent" : "bg-bg-muted text-fg-muted"
            )}>{count}</span>
          </button>
        ))}
      </div>
      <div className={tab === "assets" ? "" : "hidden"}>{assetsSlot}</div>
      <div className={tab === "tools" ? "" : "hidden"}>{toolsSlot}</div>
      <div className={tab === "vendors" ? "" : "hidden"}>{vendorsSlot}</div>
    </div>
  );
}

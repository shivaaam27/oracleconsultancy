"use client";

import { useState, type ReactNode } from "react";
import { Laptop, Building } from "lucide-react";
import { cn } from "@/lib/cn";

/** Segmented toggle for the combined Asset & Vendor Register. */
export function RegisterTabs({
  assetsSlot,
  vendorsSlot,
  assetCount,
  vendorCount,
  initial = "assets",
}: {
  assetsSlot: ReactNode;
  vendorsSlot: ReactNode;
  assetCount: number;
  vendorCount: number;
  initial?: "assets" | "vendors";
}) {
  const [tab, setTab] = useState<"assets" | "vendors">(initial);

  const tabs = [
    { key: "assets" as const, label: "Assets", icon: Laptop, count: assetCount },
    { key: "vendors" as const, label: "Vendors", icon: Building, count: vendorCount },
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
            <Icon size={14} /> {label}
            <span className="inline-flex items-center justify-center min-w-[20px] h-[18px] px-1 rounded-full bg-bg-muted text-[11px] tabular text-fg-muted">{count}</span>
          </button>
        ))}
      </div>
      <div className={tab === "assets" ? "" : "hidden"}>{assetsSlot}</div>
      <div className={tab === "vendors" ? "" : "hidden"}>{vendorsSlot}</div>
    </div>
  );
}

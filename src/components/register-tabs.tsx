"use client";

import { type ReactNode } from "react";
import { Laptop, Building, Wrench } from "lucide-react";
import { cn } from "@/lib/cn";
import { CountPill } from "@/components/ui";
import { useUrlFilters } from "@/lib/use-url-filters";

type TabKey = "assets" | "tools" | "vendors";

/** Segmented toggle for the combined Asset, Tools & Vendor Register.
 *
 *  Which tab you are on lives in the URL (`?view=`), not component state — so a
 *  saved view can record it, the tab survives a refresh, and the address bar is
 *  always an honest description of what you are looking at. */
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
  const { values, set } = useUrlFilters({ view: initial as string });
  const tab = (["assets", "tools", "vendors"].includes(values.view) ? values.view : initial) as TabKey;

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
            onClick={() => set({ view: key })}
            className={cn(
              "inline-flex flex-1 sm:flex-none items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap",
              tab === key ? "bg-bg-elev text-fg shadow-sm" : "text-fg-muted hover:text-fg"
            )}
          >
            <Icon size={14} /> {label}
            <CountPill count={count} tone={tab === key ? "accent" : "default"} />
          </button>
        ))}
      </div>
      <div className={tab === "assets" ? "" : "hidden"}>{assetsSlot}</div>
      <div className={tab === "tools" ? "" : "hidden"}>{toolsSlot}</div>
      <div className={tab === "vendors" ? "" : "hidden"}>{vendorsSlot}</div>
    </div>
  );
}

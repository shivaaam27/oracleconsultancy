"use client";

import Link from "next/link";
import { LayoutDashboard, Building2, CheckSquare } from "lucide-react";
import { cn } from "@/lib/cn";

export type HubTab = "overview" | "companies" | "tasks";

const TABS: { id: HubTab; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { id: "overview",   label: "Overview",   icon: LayoutDashboard },
  { id: "companies",  label: "Companies",  icon: Building2 },
  { id: "tasks",      label: "Tasks",      icon: CheckSquare },
];

export function HubTabs({ current }: { current: HubTab }) {
  return (
    <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-bg-muted/60 border border-border mb-5">
      {TABS.map(({ id, label, icon: Icon }) => {
        const active = id === current;
        const href = id === "overview" ? "/" : `/?tab=${id}`;
        return (
          <Link
            key={id}
            href={href}
            className={cn(
              "inline-flex items-center gap-1.5 px-3.5 py-1.5 text-sm rounded-lg transition-colors",
              active
                ? "bg-bg-elev text-fg font-medium shadow-sm"
                : "text-fg-muted hover:text-fg hover:bg-bg-elev/50"
            )}
          >
            <Icon size={14} />
            {label}
          </Link>
        );
      })}
    </div>
  );
}

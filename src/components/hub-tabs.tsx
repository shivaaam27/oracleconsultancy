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
    <div className="flex items-center gap-1 border-b border-border mb-6">
      {TABS.map(({ id, label, icon: Icon }) => {
        const active = id === current;
        const href = id === "overview" ? "/" : `/?tab=${id}`;
        return (
          <Link
            key={id}
            href={href}
            className={cn(
              "inline-flex items-center gap-1.5 px-4 py-2.5 text-sm border-b-2 -mb-px transition-colors",
              active
                ? "border-accent text-fg font-medium"
                : "border-transparent text-fg-muted hover:text-fg"
            )}
          >
            <Icon size={13} />
            {label}
          </Link>
        );
      })}
    </div>
  );
}

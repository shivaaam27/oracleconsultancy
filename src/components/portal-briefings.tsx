"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/* The Briefings page shell: two tabs — Meetings (default) and Announcements —
 * each badged with a live count (meetings within 3 days / unacknowledged
 * announcements). Both panels are mounted and toggled with `hidden` so each
 * keeps its own state (filters, open sheets) when you switch. `initialTab` is
 * seeded server-side from ?tab= so the announcement banner's "Open" lands here. */

type Tab = "meetings" | "announcements";

export function PortalBriefings({
  meetingsCount, announcementsCount, initialTab, meetings, announcements,
}: {
  meetingsCount: number;
  announcementsCount: number;
  initialTab: Tab;
  meetings: ReactNode;
  announcements: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const TABS: { key: Tab; label: string; count: number }[] = [
    { key: "meetings", label: "Meetings", count: meetingsCount },
    { key: "announcements", label: "Announcements", count: announcementsCount },
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="inline-flex self-start rounded-md bg-bg-subtle/60 p-0.5 ring-1 ring-border/40">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded px-3 text-base font-medium transition-colors",
              tab === t.key ? "bg-bg-elev text-fg shadow-sm ring-1 ring-border/50" : "text-fg-muted hover:text-fg",
            )}
          >
            {t.label}
            {t.count > 0 && (
              <span className={cn(
                "min-w-[18px] rounded-full px-1.5 text-center text-xs font-semibold tabular",
                t.key === "announcements" ? "bg-accent text-accent-fg" : "bg-bg-muted text-fg-muted",
              )}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className={tab === "meetings" ? "" : "hidden"}>{meetings}</div>
      <div className={tab === "announcements" ? "" : "hidden"}>{announcements}</div>
    </div>
  );
}

"use client";

// The tabs across a project record: Overview | Budget.
//
// Real links, not state — each tab is its own URL, so it can be bookmarked and
// shared, which is the rule for records in CLAUDE.md. More tabs arrive with the
// later phases (Requisitions, Payments, Snapshot).

import Link from "next/link";
import { cn } from "@/lib/cn";
import { ProjectExportMenu } from "@/components/project-export-menu";

const TABS = [
  { key: "overview", label: "Overview", href: (id: number) => `/projects/${id}` },
  { key: "budget", label: "Budget", href: (id: number) => `/projects/${id}/budget` },
  { key: "requisitions", label: "Requisitions", href: (id: number) => `/projects/${id}/requisitions` },
  { key: "cash", label: "Cash", href: (id: number) => `/projects/${id}/cash` },
  // Sits after Cash: it reads the requisitions and shows the budget counting down.
  { key: "funds", label: "Funds", href: (id: number) => `/projects/${id}/funds` },
  { key: "snapshot", label: "Snapshot", href: (id: number) => `/projects/${id}/snapshot` },
  { key: "site", label: "Site", href: (id: number) => `/projects/${id}/site` },
  // The trail of who changed which figure. Read-only, so it sits after the
  // sheets that produce it.
  { key: "history", label: "History", href: (id: number) => `/projects/${id}/history` },
  // Last on purpose: the masters are set up once and then rarely touched.
  { key: "setup", label: "Setup", href: (id: number) => `/projects/${id}/setup` },
] as const;

export function ProjectTabs({ projectId, active }: { projectId: number; active: string }) {
  return (
    <nav className="flex items-center gap-1 border-b border-border" aria-label="Project sections">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.href(projectId)}
          aria-current={active === t.key ? "page" : undefined}
          className={cn(
            "-mb-px border-b-2 px-3 py-1.5 text-base transition-colors",
            active === t.key
              ? "border-accent font-medium text-fg"
              : "border-transparent text-fg-muted hover:text-fg",
          )}
        >
          {t.label}
        </Link>
      ))}
      {/* Export and print live in the tab bar so they are in the same place on
          every screen, rather than a button hiding on each sheet. */}
      <ProjectExportMenu projectId={projectId} tab={active} />
    </nav>
  );
}

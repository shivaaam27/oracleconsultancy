"use client";

import { useState } from "react";
import { Panel } from "@/components/surface-kit";
import { PortalTaskCard, type PortalCardTask } from "@/components/portal-task-card";
import { PortalTaskDetailPane } from "@/components/portal-task-detail-pane";

/* The Home "My tasks" surface. On a phone it's the swipeable card list; on the
 * web it's a master-detail — a compact list on the left, the selected task's
 * summary + quick actions on the right (no page hop). Reuses PortalTaskCard
 * (mobile) and PortalTaskDetailPane (desktop). */

const STATUS_DOT: Record<string, string> = {
  "Not Started": "hsl(var(--fg-subtle))",
  "In Progress": "hsl(var(--info))",
  "Under Review": "hsl(var(--warn))",
  "Waiting External": "hsl(var(--warn))",
  Blocked: "hsl(var(--danger))",
  Escalated: "hsl(var(--danger))",
  Completed: "hsl(var(--success))",
  Closed: "hsl(var(--success))",
};

export function PortalHomeTasks({
  tasks, viewerRole, emptyText,
}: {
  tasks: PortalCardTask[];
  viewerRole: string;
  emptyText: string;
}) {
  const [selId, setSelId] = useState<number | null>(null);
  const selected = tasks.find((t) => t.id === selId) ?? tasks[0] ?? null;

  if (tasks.length === 0) {
    return <Panel className="p-6 text-center text-sm text-fg-muted">{emptyText}</Panel>;
  }

  const now = new Date();

  return (
    <>
      {/* Mobile: the swipeable card list (unchanged). */}
      <div className="flex flex-col gap-2.5 lg:hidden">
        {tasks.map((t) => <PortalTaskCard key={t.id} task={t} viewerRole={viewerRole} />)}
      </div>

      {/* Web: master-detail. */}
      <div className="hidden gap-3 lg:grid lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.3fr)] lg:items-start">
        <div className="flex flex-col gap-1.5">
          {tasks.map((t) => {
            const active = selected?.id === t.id;
            const overdue = !!t.deadline && new Date(t.deadline) < now && t.status !== "Completed" && t.status !== "Closed";
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelId(t.id)}
                className={`flex items-start gap-2.5 rounded-xl px-3 py-2.5 text-left ring-1 transition-colors ${active ? "bg-bg-elev ring-accent/40" : "ring-border hover:bg-bg-subtle/40"}`}
              >
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: STATUS_DOT[t.status] ?? "var(--border)" }} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="font-mono text-[10px] text-fg-subtle">{t.code}</span>
                    {overdue && <span className="text-[10px] font-medium text-danger">overdue</span>}
                  </span>
                  <span className="block truncate text-sm font-medium">{t.actionItem}</span>
                  <span className="block truncate text-[11px] text-fg-subtle">{t.status}{t.companyName ? ` · ${t.companyName}` : ""}</span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="sticky top-4">
          {selected && (
            <PortalTaskDetailPane
              viewerRole={viewerRole}
              task={{
                id: selected.id, code: selected.code, actionItem: selected.actionItem, status: selected.status,
                priority: selected.priority, deadline: selected.deadline, companyName: selected.companyName,
                teamSize: selected.teamSize, latestUpdate: selected.latestUpdate ?? null,
                requiresAttachment: selected.requiresAttachment,
              }}
            />
          )}
        </div>
      </div>
    </>
  );
}

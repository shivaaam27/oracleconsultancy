"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, Users, MessageSquarePlus, Send, Loader2, CheckCircle2, ExternalLink } from "lucide-react";
import { FluidSelect, type FluidOption } from "./fluid-select";
import { Badge, CaretInput } from "./ui";
import { CompleteTaskSheet } from "./complete-task-sheet";
import { useToast } from "./toast";
import { taskStatusTone as statusTone, priorityTone } from "@/lib/badge-tones";
import { portalAddUpdate } from "@/app/portal/actions";
import { canCompleteTask } from "@/lib/task-permissions";

/* The master-detail pane: the selected task's summary + the quick actions a
 * portal user is allowed (role-scoped status move, inline update, secure
 * Complete) without opening the full task. Used on the staff Home and the
 * staff Tasks page. Completion always goes through the gated CompleteTaskSheet;
 * the full conversation is one click away. */

/** Minimal task shape the pane needs — both the Home row and the Tasks-table
 *  row map onto this. */
export type PaneTask = {
  id: number;
  code: string;
  actionItem: string;
  status: string;
  priority: string;
  deadline: string | null;
  companyName: string | null;
  ownerName?: string | null;
  teamSize?: number;
  description?: string | null;
  latestUpdate?: string | null;
  latestUpdateAuthor?: string | null;
  requiresAttachment?: boolean;
  /** Who created the task — drives the creator-only Complete rule. */
  createdByPersonId?: number | null;
};

const STAFF_STATUSES = ["In Progress", "Under Review", "Blocked"];
const MANAGER_STATUSES = [...STAFF_STATUSES, "Waiting External", "Escalated", "Not Started"];
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
const OPEN_EXCLUDED = ["Completed", "Closed"];

export function PortalTaskDetailPane({ task, viewerRole, viewerId, bare = false }: { task: PaneTask; viewerRole: string; viewerId: number; bare?: boolean }) {
  const { toast } = useToast();
  const router = useRouter();
  const [updateBody, setUpdateBody] = useState("");
  const [completeOpen, setCompleteOpen] = useState(false);
  const [busy, start] = useTransition();

  const closed = OPEN_EXCLUDED.includes(task.status);
  const allowed = viewerRole === "staff" ? STAFF_STATUSES : MANAGER_STATUSES;
  // Only a director/HR or the task's creator may complete it (task-permissions.ts).
  const canComplete = canCompleteTask(
    { id: viewerId, portalRole: viewerRole },
    { createdByPersonId: task.createdByPersonId ?? null },
  );
  const overdue = !!task.deadline && new Date(task.deadline) < new Date() && !closed;

  const statusOptions: FluidOption[] = [
    { value: task.status, label: task.status, dot: STATUS_DOT[task.status] },
    ...allowed.filter((s) => s !== task.status).map((s) => ({ value: s, label: s, dot: STATUS_DOT[s] })),
  ];

  function changeStatus(next: string) {
    if (next === task.status || !allowed.includes(next)) return;
    start(async () => {
      const fd = new FormData();
      fd.set("taskId", String(task.id));
      fd.set("code", task.code);
      fd.set("body", `Moved to ${next}.`);
      fd.set("newStatus", next);
      try { await portalAddUpdate(fd); toast(`Moved to ${next}.`, { tone: "success" }); router.refresh(); }
      catch { toast("Couldn't change the status.", { tone: "danger" }); }
    });
  }
  function postUpdate() {
    const body = updateBody.trim();
    if (!body) return;
    start(async () => {
      const fd = new FormData();
      fd.set("taskId", String(task.id));
      fd.set("code", task.code);
      fd.set("body", body);
      try { await portalAddUpdate(fd); setUpdateBody(""); toast("Update posted.", { tone: "success" }); router.refresh(); }
      catch { toast("Couldn't post the update.", { tone: "danger" }); }
    });
  }

  return (
    <div className={bare ? "p-4" : "rounded-2xl bg-bg-elev p-4 ring-1 ring-border"}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-[11px] font-medium text-fg-muted">{task.code}</span>
        {task.companyName && <span className="text-[11px] text-fg-subtle">· {task.companyName}</span>}
        <span className="grow" />
        <Badge tone={statusTone(task.status)}>{task.status}</Badge>
        <Badge tone={priorityTone(task.priority)}>{task.priority}</Badge>
      </div>
      <h2 className="mt-2 text-base font-semibold leading-snug">{task.actionItem}</h2>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted">
        {task.deadline && (
          <span className={overdue ? "text-danger font-medium" : undefined}>
            <CalendarDays size={12} className="mr-1 inline -mt-px" />
            Due {new Date(task.deadline).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}{overdue ? " · overdue" : ""}
          </span>
        )}
        {task.ownerName && <span>Owner: {task.ownerName}</span>}
        {task.teamSize && task.teamSize > 1 && <span><Users size={12} className="mr-1 inline -mt-px" />Team of {task.teamSize}</span>}
      </div>
      {task.description && <p className="mt-2.5 whitespace-pre-wrap text-sm text-fg-muted">{task.description}</p>}
      {task.latestUpdate && (
        <p className="mt-2.5 rounded-xl bg-bg-subtle/60 px-3 py-2 text-xs text-fg-muted ring-1 ring-border/50">
          {task.latestUpdateAuthor && <span className="font-medium text-fg">{task.latestUpdateAuthor}: </span>}{task.latestUpdate}
        </p>
      )}

      {!closed ? (
        <div className="mt-3.5 flex flex-col gap-3 border-t border-border/60 pt-3.5">
          <label className="flex flex-col gap-1 text-[11px] text-fg-muted">
            Status
            <FluidSelect value={task.status} options={statusOptions} onSelect={changeStatus} buttonClassName="rounded-xl bg-bg-subtle/60 ring-1 ring-border" />
          </label>
          <div className="flex items-center gap-2 rounded-xl px-3 py-1 ring-1 ring-border transition-shadow focus-within:ring-2 focus-within:ring-accent/40">
            <MessageSquarePlus size={15} className="shrink-0 text-accent" />
            <CaretInput
              value={updateBody}
              onChange={(e) => setUpdateBody(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); postUpdate(); } }}
              placeholder="Add an update…"
              className="py-2 text-sm"
            />
            <button type="button" onClick={postUpdate} disabled={busy || !updateBody.trim()} aria-label="Post update" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-40">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            </button>
          </div>
          <div className="flex items-center gap-2">
            {canComplete && (
              <button
                type="button"
                onClick={() => setCompleteOpen(true)}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-success-soft px-3.5 py-2 text-sm font-medium text-success ring-1 ring-success/25 transition-transform active:scale-95"
              >
                <CheckCircle2 size={15} /> Complete
              </button>
            )}
            <Link href={`/portal/task/${task.code}`} className="ml-auto inline-flex items-center gap-1.5 text-sm text-accent hover:underline">
              Open full task <ExternalLink size={13} />
            </Link>
          </div>
        </div>
      ) : (
        <Link href={`/portal/task/${task.code}`} className="mt-3.5 inline-flex items-center gap-1.5 border-t border-border/60 pt-3.5 text-sm text-accent hover:underline">
          Open full task <ExternalLink size={13} />
        </Link>
      )}

      <CompleteTaskSheet open={completeOpen} onClose={() => setCompleteOpen(false)} taskId={task.id} code={task.code} requiresAttachment={task.requiresAttachment} />
    </div>
  );
}

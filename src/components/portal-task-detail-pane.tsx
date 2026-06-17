"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, Users, MessageSquarePlus, Send, Loader2, CheckCircle2, ExternalLink } from "lucide-react";
import { FluidSelect, type FluidOption } from "./fluid-select";
import { Badge } from "./ui";
import { CompleteTaskSheet } from "./complete-task-sheet";
import { useToast } from "./toast";
import { taskStatusTone as statusTone, priorityTone } from "@/lib/badge-tones";
import { portalAddUpdate } from "@/app/portal/actions";
import type { PortalTaskRow, PortalViewerRole } from "./portal-tasks-table";

/* The Tasks-page master-detail pane: the selected task's summary + the quick
 * actions a portal user is allowed (role-scoped status move, inline update,
 * secure Complete) without opening the full task. Completion always goes
 * through the gated CompleteTaskSheet; the full conversation is one click away. */

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

export function PortalTaskDetailPane({ row, viewerRole }: { row: PortalTaskRow; viewerRole: PortalViewerRole }) {
  const { toast } = useToast();
  const router = useRouter();
  const [updateBody, setUpdateBody] = useState("");
  const [completeOpen, setCompleteOpen] = useState(false);
  const [busy, start] = useTransition();

  const closed = OPEN_EXCLUDED.includes(row.status);
  const allowed = viewerRole === "staff" ? STAFF_STATUSES : MANAGER_STATUSES;
  const overdue = !!row.deadline && new Date(row.deadline) < new Date() && !closed;

  const statusOptions: FluidOption[] = [
    { value: row.status, label: row.status, dot: STATUS_DOT[row.status] },
    ...allowed.filter((s) => s !== row.status).map((s) => ({ value: s, label: s, dot: STATUS_DOT[s] })),
  ];

  function changeStatus(next: string) {
    if (next === row.status || !allowed.includes(next)) return;
    start(async () => {
      const fd = new FormData();
      fd.set("taskId", String(row.id));
      fd.set("code", row.code);
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
      fd.set("taskId", String(row.id));
      fd.set("code", row.code);
      fd.set("body", body);
      try { await portalAddUpdate(fd); setUpdateBody(""); toast("Update posted.", { tone: "success" }); router.refresh(); }
      catch { toast("Couldn't post the update.", { tone: "danger" }); }
    });
  }

  return (
    <div className="rounded-2xl bg-bg-elev p-4 ring-1 ring-border">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-[11px] font-medium text-fg-muted">{row.code}</span>
        {row.companyName && <span className="text-[11px] text-fg-subtle">· {row.companyName}</span>}
        <span className="grow" />
        <Badge tone={statusTone(row.status)}>{row.status}</Badge>
        <Badge tone={priorityTone(row.priority)}>{row.priority}</Badge>
      </div>
      <h2 className="mt-2 text-base font-semibold leading-snug">{row.actionItem}</h2>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted">
        {row.deadline && (
          <span className={overdue ? "text-danger font-medium" : undefined}>
            <CalendarDays size={12} className="mr-1 inline -mt-px" />
            Due {new Date(row.deadline).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}{overdue ? " · overdue" : ""}
          </span>
        )}
        {row.ownerName && <span>Owner: {row.ownerName}</span>}
        {row.teamSize > 1 && <span><Users size={12} className="mr-1 inline -mt-px" />Team of {row.teamSize}</span>}
      </div>
      {row.description && <p className="mt-2.5 whitespace-pre-wrap text-sm text-fg-muted">{row.description}</p>}
      {row.latestActivity?.body && (
        <p className="mt-2.5 rounded-xl bg-bg-subtle/60 px-3 py-2 text-xs text-fg-muted ring-1 ring-border/50">
          <span className="font-medium text-fg">{row.latestActivity.author}: </span>{row.latestActivity.body}
        </p>
      )}

      {!closed && (
        <div className="mt-3.5 flex flex-col gap-3 border-t border-border/60 pt-3.5">
          <label className="flex flex-col gap-1 text-[11px] text-fg-muted">
            Status
            <FluidSelect value={row.status} options={statusOptions} onSelect={changeStatus} buttonClassName="rounded-xl bg-bg-subtle/60 ring-1 ring-border" />
          </label>
          <div className="flex items-center gap-2 rounded-xl bg-bg-subtle/40 px-3 py-1 ring-1 ring-border focus-within:bg-bg-elev focus-within:ring-2 focus-within:ring-accent/40">
            <MessageSquarePlus size={15} className="shrink-0 text-accent" />
            <input
              value={updateBody}
              onChange={(e) => setUpdateBody(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); postUpdate(); } }}
              placeholder="Add an update…"
              className="min-w-0 flex-1 bg-transparent py-2 text-sm placeholder:text-fg-muted focus:outline-none"
            />
            <button type="button" onClick={postUpdate} disabled={busy || !updateBody.trim()} aria-label="Post update" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-40">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCompleteOpen(true)}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-success-soft px-3.5 py-2 text-sm font-medium text-success ring-1 ring-success/25 transition-transform active:scale-95"
            >
              <CheckCircle2 size={15} /> Complete
            </button>
            <Link href={`/portal/task/${row.code}`} className="ml-auto inline-flex items-center gap-1.5 text-sm text-accent hover:underline">
              Open full task <ExternalLink size={13} />
            </Link>
          </div>
        </div>
      )}
      {closed && (
        <Link href={`/portal/task/${row.code}`} className="mt-3.5 inline-flex items-center gap-1.5 border-t border-border/60 pt-3.5 text-sm text-accent hover:underline">
          Open full task <ExternalLink size={13} />
        </Link>
      )}

      <CompleteTaskSheet open={completeOpen} onClose={() => setCompleteOpen(false)} taskId={row.id} code={row.code} requiresAttachment={row.requiresAttachment} />
    </div>
  );
}

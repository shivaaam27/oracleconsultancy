"use client";

import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useCallback, useRef } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  X,
  ExternalLink,
  MessageSquarePlus,
  GitCommitHorizontal,
  Pin,
  Pencil,
  Loader2,
  AlertCircle,
  FileText,
} from "lucide-react";
import { UpdateBox } from "./update-box";
import { CodeLinkedText } from "./code-linked-text";
import { AssigneeList } from "./assignee-list";
import { Badge } from "./ui";
import { useToast } from "./toast";
import { callUndo } from "./undo-banner";
import { inlineUpdateTask } from "@/app/task/actions";
import { CheckCircle2, RotateCcw, AlertOctagon } from "lucide-react";
import {
  sortTimeline,
  mergeStatusIntoUpdates,
  suppressUpdateMetaAudits,
  groupFieldEdits,
  cleanReason,
  liftPinnedUpdates,
  summariseEditGroup,
  type TimelineItem,
  type TimelineUpdate,
} from "@/lib/timeline";
import type { TaskRow } from "@/lib/queries";

/* -------------------------------------------------------------------------
 * Types for the API response
 * ---------------------------------------------------------------------- */
type DrawerUpdate = {
  id: number;
  body: string;
  created_at: string;
  created_by: string | null;
  edited_at: string | null;
  original_body: string | null;
  pinned_at: string | null;
};
type DrawerAudit = {
  id: number;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  change_reason: string | null;
  entry_type: string | null;
  created_at: string;
  created_by: string | null;
};
type DrawerData = {
  task: TaskRow;
  updates: DrawerUpdate[];
  audit: DrawerAudit[];
  sourceMeeting: {
    id: number;
    title: string;
    meeting_date: string;
  } | null;
};

/* -------------------------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------------------- */
function statusTone(s: string): "default" | "success" | "warn" | "danger" | "info" {
  if (s === "Completed" || s === "Closed") return "success";
  if (s === "Blocked" || s === "Escalated") return "danger";
  if (s === "Waiting External" || s === "Under Review") return "warn";
  if (s === "In Progress") return "info";
  return "default";
}

function priorityTone(p: string): "default" | "success" | "warn" | "danger" | "info" {
  if (p === "Critical") return "danger";
  if (p === "High") return "warn";
  if (p === "Medium") return "info";
  return "default";
}

function fmtDate(d: Date) {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function fmtTime(d: Date) {
  return d.toLocaleString("en-GB", {
    day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit",
  });
}

function buildTimeline(data: DrawerData): TimelineItem[] {
  const raw: TimelineItem[] = [
    ...data.updates.map<TimelineItem>((u) => ({
      kind: "update",
      id: u.id,
      taskId: data.task.id,
      taskCode: data.task.code,
      body: u.body,
      createdAt: new Date(u.created_at),
      createdBy: u.created_by,
      editedAt: u.edited_at ? new Date(u.edited_at) : null,
      originalBody: u.original_body,
      pinnedAt: u.pinned_at ? new Date(u.pinned_at) : null,
    })),
    ...data.audit.map<TimelineItem>((a) => ({
      kind: "audit",
      id: a.id,
      taskId: data.task.id,
      taskCode: data.task.code,
      field: a.field,
      oldValue: a.old_value,
      newValue: a.new_value,
      changeReason: a.change_reason,
      entryType: a.entry_type,
      createdAt: new Date(a.created_at),
      createdBy: a.created_by,
    })),
  ];
  return liftPinnedUpdates(
    groupFieldEdits(suppressUpdateMetaAudits(mergeStatusIntoUpdates(sortTimeline(raw))))
  ).slice(0, 12);
}

/* -------------------------------------------------------------------------
 * TaskDrawer — mounts in layout, reads ?task= from URL
 * ---------------------------------------------------------------------- */
export function TaskDrawer() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const code = searchParams.get("task");
  // Don't show drawer on the full task detail page (the page IS the detail)
  const isTaskPage = /^\/task\/[A-Z]{2}\d{2}-\d{3}$/.test(pathname);
  const open = !!code && !isTaskPage;

  const [data, setData] = useState<DrawerData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [acting, setActing] = useState<string | null>(null);
  const { toast } = useToast();

  async function quickAction(kind: "complete" | "escalate") {
    if (!data) return;
    setActing(kind);
    const isDone = data.task.status === "Completed" || data.task.status === "Closed";
    const res = kind === "complete"
      ? await inlineUpdateTask(data.task.code, "status", isDone ? "In Progress" : "Completed")
      : await inlineUpdateTask(data.task.code, "escalation", "Yes");
    setActing(null);
    if (res.ok) {
      toast(
        kind === "complete" ? (isDone ? `${data.task.code} reopened` : `${data.task.code} completed`) : `${data.task.code} escalated`,
        {
          tone: "success", duration: 6000,
          action: res.undoToken ? { label: "Undo", onClick: async () => { await callUndo(res.undoToken!); setRefreshKey((k) => k + 1); router.refresh(); } } : undefined,
        }
      );
      setRefreshKey((k) => k + 1);
      router.refresh();
    } else {
      toast(res.error || "Could not update", { tone: "warn", duration: 3000 });
    }
  }

  const close = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("task");
    const q = params.toString();
    router.push(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  // Fetch task data whenever code or refreshKey changes
  useEffect(() => {
    if (!code || isTaskPage) { setData(null); return; }
    setLoading(true);
    setError(false);
    fetch(`/api/task-detail?code=${encodeURIComponent(code)}`)
      .then((r) => {
        if (!r.ok) throw new Error("not found");
        return r.json();
      })
      .then((d: DrawerData) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, refreshKey, isTaskPage]);

  const timeline = data ? buildTimeline(data) : [];

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => { if (!o) close(); }}
    >
      <Dialog.Portal>
        {/* Overlay — forceMount so exit transition plays */}
        <Dialog.Overlay
          forceMount
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm
            transition-opacity duration-200
            data-[state=open]:opacity-100
            data-[state=closed]:opacity-0 data-[state=closed]:pointer-events-none"
        />

        {/* Centred pop-up — vibrancy material, fade + scale in */}
        <Dialog.Content
          forceMount
          aria-describedby={undefined}
          className="fixed inset-0 m-auto z-[51] h-fit max-h-[88svh] w-[calc(100%-1.5rem)] max-w-[560px]
            flex flex-col overflow-hidden glass glass-refract rounded-2xl outline-none
            transition-all duration-200 ease-out
            data-[state=open]:opacity-100 data-[state=open]:scale-100
            data-[state=closed]:opacity-0 data-[state=closed]:scale-[0.97]
            data-[state=closed]:pointer-events-none"
        >
          {/* Always-present accessible name — exists from the moment the panel
              opens, before task data loads, so screen readers can announce it. */}
          <Dialog.Title className="sr-only">
            {data?.task ? data.task.actionItem : code ? `Task ${code}` : "Task"}
          </Dialog.Title>

          {/* ── Header ── */}
          <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-border shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-mono text-xs text-fg-muted bg-bg-subtle px-2 py-0.5 rounded shrink-0">
                {code}
              </span>
              {data?.task && (
                <a
                  href={`/companies/${data.task.companyId}`}
                  className="text-xs text-fg-muted hover:text-accent truncate transition-colors"
                >
                  {data.task.companyName}
                </a>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {code && (
                <a
                  href={`/task/${code}`}
                  className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-accent px-2 py-1 rounded hover:bg-bg-subtle transition-colors"
                >
                  <ExternalLink size={11} /> Full page
                </a>
              )}
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Close"
                  className="h-7 w-7 inline-flex items-center justify-center rounded text-fg-muted hover:text-fg hover:bg-bg-subtle transition-colors"
                >
                  <X size={14} />
                </button>
              </Dialog.Close>
            </div>
          </div>

          {/* ── Body — scrollable ── */}
          <div className="flex-1 overflow-y-auto">
            {/* Loading skeleton */}
            {loading && !data && (
              <div className="flex flex-col items-center justify-center h-40 gap-2 text-fg-muted">
                <Loader2 size={18} className="animate-spin" />
                <span className="text-sm">Loading…</span>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="flex flex-col items-center justify-center h-40 gap-2 text-fg-muted">
                <AlertCircle size={18} className="text-danger" />
                <span className="text-sm">Couldn&apos;t load task.</span>
              </div>
            )}

            {/* Content */}
            {data?.task && (
              <div className="p-5 space-y-5">
                {/* Title */}
                <div className="space-y-2.5">
                  <h2 className="text-base font-semibold leading-snug">
                    {data.task.actionItem}
                  </h2>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge tone={statusTone(data.task.status)}>{data.task.status}</Badge>
                    <Badge tone={priorityTone(data.task.priority)}>{data.task.priority}</Badge>
                    {data.task.escalation === "Yes" && <Badge tone="danger">Escalated</Badge>}
                  </div>

                  {/* Quick actions — one-click from the inspector */}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {(() => {
                      const isDone = data.task.status === "Completed" || data.task.status === "Closed";
                      return (
                        <button
                          type="button"
                          onClick={() => quickAction("complete")}
                          disabled={acting !== null}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-accent text-accent-fg text-xs font-medium px-3 py-1.5 disabled:opacity-50 hover:opacity-90 transition-opacity"
                        >
                          {acting === "complete" ? <Loader2 size={13} className="animate-spin" /> : isDone ? <RotateCcw size={13} /> : <CheckCircle2 size={13} />}
                          {isDone ? "Reopen" : "Complete"}
                        </button>
                      );
                    })()}
                    {data.task.escalation !== "Yes" && (
                      <button
                        type="button"
                        onClick={() => quickAction("escalate")}
                        disabled={acting !== null}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border text-xs text-fg-muted hover:text-danger hover:border-danger/50 px-3 py-1.5 disabled:opacity-50 transition-colors"
                      >
                        {acting === "escalate" ? <Loader2 size={13} className="animate-spin" /> : <AlertOctagon size={13} />}
                        Escalate
                      </button>
                    )}
                  </div>
                </div>

                {/* Meta grid */}
                <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-fg-muted">Deadline</span>
                    <span className="font-medium text-fg">
                      {data.task.deadline ? fmtDate(new Date(data.task.deadline)) : "—"}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-fg-muted">Accountable</span>
                    {data.task.assignees.length ? (
                      <AssigneeList
                        names={data.task.assignees}
                        ids={data.task.assigneeIds}
                        className="font-medium text-fg"
                      />
                    ) : (
                      <span className="font-medium text-fg">—</span>
                    )}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-fg-muted">Department</span>
                    <span className="font-medium text-fg">{data.task.department || "—"}</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-fg-muted">Category</span>
                    <span className="font-medium text-fg">{data.task.category || "—"}</span>
                  </div>
                </div>

                {/* Latest update callout */}
                {data.task.latestUpdate && (
                  <div className="border-l-2 border-accent pl-3 py-0.5">
                    <div className="text-[10px] text-fg-muted mb-0.5 uppercase tracking-wider">
                      Latest update
                    </div>
                    <p className="text-sm leading-relaxed">
                      <CodeLinkedText text={data.task.latestUpdate} />
                    </p>
                  </div>
                )}

                {data.sourceMeeting && (
                  <div className="rounded-xl border border-border bg-bg-subtle px-3 py-2.5 flex items-start gap-2.5">
                    <div className="mt-0.5 h-7 w-7 rounded-full bg-accent-soft text-accent flex items-center justify-center shrink-0">
                      <FileText size={13} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase tracking-wider text-fg-subtle">Source meeting</div>
                      <p className="truncate text-sm font-medium">{data.sourceMeeting.title}</p>
                      <p className="text-xs text-fg-muted">{fmtDate(new Date(data.sourceMeeting.meeting_date))}</p>
                    </div>
                  </div>
                )}

                {/* Divider */}
                <div className="border-t border-border" />

                {/* Post update */}
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-fg-muted mb-3">
                    <MessageSquarePlus size={11} /> Post update
                  </div>
                  <UpdateBox
                    taskId={data.task.id}
                    taskCode={data.task.code}
                    currentStatus={data.task.status}
                    onSuccess={() => setRefreshKey((k) => k + 1)}
                  />
                </div>

                {/* Mini timeline */}
                {timeline.length > 0 && (
                  <div>
                    <div className="text-xs font-medium uppercase tracking-wider text-fg-muted mb-3">
                      History
                    </div>
                    <div className="relative pl-4">
                      <div className="absolute left-1 top-1 bottom-1 w-px bg-border" />
                      <div className="space-y-2.5">
                        {timeline.map((item) => (
                          <MiniTimelineItem key={`${item.kind}-${item.id}`} item={item} />
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* -------------------------------------------------------------------------
 * Compact timeline item for the drawer (no edit menu, no filter chips)
 * ---------------------------------------------------------------------- */
function MiniTimelineItem({ item }: { item: TimelineItem }) {
  if (item.kind === "bulk") return null; // bulk runs don't appear in the mini view

  if (item.kind === "editgroup") {
    const { label } = summariseEditGroup(item);
    return (
      <div className="relative">
        <div className="absolute -left-2.5 top-1.5 w-1.5 h-1.5 rounded-full bg-border" />
        <details className="group/edit px-3 py-1.5 bg-bg-subtle rounded-lg text-xs">
          <summary className="cursor-pointer list-none flex items-center gap-1 text-fg-muted hover:text-fg">
            <Pencil size={9} />
            <span className="font-medium text-fg">{label}</span>
            <span className="ml-auto text-[10px] text-fg-subtle">{fmtTime(item.createdAt)}</span>
          </summary>
          <ul className="mt-1.5 space-y-1">
            {item.items.map((a) => (
              <li key={a.id} className="flex items-center gap-1 flex-wrap text-[11px]">
                <span className="font-medium text-fg">{a.field}</span>
                {a.oldValue && <span className="text-fg-muted">{a.oldValue}</span>}
                {a.oldValue && a.newValue && <GitCommitHorizontal size={8} className="text-fg-subtle" />}
                {a.newValue && <span className="text-fg font-medium">{a.newValue}</span>}
              </li>
            ))}
          </ul>
        </details>
      </div>
    );
  }

  const dot =
    item.kind === "update"
      ? "bg-accent"
      : item.kind === "audit" &&
          (item.newValue === "Completed" || item.newValue === "Closed")
        ? "bg-success"
        : item.kind === "audit" &&
            (item.entryType === "ESCALATION" || item.newValue === "Escalated")
          ? "bg-danger"
          : "bg-border";

  return (
    <div className="relative">
      <div className={`absolute -left-2.5 top-1.5 w-1.5 h-1.5 rounded-full ${dot}`} />

      {item.kind === "update" ? (
        <div className="bg-accent/5 border border-accent/20 rounded-lg px-3 py-2 space-y-1">
          {item.pinnedAt && (
            <div className="flex items-center gap-1 text-[10px] text-accent">
              <Pin size={8} className="fill-accent" /> Pinned
            </div>
          )}
          <p className="text-xs leading-relaxed">
            <CodeLinkedText text={item.body} />
          </p>
          {item.editedAt && (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-fg-subtle">
              <Pencil size={8} /> edited
            </span>
          )}
          {(item as TimelineUpdate).statusChange && (
            <div className="inline-flex items-center gap-1 text-[10px] text-fg-muted">
              <GitCommitHorizontal size={9} />
              {(item as TimelineUpdate).statusChange!.from && (
                <span>{(item as TimelineUpdate).statusChange!.from}</span>
              )}
              <span>→</span>
              <span className="font-medium text-fg">
                {(item as TimelineUpdate).statusChange!.to}
              </span>
            </div>
          )}
          <p className="text-[10px] text-fg-subtle">{fmtTime(item.createdAt)}</p>
        </div>
      ) : (
        <div className="px-3 py-1.5 bg-bg-subtle rounded-lg text-xs">
          {item.entryType === "CREATE" ? (
            <span className="text-fg-muted">Task created</span>
          ) : (
            <span>
              <span className="font-medium text-fg">{item.field || item.entryType}</span>
              {item.oldValue && (
                <span className="text-fg-muted"> {item.oldValue}</span>
              )}
              {item.oldValue && item.newValue && (
                <GitCommitHorizontal size={9} className="inline mx-0.5 text-fg-subtle" />
              )}
              {item.newValue && (
                <span className="font-medium text-fg"> {item.newValue}</span>
              )}
            </span>
          )}
          <span className="ml-2 text-fg-subtle">{fmtTime(item.createdAt)}</span>
        </div>
      )}
    </div>
  );
}

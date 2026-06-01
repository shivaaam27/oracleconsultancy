"use client";

import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
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
  ChevronDown,
  History,
} from "lucide-react";
import { PeekQuickUpdate } from "./peek-quick-update";
import { DeadlineEditor } from "./deadline-editor";
import { CodeLinkedText } from "./code-linked-text";
import { AssigneeList } from "./assignee-list";
import { Badge } from "./ui";
import { useToast } from "./toast";
import { callUndo } from "./undo-banner";
import { inlineUpdateTask, deleteTaskQuick } from "@/app/task/actions";
import { CheckCircle2, RotateCcw, AlertOctagon, Trash2 } from "lucide-react";
import {
  sortTimeline,
  mergeStatusIntoUpdates,
  suppressUpdateMetaAudits,
  groupFieldEdits,
  cleanReason,
  formatAuditValue,
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

  const [confirmDel, setConfirmDel] = useState(false);
  const [showUpdate, setShowUpdate] = useState(false);
  async function handleDelete() {
    if (!data) return;
    setActing("delete");
    const res = await deleteTaskQuick(data.task.code);
    setActing(null);
    if (res.ok) {
      const code = data.task.code;
      close();
      toast(`${code} deleted`, { tone: "success", duration: 8000, action: res.undoToken ? { label: "Undo", onClick: async () => { await callUndo(res.undoToken!); router.refresh(); } } : undefined });
      router.refresh();
    } else {
      toast(res.error || "Could not delete", { tone: "warn", duration: 3000 });
    }
  }

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
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border/60 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-mono text-[11px] font-medium text-fg-muted px-2 py-0.5 rounded-full bg-bg-subtle/80 ring-1 ring-border/60 shrink-0">
                {code}
              </span>
              {data?.task && (
                <Link
                  href={`/companies/${data.task.companyId}`}
                  onClick={close}
                  className="text-xs text-fg-muted hover:text-accent truncate transition-colors"
                >
                  {data.task.companyName}
                </Link>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {code && (
                <Link
                  href={`/task/${code}`}
                  onClick={close}
                  className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-accent px-2.5 py-1.5 rounded-full hover:bg-bg-subtle transition-colors"
                >
                  <ExternalLink size={11} /> Full page
                </Link>
              )}
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Close"
                  className="h-8 w-8 inline-flex items-center justify-center rounded-full text-fg-muted hover:text-fg hover:bg-bg-subtle transition-colors"
                >
                  <X size={15} />
                </button>
              </Dialog.Close>
            </div>
          </div>

          {/* ── Body — scrollable ── */}
          <div className="flex-1 overflow-y-auto">
            {/* Loading skeleton — also covers the brief pre-fetch frame so the
                drawer never renders as a thin header-only bar. */}
            {!data && !error && (
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
              <div className="p-4 space-y-3">
                {/* Info card — mirrors the system hero: glass + soft colour wash */}
                <div className="glass elevated rounded-3xl p-4 sm:p-5 space-y-3.5 relative overflow-hidden">
                  <div
                    aria-hidden
                    className="pointer-events-none absolute -top-16 -right-16 h-44 w-44 rounded-full blur-3xl opacity-60"
                    style={{ background: "radial-gradient(circle, hsl(var(--accent) / 0.30), transparent 70%)" }}
                  />
                  <div
                    aria-hidden
                    className={`pointer-events-none absolute -bottom-20 -left-20 h-52 w-52 rounded-full blur-3xl opacity-50 ${
                      data.task.flag === "overdue" || data.task.escalation === "Yes" || (typeof data.task.daysToDeadline === "number" && data.task.daysToDeadline < 0) ? "" : "hidden"
                    }`}
                    style={{ background: "radial-gradient(circle, hsl(var(--danger) / 0.28), transparent 70%)" }}
                  />
                  <div className="relative space-y-2">
                    <h2 className="text-base font-semibold leading-snug">{data.task.actionItem}</h2>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge tone={statusTone(data.task.status)}>{data.task.status}</Badge>
                      <Badge tone={priorityTone(data.task.priority)}>{data.task.priority}</Badge>
                      {data.task.escalation === "Yes" && <Badge tone="danger">Escalated</Badge>}
                    </div>
                  </div>

                  {/* Meta — interactive deadline, consistent typography */}
                  <div className="relative grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                    <div className="flex flex-col gap-1 min-w-0">
                      <span className="text-[10px] uppercase tracking-wider text-fg-subtle">Deadline</span>
                      <DeadlineEditor
                        code={data.task.code}
                        deadline={data.task.deadline ? new Date(data.task.deadline) : null}
                        daysToDeadline={data.task.daysToDeadline}
                      />
                    </div>
                    <div className="flex flex-col gap-1 min-w-0">
                      <span className="text-[10px] uppercase tracking-wider text-fg-subtle">Accountable</span>
                      {data.task.assignees.length ? (
                        <AssigneeList names={data.task.assignees} ids={data.task.assigneeIds} className="font-medium text-fg text-[13px] truncate" />
                      ) : (
                        <span className="font-medium text-fg text-[13px]">—</span>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 min-w-0">
                      <span className="text-[10px] uppercase tracking-wider text-fg-subtle">Department</span>
                      <span className="font-medium text-fg text-[13px] truncate">{data.task.department || "—"}</span>
                    </div>
                    <div className="flex flex-col gap-1 min-w-0">
                      <span className="text-[10px] uppercase tracking-wider text-fg-subtle">Category</span>
                      <span className="font-medium text-fg text-[13px] truncate">{data.task.category || "—"}</span>
                    </div>
                  </div>

                  {/* Latest update */}
                  {data.task.latestUpdate && (
                    <div className="relative rounded-xl bg-bg-subtle/60 px-3 py-2.5">
                      <div className="text-[10px] uppercase tracking-wider text-fg-subtle mb-1">Latest update</div>
                      <p className="text-sm leading-relaxed"><CodeLinkedText text={data.task.latestUpdate} /></p>
                    </div>
                  )}

                  {/* Quick update — collapsible, minimal (no nested box) */}
                  <div className="relative -mx-4 sm:-mx-5 px-4 sm:px-5 pt-0.5 border-t border-border/60">
                    <button
                      type="button"
                      onClick={() => setShowUpdate((s) => !s)}
                      aria-expanded={showUpdate}
                      className="w-full flex items-center gap-2 py-2 text-xs font-medium text-fg-muted hover:text-fg transition-colors"
                    >
                      <MessageSquarePlus size={13} className="text-accent" /> Quick update
                      <ChevronDown size={14} className={`ml-auto transition-transform ${showUpdate ? "rotate-180" : ""}`} />
                    </button>
                    {showUpdate && (
                      <div className="pb-1">
                        <PeekQuickUpdate
                          row={data.task}
                          onPosted={() => { setRefreshKey((k) => k + 1); setShowUpdate(false); }}
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions — single horizontal row */}
                <div className="glass elevated rounded-2xl p-1.5 flex items-stretch gap-1">
                  {(() => {
                    const isDone = data.task.status === "Completed" || data.task.status === "Closed";
                    return (
                      <button
                        type="button"
                        onClick={() => quickAction("complete")}
                        disabled={acting !== null}
                        className="flex-1 flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl text-[11px] font-medium text-accent hover:bg-accent-soft/50 active:scale-95 transition-all disabled:opacity-50"
                      >
                        {acting === "complete" ? <Loader2 size={15} className="animate-spin" /> : isDone ? <RotateCcw size={15} /> : <CheckCircle2 size={15} />}
                        {isDone ? "Reopen" : "Complete"}
                      </button>
                    );
                  })()}
                  {data.task.escalation !== "Yes" && (
                    <button
                      type="button"
                      onClick={() => quickAction("escalate")}
                      disabled={acting !== null}
                      className="flex-1 flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl text-[11px] font-medium text-danger hover:bg-danger-soft/50 active:scale-95 transition-all disabled:opacity-50"
                    >
                      {acting === "escalate" ? <Loader2 size={15} className="animate-spin" /> : <AlertOctagon size={15} />}
                      Escalate
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setConfirmDel((v) => !v)}
                    className={`flex-1 flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl text-[11px] font-medium active:scale-95 transition-all ${confirmDel ? "bg-danger-soft/60 text-danger" : "text-fg-muted hover:bg-bg-muted/60"}`}
                  >
                    <Trash2 size={15} /> Delete
                  </button>
                </div>

                {/* Delete confirm */}
                {confirmDel && (
                  <div className="glass elevated rounded-2xl px-4 py-2.5 flex items-center gap-2 bg-danger-soft/40">
                    <Trash2 size={14} className="text-danger shrink-0" />
                    <span className="flex-1 text-sm text-danger min-w-0">Delete this task permanently?</span>
                    <button type="button" onClick={() => setConfirmDel(false)} className="px-2 py-1.5 text-xs rounded-md text-fg-muted hover:text-fg">Cancel</button>
                    <button type="button" onClick={handleDelete} disabled={acting === "delete"} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-danger text-white hover:opacity-90 disabled:opacity-50">
                      {acting === "delete" ? <Loader2 size={13} className="animate-spin" /> : "Delete"}
                    </button>
                  </div>
                )}

                {data.sourceMeeting && (
                  <Link
                    href={`/workbook?tab=meetings&open=${data.sourceMeeting.id}`}
                    onClick={close}
                    className="group glass elevated rounded-2xl px-3 py-2.5 flex items-start gap-2.5 hover:ring-1 hover:ring-accent/40 transition-all"
                  >
                    <div className="mt-0.5 h-7 w-7 rounded-full bg-accent-soft text-accent flex items-center justify-center shrink-0">
                      <FileText size={13} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] uppercase tracking-wider text-fg-subtle">Source meeting</div>
                      <p className="truncate text-sm font-medium group-hover:text-accent transition-colors">{data.sourceMeeting.title}</p>
                      <p className="text-xs text-fg-muted">{fmtDate(new Date(data.sourceMeeting.meeting_date))}</p>
                    </div>
                    <ExternalLink size={12} className="text-fg-subtle group-hover:text-accent shrink-0 mt-0.5" />
                  </Link>
                )}

                {/* History — collapsible */}
                {timeline.length > 0 && (
                  <details className="group glass elevated rounded-2xl overflow-hidden" open>
                    <summary className="list-none cursor-pointer flex items-center gap-2 px-4 py-3 text-xs font-medium uppercase tracking-wider text-fg-muted select-none">
                      <History size={13} className="text-fg-subtle" />
                      History
                      <span className="text-fg-subtle normal-case tracking-normal">· {timeline.length}</span>
                      <ChevronDown size={14} className="ml-auto text-fg-subtle transition-transform group-open:rotate-180" />
                    </summary>
                    <div className="px-4 pb-4">
                      <div className="relative pl-4">
                        <div className="absolute left-1 top-1 bottom-1 w-px bg-border" />
                        <div className="space-y-2.5">
                          {timeline.map((item) => (
                            <MiniTimelineItem key={`${item.kind}-${item.id}`} item={item} />
                          ))}
                        </div>
                      </div>
                    </div>
                  </details>
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
                {a.oldValue && <span className="text-fg-muted">{formatAuditValue(a.field, a.oldValue)}</span>}
                {a.oldValue && a.newValue && <GitCommitHorizontal size={8} className="text-fg-subtle" />}
                {a.newValue && <span className="text-fg font-medium">{formatAuditValue(a.field, a.newValue)}</span>}
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
        <div className="px-3 py-1.5 bg-bg-subtle/70 ring-1 ring-border/50 rounded-lg text-xs">
          {item.entryType === "CREATE" ? (
            <span className="text-fg-muted">Task created</span>
          ) : (
            <span>
              <span className="font-medium text-fg">{item.field || item.entryType}</span>
              {item.oldValue && (
                <span className="text-fg-muted"> {formatAuditValue(item.field, item.oldValue)}</span>
              )}
              {item.oldValue && item.newValue && (
                <GitCommitHorizontal size={9} className="inline mx-0.5 text-fg-subtle" />
              )}
              {item.newValue && (
                <span className="font-medium text-fg"> {formatAuditValue(item.field, item.newValue)}</span>
              )}
            </span>
          )}
          <span className="ml-2 text-fg-subtle">{fmtTime(item.createdAt)}</span>
        </div>
      )}
    </div>
  );
}

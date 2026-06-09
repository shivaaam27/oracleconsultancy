"use client";

import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { EntityDrawer, type DrawerTab } from "./entity-drawer";
import { SectionCard } from "./drawer-kit";
import { CompanyDrawerLink } from "./company-drawer-link";
import { TimelineEntry } from "./timeline-entry";
import {
  ExternalLink, MessageSquarePlus, FileText, ChevronDown, History,
  LayoutDashboard, CheckCircle2, RotateCcw, AlertOctagon, Trash2, Loader2, X,
} from "lucide-react";
import { PeekQuickUpdate } from "./peek-quick-update";
import { DeadlineEditor } from "./deadline-editor";
import { CodeLinkedText } from "./code-linked-text";
import { AssigneeList } from "./assignee-list";
import { Badge } from "./ui";
import { useToast } from "./toast";
import { callUndo } from "./undo-banner";
import { inlineUpdateTask, deleteTaskQuick } from "@/app/task/actions";
import {
  sortTimeline, mergeStatusIntoUpdates, suppressUpdateMetaAudits,
  groupFieldEdits, liftPinnedUpdates, type TimelineItem,
} from "@/lib/timeline";
import type { TaskRow } from "@/lib/queries";

type DrawerUpdate = { id: number; body: string; created_at: string; created_by: string | null; edited_at: string | null; original_body: string | null; pinned_at: string | null };
type DrawerAudit = { id: number; field: string | null; old_value: string | null; new_value: string | null; change_reason: string | null; entry_type: string | null; created_at: string; created_by: string | null };
type DrawerData = { task: TaskRow; updates: DrawerUpdate[]; audit: DrawerAudit[]; sourceMeeting: { id: number; title: string; meeting_date: string } | null };

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
function fmtDate(d: Date) { return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); }

function buildTimeline(data: DrawerData): TimelineItem[] {
  const raw: TimelineItem[] = [
    ...data.updates.map<TimelineItem>((u) => ({ kind: "update", id: u.id, taskId: data.task.id, taskCode: data.task.code, body: u.body, createdAt: new Date(u.created_at), createdBy: u.created_by, editedAt: u.edited_at ? new Date(u.edited_at) : null, originalBody: u.original_body, pinnedAt: u.pinned_at ? new Date(u.pinned_at) : null })),
    ...data.audit.map<TimelineItem>((a) => ({ kind: "audit", id: a.id, taskId: data.task.id, taskCode: data.task.code, field: a.field, oldValue: a.old_value, newValue: a.new_value, changeReason: a.change_reason, entryType: a.entry_type, createdAt: new Date(a.created_at), createdBy: a.created_by })),
  ];
  return liftPinnedUpdates(groupFieldEdits(suppressUpdateMetaAudits(mergeStatusIntoUpdates(sortTimeline(raw))))).slice(0, 12);
}

export function TaskDrawer() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const code = searchParams.get("task");
  const isTaskPage = /^\/task\/[A-Z]{2}\d{2}-\d{3}$/.test(pathname);
  const open = !!code && !isTaskPage;

  const [data, setData] = useState<DrawerData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [acting, setActing] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [showUpdate, setShowUpdate] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const { toast } = useToast();

  const close = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("task");
    const q = params.toString();
    router.push(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  useEffect(() => { setActiveTab("overview"); setConfirmDel(false); setShowUpdate(false); }, [code]);

  async function quickAction(kind: "complete" | "escalate") {
    if (!data) return;
    setActing(kind);
    const isDone = data.task.status === "Completed" || data.task.status === "Closed";
    const res = kind === "complete"
      ? await inlineUpdateTask(data.task.code, "status", isDone ? "In Progress" : "Completed")
      : await inlineUpdateTask(data.task.code, "escalation", "Yes");
    setActing(null);
    if (res.ok) {
      toast(kind === "complete" ? (isDone ? `${data.task.code} reopened` : `${data.task.code} completed`) : `${data.task.code} escalated`,
        { tone: "success", duration: 6000, action: res.undoToken ? { label: "Undo", onClick: async () => { await callUndo(res.undoToken!); setRefreshKey((k) => k + 1); router.refresh(); } } : undefined });
      setRefreshKey((k) => k + 1);
      router.refresh();
    } else {
      toast(res.error || "Could not update", { tone: "warn", duration: 3000 });
    }
  }

  async function handleDelete() {
    if (!data) return;
    setActing("delete");
    const res = await deleteTaskQuick(data.task.code);
    setActing(null);
    if (res.ok) {
      const c = data.task.code;
      close();
      toast(`${c} deleted`, { tone: "success", duration: 8000, action: res.undoToken ? { label: "Undo", onClick: async () => { await callUndo(res.undoToken!); router.refresh(); } } : undefined });
      router.refresh();
    } else {
      toast(res.error || "Could not delete", { tone: "warn", duration: 3000 });
    }
  }

  useEffect(() => {
    if (!code || isTaskPage) { setData(null); return; }
    setLoading(true);
    setError(false);
    fetch(`/api/task-detail?code=${encodeURIComponent(code)}`)
      .then((r) => { if (!r.ok) throw new Error("not found"); return r.json(); })
      .then((d: DrawerData) => { setData(d); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, refreshKey, isTaskPage]);

  const t = data?.task;
  const urgent = !!t && (t.flag === "overdue" || t.escalation === "Yes" || (typeof t.daysToDeadline === "number" && t.daysToDeadline < 0));
  const done = !!t && (t.status === "Completed" || t.status === "Closed");
  const tone: "accent" | "success" | "warn" | "danger" = done ? "success" : urgent ? "danger" : "accent";
  const timeline = data ? buildTimeline(data) : [];

  const heroNode = t ? (
    <div className="pr-8 space-y-2">
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-mono text-[11px] font-medium text-fg-muted px-2 py-0.5 rounded-full bg-bg-subtle/80 ring-1 ring-border/60 shrink-0">{t.code}</span>
        <CompanyDrawerLink id={t.companyId} className="text-xs text-fg-muted hover:text-accent truncate transition-colors text-left">{t.companyName}</CompanyDrawerLink>
      </div>
      <h2 className="text-base font-semibold leading-snug">{t.actionItem}</h2>
      <div className="flex flex-wrap gap-1.5">
        <Badge tone={statusTone(t.status)}>{t.status}</Badge>
        <Badge tone={priorityTone(t.priority)}>{t.priority}</Badge>
        {t.escalation === "Yes" && <Badge tone="danger">Escalated</Badge>}
      </div>
    </div>
  ) : <div className="h-12" />;

  const overviewContent = t ? (
    <>
      <SectionCard className="p-4 space-y-3.5">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-[10px] uppercase tracking-wider text-fg-subtle">Deadline</span>
            <DeadlineEditor code={t.code} deadline={t.deadline ? new Date(t.deadline) : null} daysToDeadline={t.daysToDeadline} />
          </div>
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-[10px] uppercase tracking-wider text-fg-subtle">Accountable</span>
            {t.assignees.length ? <AssigneeList names={t.assignees} ids={t.assigneeIds} className="font-medium text-fg text-[13px] truncate" /> : <span className="font-medium text-fg text-[13px]">—</span>}
          </div>
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-[10px] uppercase tracking-wider text-fg-subtle">Department</span>
            <span className="font-medium text-fg text-[13px] truncate">{t.department || "—"}</span>
          </div>
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-[10px] uppercase tracking-wider text-fg-subtle">Category</span>
            <span className="font-medium text-fg text-[13px] truncate">{t.category || "—"}</span>
          </div>
        </div>

        {t.comments && t.comments.trim() && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-fg-subtle mb-1">Description</div>
            <p className="text-sm leading-relaxed text-fg whitespace-pre-wrap"><CodeLinkedText text={t.comments} /></p>
          </div>
        )}
        {t.latestUpdate && (
          <div className="rounded-xl bg-bg-subtle/60 px-3 py-2.5">
            <div className="text-[10px] uppercase tracking-wider text-fg-subtle mb-1">Latest update</div>
            <p className="text-sm leading-relaxed"><CodeLinkedText text={t.latestUpdate} /></p>
          </div>
        )}

        <div className="-mx-4 px-4 pt-0.5 border-t border-border/60">
          <button type="button" onClick={() => setShowUpdate((s) => !s)} aria-expanded={showUpdate}
            className="w-full flex items-center gap-2 py-2 text-xs font-medium text-fg-muted hover:text-fg transition-colors">
            <MessageSquarePlus size={13} className="text-accent" /> Quick update
            <ChevronDown size={14} className={`ml-auto transition-transform ${showUpdate ? "rotate-180" : ""}`} />
          </button>
          {showUpdate && <div className="pb-1"><PeekQuickUpdate row={t} onPosted={() => { setRefreshKey((k) => k + 1); setShowUpdate(false); }} /></div>}
        </div>
      </SectionCard>

      {data!.sourceMeeting && (
        <Link href={`/workbook?tab=meetings&open=${data!.sourceMeeting.id}`} onClick={close}
          className="group glass elevated rounded-2xl px-3 py-2.5 flex items-start gap-2.5 hover:ring-1 hover:ring-accent/40 transition-all">
          <div className="mt-0.5 h-7 w-7 rounded-full bg-accent-soft text-accent flex items-center justify-center shrink-0"><FileText size={13} /></div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-wider text-fg-subtle">Source meeting</div>
            <p className="truncate text-sm font-medium group-hover:text-accent transition-colors">{data!.sourceMeeting.title}</p>
            <p className="text-xs text-fg-muted">{fmtDate(new Date(data!.sourceMeeting.meeting_date))}</p>
          </div>
          <ExternalLink size={12} className="text-fg-subtle group-hover:text-accent shrink-0 mt-0.5" />
        </Link>
      )}
    </>
  ) : null;

  const historyContent = timeline.length > 0 ? (
    <SectionCard className="p-4">
      <ol className="mt-1">
        {timeline.map((item, i) => (
          <TimelineEntry key={`${item.kind}-${item.id}`} item={item} isLast={i === timeline.length - 1} onChanged={() => setRefreshKey((k) => k + 1)} />
        ))}
      </ol>
    </SectionCard>
  ) : (
    <div className="py-10 text-center text-sm text-fg-muted">No history yet.</div>
  );

  const tabs: DrawerTab[] = t ? [
    { id: "overview", label: "Overview", icon: <LayoutDashboard size={14} />, content: overviewContent },
    { id: "history", label: "History", icon: <History size={14} />, badge: timeline.length || undefined, content: historyContent },
  ] : [];

  const actionBar = t ? (
    <div className="space-y-2">
      {confirmDel && (
        <div className="flex items-center gap-2 rounded-xl bg-danger-soft/50 ring-1 ring-danger/25 px-3 py-1.5 text-xs">
          <Trash2 size={14} className="text-danger shrink-0" />
          <span className="min-w-0 flex-1">Delete this task permanently?</span>
          <button type="button" onClick={() => setConfirmDel(false)} className="shrink-0 text-fg-muted hover:text-fg">Cancel</button>
          <button type="button" onClick={handleDelete} disabled={acting === "delete"} className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-danger text-white font-medium hover:opacity-90 disabled:opacity-50">
            {acting === "delete" ? <Loader2 size={12} className="animate-spin" /> : "Delete"}
          </button>
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={() => quickAction("complete")} disabled={acting !== null}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-accent text-accent-fg hover:opacity-90 transition-opacity disabled:opacity-50">
          {acting === "complete" ? <Loader2 size={14} className="animate-spin" /> : done ? <RotateCcw size={14} /> : <CheckCircle2 size={14} />}
          {done ? "Reopen" : "Complete"}
        </button>
        {t.escalation !== "Yes" && (
          <button type="button" onClick={() => quickAction("escalate")} disabled={acting !== null}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg ring-1 ring-danger/30 text-danger hover:bg-danger-soft/50 transition-colors disabled:opacity-50">
            {acting === "escalate" ? <Loader2 size={14} className="animate-spin" /> : <AlertOctagon size={14} />} Escalate
          </button>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <button type="button" onClick={() => setConfirmDel((v) => !v)} aria-label="Delete"
            className={`inline-flex h-9 w-9 items-center justify-center rounded-full ring-1 ring-border bg-bg-elev/60 transition-colors hover:ring-danger/40 ${confirmDel ? "text-danger" : "text-fg-muted hover:text-danger"}`}>
            <Trash2 size={15} />
          </button>
          <Link href={`/task/${t.code}`} onClick={close} aria-label="Open full page"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full ring-1 ring-border bg-bg-elev/60 text-fg-muted hover:text-accent hover:ring-accent/40 transition-colors">
            <ExternalLink size={15} />
          </Link>
        </div>
      </div>
    </div>
  ) : undefined;

  return (
    <EntityDrawer
      open={open}
      onClose={close}
      title={t ? t.actionItem : code ? `Task ${code}` : "Task"}
      tone={tone}
      loading={loading && !data}
      error={error}
      errorLabel="Couldn't load task."
      maxWidth="560px"
      hero={heroNode}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      actionBar={actionBar}
    />
  );
}

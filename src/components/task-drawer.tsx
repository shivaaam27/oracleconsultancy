"use client";

import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { EntityDrawer, type DrawerTab } from "./entity-drawer";
import { SectionCard } from "./drawer-kit";
import { CompanyDrawerLink } from "./company-drawer-link";
import { TimelineEntry } from "./timeline-entry";
import {
  ExternalLink, FileText, History, LayoutDashboard, MessageSquare, Pencil, Save,
  CheckCircle2, RotateCcw, AlertOctagon, Trash2, Loader2,
} from "lucide-react";
import { DeadlineEditor } from "./deadline-editor";
import { CodeLinkedText } from "./code-linked-text";
import { AssigneeList } from "./assignee-list";
import { Badge, Input, Select, Textarea, Button } from "./ui";
import { PolishedInput } from "./polished-input";
import { PersonPicker } from "./person-picker";
import { PortalConversation, type ConvoMessage, type ConvoEvent } from "./portal-conversation";
import { SimilarTasks } from "./similar-tasks";
import { DraftEmailButton } from "./draft-email-button";
import { useToast } from "./toast";
import { callUndo } from "./undo-banner";
import { inlineUpdateTask, deleteTaskQuick, adminAddUpdate, adminTogglePin, updateTask } from "@/app/task/actions";
import { STATUSES, PRIORITIES, RISKS } from "@/lib/constants";
import {
  sortTimeline, mergeStatusIntoUpdates, suppressUpdateMetaAudits,
  groupFieldEdits, liftPinnedUpdates, applyTimelineFilter,
  type TimelineItem, type TimelineFilter,
} from "@/lib/timeline";
import type { TaskRow } from "@/lib/queries";
import { cn } from "@/lib/cn";

type DrawerUpdate = { id: number; body: string; created_at: string; created_by: string | null; edited_at: string | null; original_body: string | null; pinned_at: string | null; parent_update_id?: number | null; attachment_document_id?: number | null };
type DrawerAudit = { id: number; field: string | null; old_value: string | null; new_value: string | null; change_reason: string | null; entry_type: string | null; created_at: string; created_by: string | null };
type DrawerData = {
  task: TaskRow;
  updates: DrawerUpdate[];
  audit: DrawerAudit[];
  sourceMeeting: { id: number; title: string; meeting_date: string } | null;
  convoMessages: ConvoMessage[];
  convoEvents: ConvoEvent[];
  team: { id: number; name: string }[];
  seenLabel: string[];
  latestId: number | null;
  statusOptions: string[];
  people: { id: number; name: string }[];
  companies: { id: number; name: string }[];
};

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
function dateInput(d: Date | string | null | undefined) {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "";
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function buildTimeline(data: DrawerData): TimelineItem[] {
  const raw: TimelineItem[] = [
    ...data.updates.map<TimelineItem>((u) => ({ kind: "update", id: u.id, taskId: data.task.id, taskCode: data.task.code, body: u.body, createdAt: new Date(u.created_at), createdBy: u.created_by, editedAt: u.edited_at ? new Date(u.edited_at) : null, originalBody: u.original_body, pinnedAt: u.pinned_at ? new Date(u.pinned_at) : null })),
    ...data.audit.map<TimelineItem>((a) => ({ kind: "audit", id: a.id, taskId: data.task.id, taskCode: data.task.code, field: a.field, oldValue: a.old_value, newValue: a.new_value, changeReason: a.change_reason, entryType: a.entry_type, createdAt: new Date(a.created_at), createdBy: a.created_by })),
  ];
  return liftPinnedUpdates(groupFieldEdits(suppressUpdateMetaAudits(mergeStatusIntoUpdates(sortTimeline(raw)))));
}

const FILTER_LABELS: Record<TimelineFilter, string> = {
  all: "All", updates: "Updates", status: "Status", field: "Edits", escalation: "Escalations", bulk: "Bulk",
};

/** A grouped inset card holding related edit fields. */
function EditCard({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl ring-1 ring-border/60 bg-bg-subtle/40 p-3 space-y-2.5">
      {title && <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">{title}</div>}
      {children}
    </div>
  );
}

/** Single labelled control inside an EditCard. */
function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1 min-w-0", className)}>
      <label className="block text-[11px] font-medium text-fg-muted">{label}</label>
      {children}
    </div>
  );
}

export function TaskDrawer() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const code = searchParams.get("task");
  const refreshNonce = searchParams.get("tr");
  const isTaskPage = /^\/task\/[A-Z]{2}\d{2}-\d{3}$/.test(pathname);
  const open = !!code && !isTaskPage;

  const [data, setData] = useState<DrawerData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [acting, setActing] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [filter, setFilter] = useState<TimelineFilter>("all");
  const { toast } = useToast();

  const close = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("task");
    params.delete("tr");
    const q = params.toString();
    router.push(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  useEffect(() => { setActiveTab("overview"); setConfirmDel(false); setFilter("all"); }, [code]);

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
  }, [code, refreshKey, refreshNonce, isTaskPage]);

  const t = data?.task;
  const urgent = !!t && (t.flag === "overdue" || t.escalation === "Yes" || (typeof t.daysToDeadline === "number" && t.daysToDeadline < 0));
  const done = !!t && (t.status === "Completed" || t.status === "Closed");
  const tone: "accent" | "success" | "warn" | "danger" = done ? "success" : urgent ? "danger" : "accent";

  const merged = useMemo(() => (data ? buildTimeline(data) : []), [data]);
  const counts = useMemo<Record<TimelineFilter, number>>(() => ({
    all: merged.length,
    updates: merged.filter((i) => i.kind === "update").length,
    status: merged.filter((i) => (i.kind === "update" && i.statusChange) || (i.kind === "audit" && i.field === "Status")).length,
    field: merged.filter((i) => i.kind === "editgroup" || (i.kind === "audit" && i.field !== "Status" && i.entryType !== "CREATE")).length,
    escalation: merged.filter((i) => i.kind === "audit" && (i.entryType === "ESCALATION" || i.field === "Escalation" || i.newValue === "Escalated" || i.newValue === "Yes")).length,
    bulk: merged.filter((i) => i.kind === "audit" && i.changeReason?.toLowerCase().startsWith("bulk")).length,
  }), [merged]);
  const timeline = useMemo(() => applyTimelineFilter(merged, filter), [merged, filter]);

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
            <p className="text-sm leading-relaxed text-fg whitespace-pre-wrap break-words"><CodeLinkedText text={t.comments} /></p>
          </div>
        )}
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

      <SimilarTasks query={t.actionItem} excludeId={t.id} />

      <div className="flex justify-end">
        <DraftEmailButton taskId={t.id} />
      </div>
    </>
  ) : null;

  const conversationContent = t && data ? (
    // A conversation post (add / pin / status) runs as a server-action form;
    // PortalConversation fires onPosted when it resolves, so we refetch exactly
    // then — no fixed 0.7s guess that could miss a slow upload.
    <div>
      <PortalConversation
        taskId={t.id}
        code={t.code}
        closed={done}
        statusOptions={data.statusOptions}
        currentStatus={t.status}
        messages={data.convoMessages}
        events={data.convoEvents}
        latestId={data.latestId}
        seenLabel={data.seenLabel}
        team={data.team}
        addAction={adminAddUpdate}
        pinAction={adminTogglePin}
        canPin
        canAck={false}
        composerHint="You can set any status, pin the current instruction, attach files, and @mention the team."
        onPosted={() => setRefreshKey((k) => k + 1)}
      />
    </div>
  ) : null;

  const historyContent = t ? (
    <SectionCard className="p-4">
      {counts.all > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {(Object.keys(FILTER_LABELS) as TimelineFilter[])
            .filter((f) => f === "all" || counts[f] > 0)
            .map((f) => {
              const active = filter === f;
              return (
                <button key={f} type="button" onClick={() => setFilter(f)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs transition-colors ${active ? "bg-accent text-accent-fg font-medium" : "bg-bg-subtle text-fg-muted hover:text-fg"}`}>
                  {FILTER_LABELS[f]}<span className={active ? "text-accent-fg/80" : "text-fg-subtle"}>{counts[f]}</span>
                </button>
              );
            })}
        </div>
      )}
      {timeline.length > 0 ? (
        <ol className="mt-1">
          {timeline.map((item, i) => (
            <TimelineEntry key={`${item.kind}-${item.id}`} item={item} isLast={i === timeline.length - 1} onChanged={() => setRefreshKey((k) => k + 1)} />
          ))}
        </ol>
      ) : (
        <div className="py-8 text-center text-sm text-fg-muted">{counts.all === 0 ? "No history yet." : "No items match this filter."}</div>
      )}
    </SectionCard>
  ) : null;

  const editContent = t && data ? (
    <form action={updateTask.bind(null, t.code)} className="space-y-2.5">
      <input type="hidden" name="returnTo" value={`${pathname}?task=${encodeURIComponent(t.code)}&tr=${Date.now()}`} />

      <EditCard>
        <Field label="Action item">
          <PolishedInput name="actionItem" defaultValue={t.actionItem} required />
        </Field>
        <Field label="Company">
          <Select name="companyId" defaultValue={t.companyId}>
            {data.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <p className="text-[10.5px] text-fg-subtle leading-snug">Changing this issues a new code; the old one keeps redirecting.</p>
        </Field>
      </EditCard>

      <EditCard title="Details">
        <div className="grid grid-cols-2 gap-x-2.5 gap-y-2.5">
          <Field label="Status"><Select name="status" defaultValue={t.status}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</Select></Field>
          <Field label="Priority"><Select name="priority" defaultValue={t.priority}>{PRIORITIES.map((s) => <option key={s}>{s}</option>)}</Select></Field>
          <Field label="Risk"><Select name="risk" defaultValue={t.risk || ""}><option value="">—</option>{RISKS.map((s) => <option key={s}>{s}</option>)}</Select></Field>
          <Field label="Escalation"><Select name="escalation" defaultValue={t.escalation || "No"}><option>No</option><option>Yes</option></Select></Field>
          <Field label="Department"><Input name="department" defaultValue={t.department || ""} placeholder="—" /></Field>
          <Field label="Category"><Input name="category" defaultValue={t.category || ""} placeholder="—" /></Field>
          <Field label="Meeting date"><Input name="meetingDate" type="date" defaultValue={dateInput(t.meetingDate)} /></Field>
          <Field label="Deadline"><Input name="deadline" type="date" defaultValue={dateInput(t.deadline)} /></Field>
        </div>
      </EditCard>

      <EditCard title="People & notes">
        <Field label="Accountable">
          <PersonPicker people={data.people} defaultNames={t.assignees} placeholder="Search people, or type a new name…" />
        </Field>
        <Field label="Comments">
          <Textarea name="comments" defaultValue={t.comments || ""} rows={2} />
        </Field>
      </EditCard>

      <Button type="submit" size="lg" className="w-full rounded-full"><Save size={14} /> Save changes</Button>
    </form>
  ) : null;

  const tabs: DrawerTab[] = t ? [
    { id: "overview", label: "Overview", icon: <LayoutDashboard size={14} />, content: overviewContent },
    { id: "conversation", label: "Conversation", icon: <MessageSquare size={14} />, badge: data && data.convoMessages.length ? data.convoMessages.length : undefined, content: conversationContent },
    { id: "history", label: "History", icon: <History size={14} />, badge: counts.all || undefined, content: historyContent },
    { id: "edit", label: "Edit", icon: <Pencil size={14} />, content: editContent },
  ] : [];

  const actionBar = t ? (
    <div className="space-y-2">
      {confirmDel && (
        <div className="flex items-center gap-2 rounded-xl bg-danger-soft/50 ring-1 ring-danger/25 px-3 py-1.5 text-xs">
          <Trash2 size={14} className="text-danger shrink-0" />
          <span className="min-w-0 flex-1">Delete this task permanently?</span>
          <button type="button" onClick={() => setConfirmDel(false)} className="shrink-0 text-fg-muted hover:text-fg">Cancel</button>
          <Button type="button" onClick={handleDelete} disabled={acting === "delete"} variant="danger" size="sm" className="shrink-0">
            {acting === "delete" ? <Loader2 size={12} className="animate-spin" /> : "Delete"}
          </Button>
        </div>
      )}
      <div className="flex items-center gap-2">
        <Button type="button" onClick={() => quickAction("complete")} disabled={acting !== null} loading={acting === "complete"}
          variant="primary" size="lg" className="rounded-full flex-1 sm:flex-none">
          {acting !== "complete" && (done ? <RotateCcw size={15} /> : <CheckCircle2 size={15} />)}
          {done ? "Reopen" : "Complete"}
        </Button>
        {t.escalation !== "Yes" && (
          <Button type="button" onClick={() => quickAction("escalate")} disabled={acting !== null} loading={acting === "escalate"}
            variant="danger-soft" size="lg" className="rounded-full">
            {acting !== "escalate" && <AlertOctagon size={15} />} Escalate
          </Button>
        )}
        <Button type="button" onClick={() => setConfirmDel((v) => !v)} aria-label="Delete"
          variant="ghost" size="lg" className={`ml-auto rounded-full w-10 px-0 ${confirmDel ? "text-danger bg-danger-soft" : "hover:text-danger"}`}>
          <Trash2 size={16} />
        </Button>
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
      maxWidth="680px"
      fullScreenOnMobile
      hero={heroNode}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      actionBar={actionBar}
    />
  );
}

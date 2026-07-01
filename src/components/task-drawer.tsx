"use client";

import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { EntityDrawer, type DrawerTab } from "./entity-drawer";
import { SectionCard } from "./drawer-kit";
import { CompanyDrawerLink } from "./company-drawer-link";
import { TimelineEntry } from "./timeline-entry";
import {
  ExternalLink, FileText, History, LayoutDashboard, MessageSquare, Pencil, Save,
  CheckCircle2, RotateCcw, AlertOctagon, Trash2, ArrowRight, Pin,
  ChevronLeft, ChevronRight, Send, Link as LinkIcon, Bell,
} from "lucide-react";
import { DeadlineEditor } from "./deadline-editor";
import { CodeLinkedText } from "./code-linked-text";
import { AssigneeAvatars } from "./assignee-avatars";
import { Badge, Input, Select, Textarea, Button, IconButton } from "./ui";
import { PolishedInput } from "./polished-input";
import { PersonPicker } from "./person-picker";
import { PortalConversation, type ConvoMessage, type ConvoEvent } from "./portal-conversation";
import { TaskInlineStatus, TaskInlinePriority } from "./task-inline-edit";
import { WaitingOnChip } from "./task-meta-line";
import { Segmented } from "./macos";
import { FluidSelect } from "./fluid-select";
import { SimilarTasks } from "./similar-tasks";
import { DraftEmailButton } from "./draft-email-button";
import { useToast } from "./toast";
import { callUndo } from "./undo-banner";
import { inlineUpdateTask, deleteTaskQuick, adminAddUpdate, adminTogglePin, updateTask, adminRemindTask } from "@/app/task/actions";
import { getGivenName, getInitials } from "@/lib/names";
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

/** Compact relative time for the latest-update card. */
function ago(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  const d = Math.round(s / 86400);
  if (d < 7) return `${d}d ago`;
  if (d < 30) return `${Math.round(d / 7)}w ago`;
  return `${Math.round(d / 30)}mo ago`;
}
function exactTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}
const STATUS_NAMES = ["Not Started", "In Progress", "Under Review", "Blocked", "Waiting External", "Escalated", "Completed", "Closed"];
function statusTarget(body: string): string | null {
  return STATUS_NAMES.find((s) => body.includes(s)) ?? null;
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
    <SectionCard className="p-3 space-y-2.5">
      {title && <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">{title}</div>}
      {children}
    </SectionCard>
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

/** A small labelled cell used in the Overview key-fields grid. */
/** One calm hairline fact row — label left, value right (Overview). */
function FactRow({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between gap-3 py-2.5 border-t border-border/50 text-sm", last && "border-b")}>
      <span className="text-fg-tertiary shrink-0">{label}</span>
      <span className="min-w-0 text-right">{children}</span>
    </div>
  );
}

/** Muted "Set …" placeholder that jumps to the Edit tab. */
function SetLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="text-[13px] text-fg-subtle hover:text-accent transition-colors">
      {children}
    </button>
  );
}

export function TaskDrawer() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const code = searchParams.get("task");
  const refreshNonce = searchParams.get("tr");
  // Optional ordered code list for Prev/Next triage. Any view can opt a row into
  // step-through by adding `&tl=DS-001,DS-002,…` when it opens the drawer; absent
  // here, the arrows simply don't render (no-op-safe).
  const tlParam = searchParams.get("tl");
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
  const [posting, setPosting] = useState(false);
  const [reminding, setReminding] = useState(false);
  const [remindScope, setRemindScope] = useState<"task" | "all">("task");
  // Controlled values for the Edit tab's FluidSelects (kit dropdowns don't emit a
  // form field, so each is mirrored into a hidden input). Re-seeded when data loads.
  const [editCompany, setEditCompany] = useState("");
  const [editRisk, setEditRisk] = useState("");
  const [editEscalation, setEditEscalation] = useState("No");
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();

  // Prev/Next stepping through an ordered code list (if the opener supplied one).
  const seq = useMemo(() => (tlParam ? tlParam.split(",").map((c) => c.trim()).filter(Boolean) : []), [tlParam]);
  const seqIdx = code ? seq.indexOf(code) : -1;
  const prevCode = seqIdx > 0 ? seq[seqIdx - 1] : null;
  const nextCode = seqIdx >= 0 && seqIdx < seq.length - 1 ? seq[seqIdx + 1] : null;

  const goToCode = useCallback((next: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("task", next);
    params.delete("tr");
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }, [pathname, router, searchParams]);

  const close = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("task");
    params.delete("tr");
    params.delete("tl");
    params.delete("dtab");
    const q = params.toString();
    router.push(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  // Seed the active tab from the `dtab` URL param so openers can deep-link a tab
  // (e.g. table-view openTask(code,"conversation") sets ?dtab=conversation). A
  // drawer-specific name, NOT "tab" (which selects the page section). The ids
  // here must match the DrawerTab ids below. Falls back to Overview.
  useEffect(() => {
    setActiveTab(searchParams.get("dtab") ?? "overview");
    setConfirmDel(false);
    setFilter("all");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

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

  // Per-task reminder (single task, not the all-tasks Outbox bundle): drafts a
  // WhatsApp/Email message to the accountable person and offers a one-tap send.
  async function remindOwner() {
    if (!data) return;
    setReminding(true);
    const res = await adminRemindTask(data.task.id, remindScope === "all");
    setReminding(false);
    if (!res.ok) { toast(res.error, { tone: "warn", duration: 3500 }); return; }
    toast(`${remindScope === "all" ? "Summary" : "Reminder"} ready for ${getGivenName(res.name)}.`, {
      tone: "success",
      duration: 6000,
      action: res.link ? { label: "Send now", onClick: () => { window.open(res.link!, "_blank"); } } : undefined,
    });
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

  // Inline Overview "add update" — reuses the SAME adminAddUpdate server action as
  // the Conversation tab (no new composer component, no edit to portal-conversation).
  // NOTE (planned): a shared <TaskComposer> should back both this box and
  // PortalConversation's composer — deferred (portal-conversation.tsx is out of
  // scope here; extracting it now risks twin-drift). See T-DRAWER-COMPOSER.
  async function postUpdate(formData: FormData) {
    const body = String(formData.get("body") ?? "").trim();
    if (!body) return; // nothing to post — leave the box untouched
    setPosting(true);
    try {
      await adminAddUpdate(formData);
      // Only clear the textarea once the post resolved without throwing, so a
      // failed post keeps the operator's typed text instead of silently wiping it.
      if (composerRef.current) composerRef.current.value = "";
      setRefreshKey((k) => k + 1);
      router.refresh();
    } catch {
      toast("Couldn't post the update — your text is still here.", { tone: "warn", duration: 4000 });
    } finally {
      setPosting(false);
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

  // Seed the Edit-tab controlled selects whenever the task data (re)loads.
  useEffect(() => {
    if (!data) return;
    setEditCompany(String(data.task.companyId));
    setEditRisk(data.task.risk || "");
    setEditEscalation(data.task.escalation || "No");
  }, [data]);

  const t = data?.task;

  // Copy a stable deep-link to this task (current page + ?task=CODE) to the clipboard.
  async function copyLink() {
    const taskCode = t?.code ?? code;
    if (!taskCode) return;
    const url = `${location.origin}${pathname}?task=${encodeURIComponent(taskCode)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied", { tone: "success", duration: 3000 });
    } catch {
      toast("Couldn't copy the link", { tone: "warn", duration: 3000 });
    }
  }

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

  // The current pinned instruction (if any) — drives the Overview banner.
  const pinnedUpdate = useMemo(
    () => (data?.updates ?? []).filter((u) => u.pinned_at).sort((a, b) => +new Date(b.pinned_at!) - +new Date(a.pinned_at!))[0] ?? null,
    [data],
  );

  const convoCount = data?.convoMessages.length ?? 0;

  const heroNode = t ? (
    <div className="pr-8 space-y-2.5">
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-mono text-[11px] font-medium text-fg-muted px-2 py-0.5 rounded-full bg-bg-subtle/80 ring-1 ring-border/60 shrink-0">{t.code}</span>
        <CompanyDrawerLink id={t.companyId} className="text-xs text-fg-muted hover:text-accent truncate transition-colors text-left">{t.companyName}</CompanyDrawerLink>
        {/* Prev/Next step-through (only when an ordered list was supplied) */}
        {seq.length > 1 && (
          <span className="ml-auto flex items-center gap-1 shrink-0">
            <IconButton size="sm" aria-label="Previous task" disabled={!prevCode} onClick={() => prevCode && goToCode(prevCode)}>
              <ChevronLeft size={15} />
            </IconButton>
            <span className="text-[10px] tabular text-fg-subtle">{seqIdx + 1}/{seq.length}</span>
            <IconButton size="sm" aria-label="Next task" disabled={!nextCode} onClick={() => nextCode && goToCode(nextCode)}>
              <ChevronRight size={15} />
            </IconButton>
          </span>
        )}
      </div>
      <h2 className="text-base font-semibold leading-snug">{t.actionItem}</h2>
      {/* Inline-editable status + priority + deadline — 1 touch, no Edit-tab trip. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <TaskInlineStatus task={t} buttonClassName="rounded-full ring-1 ring-border/60 bg-bg-subtle/70 px-2.5 py-1 text-xs" />
        <TaskInlinePriority task={t} buttonClassName="rounded-full ring-1 ring-border/60 bg-bg-subtle/70 px-2.5 py-1 text-xs" />
        <DeadlineEditor code={t.code} deadline={t.deadline ? new Date(t.deadline) : null} daysToDeadline={t.daysToDeadline}
          className="rounded-full ring-1 ring-border/60 bg-bg-subtle/70 px-2.5 py-1" />
        {t.escalation === "Yes" && <Badge tone="danger">Escalated</Badge>}
      </div>
    </div>
  ) : <div className="h-12" />;

  const overviewContent = t ? (
    <>
      {/* Pinned-instruction banner (info tint) */}
      {pinnedUpdate && (
        <div className="rounded-2xl ring-1 ring-info/30 bg-info-soft/40 p-3.5">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-info">
            <Pin size={12} /> Current instruction
            <button type="button" onClick={() => setActiveTab("conversation")}
              className="ml-auto inline-flex items-center gap-0.5 text-[11px] font-medium normal-case tracking-normal hover:underline">
              Manage <ArrowRight size={11} />
            </button>
          </div>
          <p className="mt-1 text-sm font-medium leading-relaxed whitespace-pre-wrap break-words"><CodeLinkedText text={pinnedUpdate.body} /></p>
        </div>
      )}

      {/* "Waiting on…" chip for Blocked / Waiting External — kit chip so Overview
          matches the row/board (generic fallback; no specific blocker known). */}
      {t.waiting && (
        <div>
          <WaitingOnChip task={t} />
        </div>
      )}

      {/* Facts — a calm hairline list (no hard box); empties invite a tap. */}
      <div className="px-0.5">
        <FactRow label="Accountable">
          {t.assignees.length ? (
            <span className="inline-flex items-center gap-2 min-w-0 align-middle">
              <AssigneeAvatars names={t.assignees} ids={t.assigneeIds} max={4} size={22} />
              <span className="truncate max-w-[12rem] text-[13px] text-fg-muted">{t.assignees.join(", ")}</span>
            </span>
          ) : <SetLink onClick={() => setActiveTab("edit")}>Assign someone</SetLink>}
        </FactRow>
        <FactRow label="Deadline">
          <DeadlineEditor code={t.code} deadline={t.deadline ? new Date(t.deadline) : null} daysToDeadline={t.daysToDeadline} />
        </FactRow>
        <FactRow label="Category">
          {t.category ? <span className="text-[13px] font-medium text-fg">{t.category}</span> : <SetLink onClick={() => setActiveTab("edit")}>Set category</SetLink>}
        </FactRow>
        <FactRow label="Department" last>
          {t.department ? <span className="text-[13px] font-medium text-fg">{t.department}</span> : <SetLink onClick={() => setActiveTab("edit")}>Set department</SetLink>}
        </FactRow>
      </div>


      {/* About — the full description */}
      {t.comments && t.comments.trim() && (
        <div className="px-0.5">
          <div className="text-[10px] uppercase tracking-wider text-fg-subtle mb-1">About</div>
          <p className="text-sm leading-relaxed text-fg whitespace-pre-wrap break-words"><CodeLinkedText text={t.comments} /></p>
        </div>
      )}

      {/* Latest update — a calm hairline block → jump to the full conversation */}
      {t.latestActivity && (
        <div className="px-0.5 pt-3 border-t border-border/50 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-fg-subtle">Latest update</span>
            <button type="button" onClick={() => setActiveTab("conversation")}
              className="ml-auto inline-flex items-center gap-0.5 text-[11px] font-medium text-accent hover:underline">
              View all{convoCount > 0 ? ` ${convoCount}` : ""} <ArrowRight size={11} />
            </button>
          </div>
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 shrink-0 inline-flex items-center justify-center h-7 w-7 rounded-full bg-accent-soft text-accent text-[10px] font-semibold leading-none" aria-hidden>
              {getInitials(t.latestActivity.author)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-xs">
                <span className="font-medium text-fg">{t.latestActivity.author}</span>
                <span className="text-fg-subtle" title={exactTime(t.latestActivity.atISO)}>· {ago(t.latestActivity.atISO)}</span>
              </div>
              {t.latestActivity.kind === "status" ? (
                <p className="mt-0.5 inline-flex items-center gap-1 text-sm text-fg-muted">
                  <ArrowRight size={12} className="text-accent shrink-0" /> moved to {statusTarget(t.latestActivity.body) ?? "a new status"}
                </p>
              ) : (
                <p className="mt-0.5 text-sm leading-relaxed text-fg whitespace-pre-wrap break-words"><CodeLinkedText text={t.latestActivity.body} /></p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Inline add-update box (reuses adminAddUpdate — same action as Conversation) */}
      {!done && (
        <form action={postUpdate} className="rounded-2xl border border-border/60 bg-bg-elev p-3 space-y-2.5 transition-colors focus-within:border-accent/50 focus-within:ring-2 focus-within:ring-accent/15">
          <input type="hidden" name="taskId" value={t.id} />
          <input type="hidden" name="code" value={t.code} />
          <input type="hidden" name="parentUpdateId" value="" />
          <textarea
            ref={composerRef}
            name="body"
            required
            rows={2}
            placeholder="Add a quick update…"
            className="w-full resize-y bg-transparent text-sm placeholder:text-fg-subtle focus:outline-none"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-fg-subtle">@mention, attach or set status? Open Conversation.</span>
            <Button type="submit" size="sm" className="rounded-full shrink-0" loading={posting} disabled={posting}>
              {!posting && <Send size={13} />} Post
            </Button>
          </div>
        </form>
      )}

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

      <div className="flex flex-wrap items-center justify-end gap-2">
        {t.assignees.length > 0 && !done && (
          <>
            <div className="inline-flex items-center gap-0.5 rounded-full bg-bg-subtle/70 p-0.5 ring-1 ring-border text-[11px]">
              {(["task", "all"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setRemindScope(s)}
                  title={s === "task" ? "Remind about this task" : "Remind about all their open tasks"}
                  className={cn("rounded-full px-2 py-0.5 font-medium transition-colors", remindScope === s ? "bg-bg-elev text-fg ring-1 ring-border" : "text-fg-muted hover:text-fg")}
                >
                  {s === "task" ? "This task" : "All tasks"}
                </button>
              ))}
            </div>
            <Button type="button" variant="ghost" size="sm" className="rounded-full" onClick={remindOwner} loading={reminding} disabled={reminding}>
              {!reminding && <Bell size={13} />} Remind {getGivenName(t.assignees[0])}
            </Button>
          </>
        )}
        <Button type="button" variant="ghost" size="sm" className="rounded-full" onClick={copyLink}>
          <LinkIcon size={13} /> Copy link
        </Button>
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
        <div className="-mx-1 mb-3 overflow-x-auto px-1">
          <Segmented<TimelineFilter>
            size="sm"
            value={filter}
            onChange={setFilter}
            options={(Object.keys(FILTER_LABELS) as TimelineFilter[])
              .filter((f) => f === "all" || counts[f] > 0)
              .map((f) => ({ value: f, label: `${FILTER_LABELS[f]} ${counts[f]}` }))}
          />
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
          <input type="hidden" name="companyId" value={editCompany} />
          <FluidSelect
            value={editCompany}
            onSelect={setEditCompany}
            options={data.companies.map((c) => ({ value: String(c.id), label: c.name }))}
            className="w-full"
            buttonClassName="w-full justify-between"
          />
          <p className="text-[10.5px] text-fg-subtle leading-snug">Changing this issues a new code; the old one keeps redirecting.</p>
        </Field>
      </EditCard>

      <EditCard title="Details">
        <div className="grid grid-cols-2 gap-x-2.5 gap-y-2.5">
          <Field label="Status"><Select name="status" defaultValue={t.status}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</Select></Field>
          <Field label="Priority"><Select name="priority" defaultValue={t.priority}>{PRIORITIES.map((s) => <option key={s}>{s}</option>)}</Select></Field>
          <Field label="Risk">
            <input type="hidden" name="risk" value={editRisk} />
            <FluidSelect
              value={editRisk}
              onSelect={setEditRisk}
              placeholder="—"
              options={[{ value: "", label: "—" }, ...RISKS.map((s) => ({ value: s, label: s }))]}
              className="w-full"
              buttonClassName="w-full justify-between"
            />
          </Field>
          <Field label="Escalation">
            <input type="hidden" name="escalation" value={editEscalation} />
            <FluidSelect
              value={editEscalation}
              onSelect={setEditEscalation}
              options={[{ value: "No", label: "No" }, { value: "Yes", label: "Yes" }]}
              className="w-full"
              buttonClassName="w-full justify-between"
            />
          </Field>
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
    { id: "conversation", label: "Conversation", icon: <MessageSquare size={14} />, badge: convoCount || undefined, content: conversationContent },
    { id: "history", label: "History", icon: <History size={14} />, badge: counts.all || undefined, content: historyContent },
    { id: "edit", label: "Edit", icon: <Pencil size={14} />, content: editContent },
  ] : [];

  const actionBar = t ? (
    <div className="space-y-2">
      {confirmDel && (
        <div className="flex items-center gap-2 rounded-xl bg-danger-soft/50 ring-1 ring-danger/25 px-3 py-1.5 text-xs">
          <Trash2 size={14} className="text-danger shrink-0" />
          <span className="min-w-0 flex-1">Delete this task permanently?</span>
          <Button type="button" onClick={() => setConfirmDel(false)} variant="ghost" size="sm" className="shrink-0">Cancel</Button>
          <Button type="button" onClick={handleDelete} disabled={acting === "delete"} loading={acting === "delete"} variant="danger" size="sm" className="shrink-0">
            Delete
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

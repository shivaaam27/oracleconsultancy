"use client";

import { PersonFace } from "@/components/studio/face";
import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { EntityDrawer, type DrawerTab } from "./entity-drawer";
import { RecordBody, RecordSidebarBlock } from "./record-page";
import { taskHref } from "@/lib/task-href";
import { canStepBack, clearPush, returnLabel, safeReturn } from "@/lib/return-to";
import { cachedTaskDetail, prefetchTaskDetail, storeTaskDetail } from "@/lib/task-detail-cache";
import { buildSections } from "./entity-cells";
import { ENTITY_VIEWS } from "@/lib/entity-view";
import { SectionCard } from "./drawer-kit";
import { CompanyDrawerLink } from "./company-drawer-link";
import { TimelineEntry } from "./timeline-entry";
import {
  History, LayoutDashboard, MessageSquare, Pencil, Save, StickyNote,
  CheckCircle2, RotateCcw, AlertOctagon, Trash2, ArrowRight, Pin,
  ChevronLeft, ChevronRight, Send, Link as LinkIcon, Bell, Archive, ArchiveRestore, MoreHorizontal, Repeat,
} from "lucide-react";
import { StudioScope, stBtn } from "./studio/kit";
import { StudioOops } from "./studio/oops";
import { StudioStatusCell, StudioPriorityCell } from "./studio/tasks/cells";
import { StudioDetails } from "./studio/tasks/details";
import { DateInput } from "./date-input";
import { useFitFrame } from "./studio/use-fit-frame";
import { avatarTint, initials as studioInitials } from "./studio/tasks/task-words";
import { DeadlineEditor } from "./deadline-editor";
import { CodeLinkedText } from "./code-linked-text";
import { AssigneeAvatars } from "./assignee-avatars";
import { Badge, Textarea, Button, IconButton } from "./ui";
import { SelectField } from "./select-field";
import { FormSwitch } from "./form-switch";
import { Combobox } from "./combobox";
import { PolishedInput } from "./polished-input";
import { PersonPicker } from "./person-picker";
import { TaskSubtasks } from "@/components/studio/subtasks";
import { listSubtasks } from "@/app/task/subtask-actions";
import { PortalConversation, type ConvoMessage, type ConvoEvent } from "./portal-conversation";
import { TaskInlineStatus, TaskInlinePriority } from "./task-inline-edit";
import { WaitingOnChip } from "./task-meta-line";
import { Segmented } from "./macos";
import { SimilarTasks } from "./similar-tasks";
import { DraftEmailButton } from "./draft-email-button";
import { useToast } from "./toast";
import { callUndo } from "./undo-banner";
import { inlineUpdateTask, deleteTaskQuick, adminAddUpdate, adminTogglePin, updateTask, adminRemindTask, setTaskArchived, copyTaskToCompany, adminEditUpdate, adminDeleteUpdate, restoreTaskUpdate } from "@/app/task/actions";
import { TaskCopyToCompanies, type CopyActions } from "@/components/task-copy-companies";
import { setTaskRecurrence, stopTaskRecurrence } from "@/app/task/recurring-actions";
import { RecurringTaskSheet, draftFromRule, scheduleLabel, BLANK as BLANK_RULE } from "@/components/portal-recurring-tasks";
import type { RecurringTaskRule } from "@/lib/recurring-task-rules";
import { getGivenName, getInitials } from "@/lib/names";
import { STATUSES, PRIORITIES, RISKS, CATEGORIES } from "@/lib/constants";
import {
  sortTimeline, mergeStatusIntoUpdates, suppressUpdateMetaAudits,
  groupFieldEdits, liftPinnedUpdates, applyTimelineFilter,
  type TimelineItem, type TimelineFilter,
} from "@/lib/timeline";
import type { TaskRow } from "@/lib/queries";
import { LinkedNotesTab } from "./linked-notes";
import { cn } from "@/lib/cn";

type DrawerUpdate = { id: number; body: string; created_at: string; created_by: string | null; edited_at: string | null; original_body: string | null; pinned_at: string | null; parent_update_id?: number | null; attachment_document_id?: number | null };
type DrawerAudit = { id: number; field: string | null; old_value: string | null; new_value: string | null; change_reason: string | null; entry_type: string | null; created_at: string; created_by: string | null };
type DrawerData = {
  /** The owner is reading (Notes are theirs alone). */
  ownerView?: boolean;
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
  departments: string[];
  /** The standing rule this task came from; null = it does not repeat. */
  recurrence: RecurringTaskRule | null;
};

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

/** Single labelled control on the Edit tab. */
function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  /* Label and control sit at the BOTTOM of the cell so a row of fields lines
     up whatever the labels do (the same rule every CocoZuri form follows). */
  return (
    <div className={cn("flex h-full min-w-0 flex-col justify-end", className)}>
      <label data-field-label className="mb-1.5 block text-xs font-medium uppercase tracking-[0.08em] text-fg-muted">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs leading-snug text-fg-subtle">{hint}</p>}
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

/** The task record's field grid is defined in metadata, not here (Stage 3). */
const TASK_FORM_SECTIONS = ENTITY_VIEWS.task!.formSections ?? [];

/** Muted "Set …" placeholder that jumps to the Edit tab. */
function SetLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="text-base text-fg-subtle hover:text-accent transition-colors">
      {children}
    </button>
  );
}

/**
 * ONE task record, in two frames (Stage 2 of the ERPNext redesign).
 *
 * `mode="page"`  → a real record screen at /task/CODE, built on `RecordPage`.
 *                  This is the owner's chosen behaviour: a record is a page
 *                  with its own URL, exactly as ERPNext does it.
 * `mode="drawer"`→ the same record inside the sliding drawer, kept so that old
 *                  `?task=CODE` links (emails, notifications, anything already
 *                  sent out) still open something instead of 404-ing.
 *
 * Everything between here and the return statement is shared — one record, one
 * set of actions, no second implementation to drift.
 */
/** What a button says when the server could not be reached at all. */
const NET_FAIL = "That didn't go through — check the connection and try again.";

function TaskRecord({ mode, codeProp, stamp }: { mode: "drawer" | "page"; codeProp?: string; stamp?: number }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  // On the page the ADDRESS names the task, not the server prop: stepping to
  // the next task changes the address in place (see goToCode), with no trip to
  // the server, so the prop is only right for the task you arrived on.
  const pathCode = mode === "page" ? /^\/task\/([^/?#]+)/.exec(pathname)?.[1] : undefined;
  const code = mode === "page" ? (pathCode ? decodeURIComponent(pathCode) : (codeProp ?? null)) : searchParams.get("task");
  const refreshNonce = searchParams.get("tr");
  // Optional ordered code list for Prev/Next triage. Any view can opt a row into
  // step-through by adding `&tl=DS-001,DS-002,…` when it opens the record; absent
  // here, the arrows simply don't render (no-op-safe).
  const tlParam = searchParams.get("tl");
  // What the way out should be CALLED — the list that opened this record.
  const backTo = safeReturn(searchParams.get("back"));
  const backLabel = backTo ? returnLabel(backTo) : "Tasks";
  const isTaskPage = /^\/task\//.test(pathname);
  const open = mode === "page" ? true : (!!code && !isTaskPage);

  // Drawn from the copy in memory when there is one — the side panel, the
  // hovered row or the step before already read it — so the record appears
  // at once instead of saying "Loading…" (lib/task-detail-cache.ts).
  const [data, setData] = useState<DrawerData | null>(() => cachedTaskDetail<DrawerData>(code));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [acting, setActing] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  // Phone: the header's other actions live in a sheet (mockup M_Task).
  const [moreOpen, setMoreOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  // Subtasks: the count on the tab, read once per task (the tab keeps it live).
  const [subCount, setSubCount] = useState<{ done: number; total: number } | null>(null);
  const subTaskId = data?.task?.id ?? null;
  useEffect(() => {
    if (subTaskId == null || mode !== "page") return;
    let live = true;
    listSubtasks(subTaskId).then((l) => { if (live) setSubCount({ done: l.filter((x) => x.done).length, total: l.length }); }).catch(() => {});
    return () => { live = false; };
  }, [subTaskId, mode]);
  const [filter, setFilter] = useState<TimelineFilter>("all");
  const [posting, setPosting] = useState(false);
  const [reminding, setReminding] = useState(false);
  const [remindScope, setRemindScope] = useState<"task" | "all">("task");
  // Studio record: the three columns fill the frame and scroll inside
  // themselves — the page itself does not scroll (from lg up).
  const studioGridRef = useRef<HTMLDivElement>(null);
  useFitFrame(studioGridRef, { enabled: mode === "page" && !!data, deps: [data?.task.code] });
  // Decision-strip re-date popover (inline date input, no Edit-tab trip).
  const [redating, setRedating] = useState(false);
  const [newDate, setNewDate] = useState("");
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();
  // Which task is on screen — so the loader can tell a refresh of this task
  // from a step to another one.
  const shownCode = useRef<string | null>(data ? code : null);

  // Prev/Next stepping through an ordered code list (if the opener supplied one).
  const seq = useMemo(() => (tlParam ? tlParam.split(",").map((c) => c.trim()).filter(Boolean) : []), [tlParam]);
  const seqIdx = code ? seq.indexOf(code) : -1;
  const prevCode = seqIdx > 0 ? seq[seqIdx - 1] : null;
  const nextCode = seqIdx >= 0 && seqIdx < seq.length - 1 ? seq[seqIdx + 1] : null;

  const goToCode = useCallback((next: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("tr");
    if (mode === "page") {
      // Each task is still its own URL — but stepping changes the address IN
      // PLACE rather than asking the server for a page it has nothing new to say
      // about (the record reads itself). With the next task read ahead, the
      // step is instant. Next keeps usePathname and Back in step with it.
      const q = params.toString();
      window.history.pushState(null, "", q ? `/task/${encodeURIComponent(next)}?${q}` : `/task/${encodeURIComponent(next)}`);
      return;
    }
    params.set("task", next);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }, [mode, pathname, router, searchParams]);

  const close = useCallback(() => {
    if (mode === "page") {
      /* ⚠️ BACK TO THE LIST YOU CAME FROM, not to a bare `/?tab=tasks`.
       * The hub's filters, sort and chosen view live in its address, so a fixed
       * one threw the lot away and pushed a fresh entry on top — the same fault
       * the portal had. `?back=` is put there by whatever opened the record
       * (`RecordList` does it for every list); absent, the old address is still
       * the fallback. REPLACE either way, so the browser's Back never walks
       * forward into the task you just left. */
      const home = safeReturn(searchParams.get("back")) ?? "/?tab=tasks";
      /* A true history step where it provably is one — the browser restores the
       * scroll with it, exactly, which no forward navigation can. Anything else
       * (a bookmark, a step sideways through Prev/Next) replaces, which always
       * lands on the right page. Same rule as `components/back-link.tsx`. */
      if (canStepBack()) { clearPush(); router.back(); return; }
      router.replace(home);
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.delete("task");
    params.delete("tr");
    params.delete("tl");
    params.delete("dtab");
    const q = params.toString();
    router.push(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }, [mode, pathname, router, searchParams]);

  // Seed the active tab from the `dtab` URL param so openers can deep-link a tab
  // (e.g. table-view openTask(code,"conversation") sets ?dtab=conversation). A
  // drawer-specific name, NOT "tab" (which selects the page section). The ids
  // here must match the DrawerTab ids below. Falls back to Conversation — the
  // task view is conversation-first (Administrator unification, owner-approved).
  useEffect(() => {
    setActiveTab(searchParams.get("dtab") ?? "conversation");
    setConfirmDel(false);
    setFilter("all");
    setRedating(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  async function quickAction(kind: "complete" | "escalate") {
    if (!data) return;
    setActing(kind);
    const isDone = data.task.status === "Completed" || data.task.status === "Closed";
    // A dropped connection throws; without the catch every button stayed
    // disabled (`acting` never cleared) and nothing was said.
    const offline = () => ({ ok: false as const, error: NET_FAIL, undoToken: undefined });
    const res = kind === "complete"
      ? await inlineUpdateTask(data.task.code, "status", isDone ? "In Progress" : "Completed").catch(offline)
      : await inlineUpdateTask(data.task.code, "escalation", "Yes").catch(offline);
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
  async function remindOwner() { await remindAbout(remindScope); }
  // Studio's People panel has one button per scope, so the scope is passed in.
  async function remindAbout(scope: "task" | "all") {
    if (!data) return;
    setReminding(true);
    const res = await adminRemindTask(data.task.id, scope === "all").catch(() => ({ ok: false as const, error: NET_FAIL }));
    setReminding(false);
    if (!res.ok) { toast(res.error, { tone: "warn", duration: 3500 }); return; }
    toast(`${scope === "all" ? "Summary" : "Reminder"} ready for ${getGivenName(res.name)}.`, {
      tone: "success",
      duration: 6000,
      action: res.link ? { label: "Send now", onClick: () => { window.open(res.link!, "_blank"); } } : undefined,
    });
  }

  // Decision-strip re-date — same inlineUpdateTask as everywhere else.
  async function applyRedate() {
    if (!data || !newDate) return;
    setActing("redate");
    const res = await inlineUpdateTask(data.task.code, "deadline", newDate).catch(() => ({ ok: false as const, error: NET_FAIL, undoToken: undefined }));
    setActing(null);
    if (res.ok) {
      setRedating(false);
      setNewDate("");
      toast(`${data.task.code} re-dated.`, { tone: "success", duration: 5000, action: res.undoToken ? { label: "Undo", onClick: async () => { await callUndo(res.undoToken!); setRefreshKey((k) => k + 1); router.refresh(); } } : undefined });
      setRefreshKey((k) => k + 1);
      router.refresh();
    } else {
      toast(res.error || "Could not re-date", { tone: "warn", duration: 3000 });
    }
  }

  // Repeats — the rule this task came from, changeable from here. "Stop" asks
  // twice: it switches the rule off for every occurrence, not just this one.
  const [repeatOpen, setRepeatOpen] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const [repeatBusy, setRepeatBusy] = useState(false);
  const repeatDraft = useMemo(() => {
    if (!data) return BLANK_RULE;
    if (data.recurrence) return draftFromRule(data.recurrence, data.companies, data.people);
    const t = data.task;
    return {
      ...BLANK_RULE,
      title: t.actionItem,
      companyName: t.companyName,
      priority: ["Critical", "High", "Medium", "Low"].includes(t.priority) ? t.priority : "Medium",
      assigneeNames: t.assignees,
      description: t.comments ?? "",
    };
  }, [data]);
  async function saveRepeat(input: Parameters<typeof setTaskRecurrence>[1]) {
    if (!data) return;
    setRepeatBusy(true);
    const res = await setTaskRecurrence(data.task.id, input).catch(() => ({ ok: false as const, error: NET_FAIL }));
    setRepeatBusy(false);
    if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
    toast(data.recurrence ? "Repeat changed." : `${data.task.code} now repeats.`, { tone: "success" });
    setRepeatOpen(false);
    setRefreshKey((k) => k + 1);
    router.refresh();
  }
  async function stopRepeat() {
    if (!data) return;
    setRepeatBusy(true);
    const res = await stopTaskRecurrence(data.task.id).catch(() => ({ ok: false as const, error: NET_FAIL }));
    setRepeatBusy(false);
    setConfirmStop(false);
    if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
    toast("Stopped repeating. Tasks already made are untouched.", { tone: "success" });
    setRefreshKey((k) => k + 1);
    router.refresh();
  }

  // Archive is the normal way to put a task away; delete is the last resort.
  const [archiving, setArchiving] = useState(false);
  async function toggleArchived() {
    if (!data) return;
    const next = !data.task.archived;
    setArchiving(true);
    const res = await setTaskArchived(data.task.code, next).catch(() => ({ ok: false as const, error: NET_FAIL }));
    setArchiving(false);
    if (!res.ok) { toast(res.error || "Could not change it.", { tone: "danger" }); return; }
    toast(next ? `${data.task.code} archived.` : `${data.task.code} restored.`, {
      tone: "success", duration: 8000,
      action: { label: "Undo", onClick: async () => { await setTaskArchived(data.task.code, !next); setRefreshKey((k) => k + 1); router.refresh(); } },
    });
    setRefreshKey((k) => k + 1);
    router.refresh();
  }
  const copyActions: CopyActions = useMemo(() => ({
    copy: (taskId, companyId) => copyTaskToCompany(data?.task.code ?? "", companyId),
    // A copy made a moment ago is archived, not deleted — same as the portal.
    undo: async (_taskId, code) => {
      const r = await setTaskArchived(code, true);
      return r.ok ? {} : { error: r.error };
    },
  }), [data?.task.code]);

  async function handleDelete() {
    if (!data) return;
    setActing("delete");
    const res = await deleteTaskQuick(data.task.code).catch(() => ({ ok: false as const, error: NET_FAIL, undoToken: undefined }));
    setActing(null);
    if (res.ok) {
      const c = data.task.code;
      // deleteTaskQuick already revalidated the list; the navigation fetches it
      // fresh, so no extra refresh of the page we are leaving.
      close();
      toast(`${c} deleted`, { tone: "success", duration: 10000, action: res.undoToken ? { label: "Undo", onClick: async () => { const r = await callUndo(res.undoToken!); toast(r.message, { tone: r.ok ? "success" : "warn", duration: 3000 }); router.refresh(); } } : undefined });
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
    // The DRAWER must stay quiet on /task/CODE (the page owns the record there);
    // the PAGE is the record, so it always loads. Before records became pages
    // this read `if (!code || isTaskPage)`, which left the new page empty.
    if (!code || (mode === "drawer" && isTaskPage)) { setData(null); return; }
    // A different task: show its copy from memory at once if there is one,
    // else clear — never leave the LAST task on screen under the new address.
    // The fetch below always runs, and swaps in the fresh copy when it lands.
    if (shownCode.current !== code) {
      shownCode.current = code;
      const hit = cachedTaskDetail<DrawerData>(code);
      setData(hit);
      setLoading(!hit);
    } else {
      setLoading(true);
    }
    setError(false);
    let live = true;
    fetch(`/api/task-detail?code=${encodeURIComponent(code)}`)
      .then((r) => { if (!r.ok) throw new Error("not found"); return r.json(); })
      .then((d: DrawerData) => { storeTaskDetail(code, d); if (live) { setData(d); setLoading(false); } })
      .catch(() => { if (live) { setError(true); setLoading(false); } });
    return () => { live = false; };
  // `stamp` changes whenever the server draws the page again — i.e. on every
  // router.refresh(). The in-place editors (status, priority and deadline on
  // the band and in Details, the blocker, an Undo from a toast) only call
  // router.refresh(); without this the page kept showing the OLD value after a
  // change that had saved.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, refreshKey, refreshNonce, isTaskPage, mode, stamp]);

  // Read the tasks either side ahead of time, so ‹ › is instant.
  useEffect(() => { prefetchTaskDetail(prevCode); prefetchTaskDetail(nextCode); }, [prevCode, nextCode]);

  const t = data?.task;

  // Copy the record's own permanent URL. A record is a page now, so the link is
  // /task/CODE — not "whatever page you happened to be on, plus ?task=".
  async function copyLink() {
    const taskCode = t?.code ?? code;
    if (!taskCode) return;
    const url = `${location.origin}${taskHref(taskCode)}`;
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

  // ---- Decision strip (D3) — the Focus queue's four moves, pinned on top of a
  // task that needs attention (late OR quiet 7d+). Healthy tasks show nothing:
  // the strip is for action, not decoration. ----
  const lateDays = t && typeof t.daysToDeadline === "number" && t.daysToDeadline < 0 ? Math.abs(t.daysToDeadline) : 0;
  const quietDays = t?.lastUpdatedAt ? Math.floor((Date.now() - new Date(t.lastUpdatedAt).getTime()) / 86_400_000) : null;
  const needsAttention = !!t && !done && (lateDays > 0 || (quietDays !== null && quietDays >= 7) || quietDays === null);
  const decisionStrip = t && needsAttention ? (
    <div className="rounded-lg border border-danger/20 bg-danger-soft/25 p-2.5">
      <p className="flex items-center gap-1.5 px-0.5 text-xs font-medium text-danger">
        <AlertOctagon size={12} className="shrink-0" />
        {lateDays > 0 && <span>{lateDays}d late</span>}
        {lateDays > 0 && (quietDays === null || quietDays >= 7) && <span aria-hidden>·</span>}
        {quietDays === null ? <span>never updated</span> : quietDays >= 7 ? <span>quiet {quietDays}d</span> : null}
      </p>
      {redating && (
        <div className="mt-2 flex items-center gap-2 px-0.5">
          <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)}
            className="rounded-lg border border-border bg-bg-elev px-2 py-1 text-xs" />
          <Button type="button" size="sm" className="rounded-lg" onClick={applyRedate} disabled={!newDate || acting === "redate"} loading={acting === "redate"}>
            Set date
          </Button>
          <button type="button" onClick={() => setRedating(false)} className="text-xs text-fg-muted hover:text-fg">Cancel</button>
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {t.assignees.length > 0 && (
          <Button type="button" size="sm" className="rounded-lg" onClick={remindOwner} loading={reminding} disabled={reminding}>
            {!reminding && <Bell size={12} />} Remind
          </Button>
        )}
        {t.escalation !== "Yes" && (
          <Button type="button" variant="danger-soft" size="sm" className="rounded-lg" onClick={() => quickAction("escalate")} loading={acting === "escalate"} disabled={acting !== null}>
            {acting !== "escalate" && <AlertOctagon size={12} />} Escalate
          </Button>
        )}
        <Button type="button" variant="ghost" size="sm" className="rounded-lg" onClick={() => setRedating((s) => !s)}>
          Re-date
        </Button>
        <Button type="button" variant="ghost" size="sm" className="rounded-lg text-success" onClick={() => quickAction("complete")} loading={acting === "complete"} disabled={acting !== null}>
          {acting !== "complete" && <CheckCircle2 size={12} />} Done
        </Button>
      </div>
    </div>
  ) : null;

  const heroNode = t ? (
    <div className="pr-8 space-y-2.5">
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-mono text-xs font-medium text-fg-muted px-2 py-0.5 rounded-full bg-bg-subtle/80 ring-1 ring-border/60 shrink-0">{t.code}</span>
        <CompanyDrawerLink id={t.companyId} className="text-xs text-fg-muted hover:text-accent truncate transition-colors text-left">{t.companyName}</CompanyDrawerLink>
        {/* Prev/Next step-through (only when an ordered list was supplied) */}
        {seq.length > 1 && (
          <span className="ml-auto flex items-center gap-1 shrink-0">
            <IconButton size="sm" aria-label="Previous task" disabled={!prevCode} onClick={() => prevCode && goToCode(prevCode)}>
              <ChevronLeft size={15} />
            </IconButton>
            <span className="text-xs tabular text-fg-subtle">{seqIdx + 1}/{seq.length}</span>
            <IconButton size="sm" aria-label="Next task" disabled={!nextCode} onClick={() => nextCode && goToCode(nextCode)}>
              <ChevronRight size={15} />
            </IconButton>
          </span>
        )}
      </div>
      <h2 className="text-base font-semibold leading-snug">{t.actionItem}</h2>
      {/* Inline-editable status + priority + deadline — 1 touch, no Edit-tab trip. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <TaskInlineStatus task={t} buttonClassName="rounded-lg ring-1 ring-border/60 bg-bg-subtle/70 px-2.5 py-1 text-xs" />
        <TaskInlinePriority task={t} buttonClassName="rounded-lg ring-1 ring-border/60 bg-bg-subtle/70 px-2.5 py-1 text-xs" />
        <DeadlineEditor code={t.code} deadline={t.deadline ? new Date(t.deadline) : null} daysToDeadline={t.daysToDeadline}
          className="rounded-lg ring-1 ring-border/60 bg-bg-subtle/70 px-2.5 py-1" />
        {t.escalation === "Yes" && <Badge tone="danger">Escalated</Badge>}
      </div>
      {decisionStrip}
    </div>
  ) : <div className="h-12" />;

  const overviewContent = t ? (
    <>
      {/* Pinned-instruction banner (info tint) */}
      {pinnedUpdate && (
        <div className="rounded-lg border border-info/30 bg-info-soft/40 p-3.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-info">
            <Pin size={12} /> Current instruction
            <button type="button" onClick={() => setActiveTab("conversation")}
              className="ml-auto inline-flex items-center gap-0.5 text-xs font-medium normal-case tracking-normal hover:underline">
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

      {/* The record body — the SAME shell every record uses (Stage 2): titled
          sections in a two-column field grid on the left, the "who and where"
          sidebar on the right. The drawer supplies the header and tabs, so this
          uses RecordBody; a full record page would use RecordPage and get an
          identical layout. */}
      <RecordBody
        /* Stage 3: the fields, their labels, order and formatting come from
           ENTITY_VIEWS.task.formSections. Only the cells that need to DO
           something (edit a date, prompt when empty) are overridden. */
        sections={buildSections(TASK_FORM_SECTIONS, t as unknown as Record<string, unknown>, {
          deadline: () => (
            <DeadlineEditor code={t.code} deadline={t.deadline ? new Date(t.deadline) : null} daysToDeadline={t.daysToDeadline} />
          ),
          category: () => (t.category
            ? <span className="font-medium">{t.category}</span>
            : <SetLink onClick={() => setActiveTab("edit")}>Set category</SetLink>),
          department: () => (t.department
            ? <span className="font-medium">{t.department}</span>
            : <SetLink onClick={() => setActiveTab("edit")}>Set department</SetLink>),
          ...(t.comments && t.comments.trim()
            ? { comments: () => (
                <p className="whitespace-pre-wrap break-words leading-relaxed">
                  <CodeLinkedText text={t.comments!} />
                </p>
              ) }
            : {}),
        })}
        sidebar={
          <>
            <RecordSidebarBlock title="Accountable">
              {t.assignees.length ? (
                <span className="inline-flex min-w-0 items-center gap-2 align-middle">
                  <AssigneeAvatars names={t.assignees} ids={t.assigneeIds} max={4} size={22} />
                  <span className="max-w-[10rem] truncate text-fg-muted">{t.assignees.join(", ")}</span>
                </span>
              ) : <SetLink onClick={() => setActiveTab("edit")}>Assign someone</SetLink>}
            </RecordSidebarBlock>
            <RecordSidebarBlock title="Repeats">
              {data.recurrence ? (
                <div className="space-y-1.5">
                  <p className="text-fg">
                    {scheduleLabel(data.recurrence)}
                    {data.recurrence.paused ? <span className="ml-1.5 text-fg-muted">· switched off</span> : null}
                  </p>
                  {confirmStop ? (
                    <p className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-fg-muted">Stop every future copy?</span>
                      <button type="button" onClick={stopRepeat} disabled={repeatBusy} className="font-medium text-danger hover:underline">Stop repeating</button>
                      <button type="button" onClick={() => setConfirmStop(false)} className="text-fg-muted hover:text-fg">Keep</button>
                    </p>
                  ) : (
                    <p className="flex flex-wrap items-center gap-3 text-xs">
                      <SetLink onClick={() => setRepeatOpen(true)}>Change how it repeats</SetLink>
                      <button type="button" onClick={() => setConfirmStop(true)} className="text-fg-muted hover:text-danger">Stop</button>
                    </p>
                  )}
                </div>
              ) : (
                <SetLink onClick={() => setRepeatOpen(true)}>Make this task repeat</SetLink>
              )}
            </RecordSidebarBlock>
          </>
        }
      />

      {/* Latest update — a calm hairline block → jump to the full conversation */}
      {t.latestActivity && (
        <div className="px-0.5 pt-3 border-t border-border/50 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wider text-fg-subtle">Latest update</span>
            <button type="button" onClick={() => setActiveTab("conversation")}
              className="ml-auto inline-flex items-center gap-0.5 text-xs font-medium text-accent hover:underline">
              View all{convoCount > 0 ? ` ${convoCount}` : ""} <ArrowRight size={11} />
            </button>
          </div>
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 shrink-0 inline-flex items-center justify-center h-7 w-7 rounded-full bg-accent-soft text-accent text-xs font-semibold leading-none" aria-hidden>
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
        <form action={postUpdate} className="rounded-lg border border-border bg-bg-elev p-3 space-y-2.5 transition-colors focus-within:border-accent/50">
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
            <span className="text-xs text-fg-subtle">@mention, attach or set status? Open Conversation.</span>
            <Button type="submit" size="sm" className="shrink-0" loading={posting} disabled={posting}>
              {!posting && <Send size={13} />} Post
            </Button>
          </div>
        </form>
      )}

      <SimilarTasks query={t.actionItem} excludeId={t.id} />

      <div className="flex flex-wrap items-center justify-end gap-2">
        {t.assignees.length > 0 && !done && (
          <>
            <div className="inline-flex items-center gap-0.5 rounded-md bg-bg-subtle p-0.5 ring-1 ring-border text-xs">
              {(["task", "all"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setRemindScope(s)}
                  title={s === "task" ? "Remind about this task" : "Remind about all their open tasks"}
                  className={cn("rounded px-2 py-0.5 font-medium transition-colors", remindScope === s ? "bg-bg-elev text-fg ring-1 ring-border" : "text-fg-muted hover:text-fg")}
                >
                  {s === "task" ? "This task" : "All tasks"}
                </button>
              ))}
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={remindOwner} loading={reminding} disabled={reminding}>
              {!reminding && <Bell size={13} />} Remind {getGivenName(t.assignees[0])}
            </Button>
          </>
        )}
        <Button type="button" variant="ghost" size="sm" onClick={copyLink}>
          <LinkIcon size={13} /> Copy link
        </Button>
        <DraftEmailButton taskId={t.id} />
      </div>
    </>
  ) : null;

  const conversationContent = t && data ? (
    // Conversation-first with the Dossier split (D2): on a wide screen a compact
    // facts rail sits beside the chat — zero taps to the essentials; on mobile
    // the rail hides (facts live one tap away on the Details tab).
    // A conversation post (add / pin / status) runs as a server-action form;
    // PortalConversation fires onPosted when it resolves, so we refetch exactly
    // then — no fixed 0.7s guess that could miss a slow upload.
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_240px] lg:gap-4 lg:items-start">
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
      {/* The facts rail sits on the RIGHT, like every other record's sidebar
          (RecordPage puts sections left, sidebar right) and like the Details tab
          right here. It used to sit on the left, which made the record read
          differently depending on which tab you were on. */}
      <aside className="hidden lg:block overflow-hidden rounded-xl border border-border bg-bg-elev">
        <div className="border-b border-border bg-bg-subtle px-3 py-1.5">
          <span className="text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">At a glance</span>
        </div>
        <div className="space-y-1 px-3 py-2.5">
        <FactRow label="Accountable">
          {t.assignees.length ? (
            <span className="inline-flex items-center gap-1.5 min-w-0 align-middle">
              <AssigneeAvatars names={t.assignees} ids={t.assigneeIds} max={3} size={20} />
              <span className="truncate max-w-[7rem] text-sm text-fg-muted">{getGivenName(t.assignees[0])}{t.assignees.length > 1 ? ` +${t.assignees.length - 1}` : ""}</span>
            </span>
          ) : <SetLink onClick={() => setActiveTab("edit")}>Assign</SetLink>}
        </FactRow>
        <FactRow label="Deadline">
          <DeadlineEditor code={t.code} deadline={t.deadline ? new Date(t.deadline) : null} daysToDeadline={t.daysToDeadline} />
        </FactRow>
        <FactRow label="Category">
          {t.category ? <span className="text-sm font-medium text-fg">{t.category}</span> : <SetLink onClick={() => setActiveTab("edit")}>Set</SetLink>}
        </FactRow>
        <FactRow label="Department" last>
          {t.department ? <span className="text-sm font-medium text-fg">{t.department}</span> : <SetLink onClick={() => setActiveTab("edit")}>Set</SetLink>}
        </FactRow>
        {t.comments && t.comments.trim() && (
          <div className="pt-2">
            <div className="text-xs uppercase tracking-wider text-fg-subtle mb-1">About</div>
            <p className="text-sm leading-relaxed text-fg-muted whitespace-pre-wrap break-words line-clamp-6"><CodeLinkedText text={t.comments} /></p>
          </div>
        )}
        <div className="pt-2 flex flex-wrap gap-1.5">
          <Button type="button" variant="ghost" size="sm" onClick={copyLink}>
            <LinkIcon size={12} /> Link
          </Button>
          <DraftEmailButton taskId={t.id} />
        </div>
        </div>
      </aside>
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
    /* ⚠️ THE WEB FORM IS A FULL REPLACE (see updateTask): every field it owns
       is submitted, blanks included. So a control must never be "absent" here
       — a missing hidden input would CLEAR that field on save.

       Desk, matching the New Task form: one card, two-column grid, the ONE
       control box, no native <select>, and Category / Department offered from
       their lists rather than typed free. `key` re-seeds every self-managed
       control (SelectField, Combobox, FormSwitch hold their own state) when
       the record reloads, so a save never leaves stale values in the boxes. */
    <form
      key={`${t.code}-${refreshKey}`}
      action={updateTask.bind(null, t.code)}
      className="space-y-3"
    >
      {/* Where to land after saving. On the page that is the page itself; the
          legacy drawer goes back to whatever page it was opened over. `tr`
          is a nonce the record re-fetches on.
          ⚠️ ON THE PAGE, KEEP THE REST OF THE ADDRESS. `back` is the filtered
          list this record was opened from and `tl` is its Prev/Next order; a
          bare `?tr=` threw both away, so the first "‹ Tasks" after a save
          landed on the unfiltered list — the owner's "it resets the filter". */}
      <input
        type="hidden"
        name="returnTo"
        value={mode === "page"
          ? (() => {
              const keep = new URLSearchParams(searchParams.toString());
              keep.delete("tr");
              keep.set("tr", String(Date.now()));
              return `${taskHref(t.code)}?${keep.toString()}`;
            })()
          : `${pathname}?task=${encodeURIComponent(t.code)}&tr=${Date.now()}`}
      />

      <div className="rounded-lg border border-border bg-bg-elev">
        <div className="space-y-4 p-4 sm:p-5">
          <Field label="Action item">
            <PolishedInput name="actionItem" defaultValue={t.actionItem} required />
          </Field>
          <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
            <Field label="Company" hint="Changing this issues a new code; the old one keeps redirecting.">
              <SelectField name="companyId" defaultValue={String(t.companyId)} options={data.companies.map((c) => ({ value: String(c.id), label: c.name }))} />
            </Field>
            <Field label="Accountable">
              <PersonPicker people={data.people} defaultNames={t.assignees} placeholder="Search people, or type a new name…" />
            </Field>
            <Field label="Status">
              <SelectField name="status" defaultValue={t.status} options={STATUSES.map((s) => ({ value: s, label: s }))} />
            </Field>
            <Field label="Priority">
              <SelectField name="priority" defaultValue={t.priority} options={PRIORITIES.map((s) => ({ value: s, label: s }))} />
            </Field>
            <Field label="Deadline">
              <DateInput name="deadline" defaultValue={dateInput(t.deadline)} />
            </Field>
            <Field label="Meeting date">
              <DateInput name="meetingDate" defaultValue={dateInput(t.meetingDate)} />
            </Field>
            <Field label="Risk">
              <SelectField name="risk" defaultValue={t.risk || ""} placeholder="—" options={[{ value: "", label: "—" }, ...RISKS.map((s) => ({ value: s, label: s }))]} />
            </Field>
            <Field label="Escalation">
              <SelectField name="escalation" defaultValue={t.escalation || "No"} options={[{ value: "No", label: "No" }, { value: "Yes", label: "Yes" }]} />
            </Field>
            <Field label="Department">
              <Combobox name="department" options={data.departments} defaultValue={t.department || ""} placeholder="Pick, or type a new one" />
            </Field>
            <Field label="Category">
              <SelectField name="category" defaultValue={t.category || ""} placeholder="—" options={[{ value: "", label: "—" }, ...CATEGORIES.map((c) => ({ value: c, label: c }))]} />
            </Field>
            <Field label="Description" className="sm:col-span-2">
              <Textarea name="comments" defaultValue={t.comments || ""} rows={3} />
            </Field>
          </div>
        </div>

        <div className="border-t border-border" />

        <div className="grid grid-cols-1 gap-2.5 p-4 sm:grid-cols-2 sm:p-5">
          <FormSwitch
            name="leadMode"
            defaultChecked={t.accountability === "lead"}
            label="The first person is the lead"
            hint="Only they carry the overdue. Off: everyone on it shares it."
          />
          <FormSwitch
            name="requiresAttachment"
            defaultChecked={t.requiresAttachment}
            label="Needs a file to complete"
            hint="Completing on the portal refuses without an attachment."
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setActiveTab("overview")}>Cancel</Button>
        <Button type="submit"><Save size={14} /> Save changes</Button>
      </div>
    </form>
  ) : null;

  // Conversation-first (owner-approved D1+D3 mix): the chat leads, facts follow.
  // Tab IDs are unchanged so every existing ?dtab= deep link keeps working.
  const tabs: DrawerTab[] = t ? [
    { id: "conversation", label: "Conversation", icon: <MessageSquare size={14} />, badge: convoCount || undefined, content: conversationContent },
    { id: "overview", label: "Details", icon: <LayoutDashboard size={14} />, content: overviewContent },
    { id: "history", label: "History", icon: <History size={14} />, badge: counts.all || undefined, content: historyContent },
    /* Notes about this task (Phase 3). Owner-only, like the whole module — the
       route it reads sits inside the admin gate, and this component never appears
       on a portal screen, so an assignee still cannot see the note behind the
       task. It loads on the client because this record does. */
    { id: "notes", label: "Notes", icon: <StickyNote size={14} />, content: (
      <LinkedNotesTab type="task" id={t.id} emptyHint={`Write @${t.code} in any note and it will appear here.`} about={{ entity: "task", id: t.id, code: t.code, label: t.code }} />
    ) },
    { id: "edit", label: "Edit", icon: <Pencil size={14} />, content: editContent },
  ] : [];

  const actionBar = t ? (
    <div className="space-y-2">
      {confirmDel && (
        <div className="flex items-center gap-2 rounded-lg bg-danger-soft/50 ring-1 ring-danger/25 px-3 py-1.5 text-xs">
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
          variant="primary" size="lg" className="flex-1 sm:flex-none">
          {acting !== "complete" && (done ? <RotateCcw size={15} /> : <CheckCircle2 size={15} />)}
          {done ? "Reopen" : "Complete"}
        </Button>
        {t.escalation !== "Yes" && (
          <Button type="button" onClick={() => quickAction("escalate")} disabled={acting !== null} loading={acting === "escalate"}
            variant="danger-soft" size="lg">
            {acting !== "escalate" && <AlertOctagon size={15} />} Escalate
          </Button>
        )}
        <span className="ml-auto flex items-center gap-1.5">
          {data && data.companies.length > 1 && !t.archived && (
            <TaskCopyToCompanies
              taskId={t.id}
              currentCompanyId={t.companyId}
              currentCompanyName={t.companyName}
              companies={data.companies}
              actions={copyActions}
            />
          )}
          <Button type="button" onClick={toggleArchived} disabled={archiving} loading={archiving}
            variant="ghost" size="lg" title={t.archived ? "Bring this task back" : "Put this task away (keeps everything; can be restored)"}>
            {!archiving && (t.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />)}
            {t.archived ? "Restore" : "Archive"}
          </Button>
          <Button type="button" onClick={() => setConfirmDel((v) => !v)} aria-label="Delete"
            variant="ghost" size="lg" className={`w-10 px-0 ${confirmDel ? "text-danger bg-danger-soft" : "hover:text-danger"}`}>
            <Trash2 size={16} />
          </Button>
        </span>
      </div>
    </div>
  ) : undefined;

  /* ---------------- The record AS A PAGE (/task/CODE) ----------------
     Same data, same tabs, same actions — laid out by the shared RecordPage
     shell, so it is the same shape as every other record screen. */
  // The repeat editor portals to <body>, so it mounts once, whichever shell
  // (page or drawer) is showing the record.
  const repeatSheet = data ? (
    <RecurringTaskSheet
      open={repeatOpen}
      onClose={() => setRepeatOpen(false)}
      editing={!!data.recurrence}
      initial={repeatDraft}
      companies={data.companies}
      people={data.people}
      busy={repeatBusy}
      onSave={saveRepeat}
    />
  ) : null;

  /* ---------------- Studio: the same record, the mockup's layout ----------------
     ⚠️ EVERY PIECE BELOW IS ONE OF THE BLOCKS
     ABOVE — the conversation, details, history, notes and edit form are the very
     same elements the classic page shows, so nothing can drift. What Studio adds:
     status / priority / deadline in one click at the top (the drawer had them,
     the page never did), "Waiting on…" (setTaskBlocker had no admin screen), and
     correct / take down on each update (the actions existed; the admin
     conversation never passed them in). */
  if (mode === "page") {
    if (loading && !data) {
      // The shape of the task page — its dark header, the conversation and the
      // details — breathing softly, not a line of text (owner, 25 Sept 2026).
      return (
        <StudioScope>
          <div aria-busy aria-label={`Loading ${code}`} className="flex animate-pulse flex-col gap-4 motion-reduce:animate-none lg:grid lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="flex flex-col gap-4">
              <div className="flex h-[196px] flex-col justify-between rounded-[24px] bg-[var(--st-card)] p-6">
                <div className="flex gap-2"><span className="h-8 w-20 rounded-[10px] bg-[#26282C]" /><span className="h-8 w-16 rounded-[10px] bg-[#26282C]" /></div>
                <span className="h-9 w-2/3 rounded-[10px] bg-[#26282C]" />
                <div className="flex gap-2"><span className="h-7 w-24 rounded-lg bg-[#26282C]" /><span className="h-7 w-24 rounded-lg bg-[#26282C]" /><span className="h-7 w-24 rounded-lg bg-[#26282C]" /></div>
              </div>
              <div className="flex h-[300px] flex-col gap-3 rounded-[20px] bg-[var(--st-surface)] p-6">
                <span className="h-4 w-40 rounded bg-[var(--st-page)]" />
                <span className="h-16 w-full rounded-[12px] bg-[var(--st-page)]" />
                <span className="h-16 w-4/5 rounded-[12px] bg-[var(--st-page)]" />
              </div>
            </div>
            <div className="hidden h-[520px] rounded-[20px] bg-[var(--st-surface)] lg:block" />
          </div>
        </StudioScope>
      );
    }
    if (error || !t || !data) {
      return (
        <StudioOops
          kind="404"
          title={`No task ${code ?? ""}`.trim()}
          body="It may have been deleted, moved to another company (which gives it a new code), or it isn’t one of yours."
          home="/?tab=tasks"
          homeLabel="All tasks"
        />
      );
    }
    const refresh = () => { setRefreshKey((k) => k + 1); router.refresh(); };
    // The mockup's three tabs (Expanded board). Details are not a tab — they are
    // the left-hand panel, always in view; the full form is still one click away
    // from it ("edit"), and stays the one writer for the fields it owns.
    const studioTabs: { id: string; label: string; n?: number; phone?: boolean }[] = [
      { id: "conversation", label: "Conversation", n: convoCount || undefined },
      { id: "subtasks", label: "Subtasks", n: subCount?.total || undefined },
      { id: "details", label: "Details", phone: true },
      { id: "history", label: "History", n: counts.all || undefined },
      ...(data.ownerView ? [{ id: "notes", label: "Notes" }] : []),
    ];
    const panel = "rounded-[18px] bg-[var(--st-surface)] p-5";
    const edit = () => setActiveTab("edit");
    const details = (
      <div className={cn(panel, "min-w-0")}>
        <StudioDetails
          task={t}
          done={done}
          companies={data.companies}
          people={data.people}
          departments={data.departments}
          recurrenceLabel={data.recurrence ? scheduleLabel(data.recurrence) : null}
          onChanged={refresh}
          onOpenRepeat={data.ownerView ? () => setRepeatOpen(true) : undefined}
          onOpenForm={edit}
        />
      </div>
    );
    const rail = (
      <div className="flex min-w-0 flex-col gap-3.5">
        <div className={panel}>
          <div className="mb-3 text-[15px] font-semibold">People</div>
          {t.assignees.length ? (
            <div className="space-y-2.5">
              {t.assignees.map((n, i) => (
                <div key={n + i} className="flex items-center gap-2.5">
                  <PersonFace name={n} size={32} peek />
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium">{n}</span>
                    <span className="block text-[11px] text-[var(--st-muted)]">{i === 0 ? (t.accountability === "lead" ? "The lead" : "Accountable") : "Also on it"}</span>
                  </span>
                </div>
              ))}
            </div>
          ) : <p className="text-xs text-[var(--st-muted)]">Nobody is on this task yet.</p>}
          <button type="button" onClick={edit} className={cn(stBtn.ghost, "mt-3 h-9 w-full justify-center text-xs")}>{t.assignees.length ? "Add someone" : "Assign someone"}</button>
          {t.assignees.length > 0 && !done && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button type="button" onClick={() => remindAbout("task")} disabled={reminding} className={cn(stBtn.dark, "h-9 flex-1 basis-[128px] justify-center px-2 text-xs")}>Remind about this task</button>
              <button type="button" onClick={() => remindAbout("all")} disabled={reminding} className={cn(stBtn.ghost, "h-9 flex-1 basis-[88px] justify-center px-2 text-xs")} title={`Remind ${getGivenName(t.assignees[0])} about every open task`}>All their tasks</button>
            </div>
          )}
        </div>
        <div className={panel}>
          <div className="mb-3 text-[15px] font-semibold">Share</div>
          <div className="flex flex-col gap-1.5">
            <button type="button" onClick={copyLink} className={cn(stBtn.ghost, "h-9 w-full justify-start text-xs")}><LinkIcon size={12} />Copy link</button>
            <DraftEmailButton taskId={t.id} buttonClassName={cn(stBtn.ghost, "h-9 w-full justify-start text-xs")} />
          </div>
        </div>
        <SimilarTasks query={t.actionItem} excludeId={t.id} variant="studio" className={panel} />
      </div>
    );
    const centre = (
      <div className={cn(panel, "flex min-w-0 flex-col px-5 pb-5 pt-2 lg:h-full lg:min-h-0")}>
        {activeTab === "edit" ? (
          <div className="st-scroll -mr-3 min-h-0 flex-1 overflow-y-auto pr-3 pt-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="text-[15px] font-semibold">Edit every field</div>
              <button type="button" onClick={() => setActiveTab("conversation")} className="text-xs text-[var(--st-muted)] hover:text-[var(--st-ink)]">Back to the conversation</button>
            </div>
            {editContent}
          </div>
        ) : (
          <>
            <div className="mb-4 flex shrink-0 gap-5 overflow-x-auto border-b border-[var(--st-line-soft)] [scrollbar-width:none]" role="tablist" aria-label="Task sections">
              {studioTabs.map((x) => {
                const on = activeTab === x.id || (x.id === "conversation" && activeTab === "overview");
                return (
                  <button
                    key={x.id}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => setActiveTab(x.id)}
                    className={cn("-mb-px inline-flex h-10 shrink-0 items-center gap-1.5 border-b-2 text-[13px] transition-colors", x.phone && "md:hidden", on ? "border-[var(--st-ink)] text-[var(--st-ink)]" : "border-transparent text-[var(--st-muted)] hover:text-[var(--st-ink)]")}
                  >
                    {x.label}{x.n != null && <span className="text-xs text-[var(--st-muted)]">{x.n}</span>}
                  </button>
                );
              })}
            </div>
            {activeTab === "details" ? <div className="-mx-5 -mt-2 flex flex-col gap-1">{details}{rail}</div>
              : activeTab === "history" ? <div className="st-scroll -mr-3 min-h-0 flex-1 overflow-y-auto pr-3">{historyContent}</div>
              : activeTab === "subtasks" ? <div className="st-scroll -mr-3 min-h-0 flex-1 overflow-y-auto pr-3"><TaskSubtasks taskId={t.id} onCount={setSubCount} /></div>
              : activeTab === "notes" ? <div className="st-scroll -mr-3 min-h-0 flex-1 overflow-y-auto pr-3"><LinkedNotesTab type="task" id={t.id} emptyHint={`Write @${t.code} in any note and it will appear here.`} about={{ entity: "task", id: t.id, code: t.code, label: t.code }} /></div>
              : (
                <div className="flex min-h-0 flex-1 flex-col">
                  <PortalConversation
                    variant="studio"
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
                    editAction={async (fd: FormData) => { await adminEditUpdate(fd); refresh(); }}
                    deleteAction={async (fd: FormData) => {
                      await adminDeleteUpdate(fd);
                      refresh();
                      // The confirm says "It can be restored" — so say how.
                      const id = Number(fd.get("updateId"));
                      toast("Update taken down.", {
                        tone: "success", duration: 8000,
                        action: { label: "Undo", onClick: async () => {
                          const r = await restoreTaskUpdate(id).catch(() => ({ ok: false as const, error: NET_FAIL }));
                          if (!r.ok) toast(r.error || "Couldn't put it back.", { tone: "warn" });
                          refresh();
                        } },
                      });
                    }}
                    canModerate
                    canPin
                    canAck={false}
                    onPosted={() => setRefreshKey((k) => k + 1)}
                  />
                </div>
              )}
          </>
        )}
      </div>
    );
    return (
      <StudioScope className="space-y-4">
        <div className="st-tex-rings flex flex-col gap-3 rounded-[20px] bg-[var(--st-card)] px-5 py-4 text-[var(--st-on-card)]">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => close()} className={cn(stBtn.onCard, "h-9 sm:h-8")}>
              <ChevronLeft size={13} /><span className="sm:hidden">{backLabel}</span><span className="hidden sm:inline">{backLabel === "Tasks" ? "Back to the list" : `Back to ${backLabel}`}</span>
            </button>
            <span className="st-mono rounded-md bg-[var(--st-card-3)] px-2 py-1 text-[11px] text-[#C9CBCF]">{t.code}</span>
            {/* On a phone the name gives way (…) so the ⋯ button stays on this row
                instead of dropping onto a line of its own. */}
            <CompanyDrawerLink id={t.companyId} className="min-w-0 truncate text-[13px] text-[var(--st-on-card-muted)] hover:text-white max-sm:flex-1 max-sm:basis-0">{t.companyName}</CompanyDrawerLink>
            <span className="grow max-sm:hidden" />
            <button type="button" onClick={() => setMoreOpen(true)} aria-label="More actions" className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-[var(--st-card-line)] text-[#C9CBCF] sm:hidden">
              <MoreHorizontal size={16} />
            </button>
            {(prevCode || nextCode) && (
              <span className="hidden items-center gap-1 sm:flex">
                {seqIdx >= 0 && <span className="mr-1 text-xs text-[var(--st-muted)]">{seqIdx + 1} of {seq.length}</span>}
                <button type="button" aria-label="Previous task" disabled={!prevCode} onClick={() => prevCode && goToCode(prevCode)} className="flex h-8 w-8 items-center justify-center rounded-[9px] border border-[var(--st-card-line)] disabled:opacity-40"><ChevronLeft size={14} /></button>
                <button type="button" aria-label="Next task" disabled={!nextCode} onClick={() => nextCode && goToCode(nextCode)} className="flex h-8 w-8 items-center justify-center rounded-[9px] border border-[var(--st-card-line)] disabled:opacity-40"><ChevronRight size={14} /></button>
                <span className="mx-1 h-5 w-px bg-[var(--st-card-line)]" aria-hidden />
              </span>
            )}
            <button type="button" onClick={() => quickAction("complete")} disabled={acting !== null} className={cn(stBtn.onCard, "hidden sm:inline-flex")}>
              {done ? <RotateCcw size={13} /> : <CheckCircle2 size={13} />}{done ? "Reopen" : "Complete"}
            </button>
            {t.escalation !== "Yes" && (
              <button type="button" onClick={() => quickAction("escalate")} disabled={acting !== null} className={cn(stBtn.onCardGhost, "hidden sm:inline-flex")}>Escalate</button>
            )}
            <span className="hidden flex-wrap items-center gap-2 sm:contents">
            {data.companies.length > 1 && !t.archived && (
              <TaskCopyToCompanies
                taskId={t.id}
                currentCompanyId={t.companyId}
                currentCompanyName={t.companyName}
                companies={data.companies}
                actions={copyActions}
                triggerLabel="Copy to other companies"
                triggerClassName={stBtn.onCardGhost}
              />
            )}
            <button type="button" onClick={toggleArchived} disabled={archiving} className={stBtn.onCardGhost}>
              {t.archived ? "Restore" : "Archive"}
            </button>
            <button type="button" onClick={() => setConfirmDel((v) => !v)} className={cn(stBtn.onCardGhost, "border-[#4A2A3C] text-[#F07BBE]")}>Delete…</button>
            </span>
          </div>
          {confirmDel && (
            <div className="flex items-center gap-2 rounded-xl bg-[#3A1D2E] px-3 py-2 text-xs">
              <Trash2 size={14} className="shrink-0 text-[#F07BBE]" />
              <span className="min-w-0 flex-1">Delete this task permanently? Archive keeps everything instead.</span>
              <button type="button" onClick={() => setConfirmDel(false)} className={stBtn.onCardGhost}>Cancel</button>
              <button type="button" onClick={handleDelete} disabled={acting === "delete"} className="inline-flex h-8 items-center rounded-[9px] bg-[#E0479E] px-3 text-xs font-semibold text-white">Delete</button>
            </div>
          )}
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <h1 className="m-0 min-w-0 text-[28px] font-medium leading-tight tracking-[-0.03em] sm:text-[36px]">{t.actionItem}</h1>
            <div className="flex flex-wrap items-center gap-1.5">
              <StudioStatusCell code={t.code} status={t.status} tone="dark" />
              <DeadlineEditor code={t.code} deadline={t.deadline ? new Date(t.deadline) : null} daysToDeadline={t.daysToDeadline} studio="dark" />
              <StudioPriorityCell code={t.code} priority={t.priority} tone="dark" suffix=" priority" />
              {t.escalation === "Yes" && <span className="inline-flex h-7 items-center rounded-lg bg-[#3A1D2E] px-2.5 text-xs text-[#F07BBE]">Escalated</span>}
              {/* Repeat rules are the administrator's (the server refuses anyone
                  else) — a director sees how it repeats, not a dead button. */}
              {data.ownerView ? (
                <button type="button" onClick={() => setRepeatOpen(true)} className="inline-flex h-7 items-center gap-1.5 rounded-lg bg-[#1F2023] px-2.5 text-xs text-[#F2F2F0] hover:bg-[#2A2C30]">
                  {data.recurrence ? scheduleLabel(data.recurrence) : "Doesn’t repeat"}
                </button>
              ) : data.recurrence ? (
                <span className="inline-flex h-7 items-center gap-1.5 rounded-lg bg-[#1F2023] px-2.5 text-xs text-[#F2F2F0]">{scheduleLabel(data.recurrence)}</span>
              ) : null}
            </div>
          </div>
          <div className="flex gap-2 sm:hidden">
            <button type="button" onClick={() => quickAction("complete")} disabled={acting !== null} className={cn(stBtn.onCard, "h-10 flex-1 justify-center text-[13px]")}>
              {done ? <RotateCcw size={14} /> : <CheckCircle2 size={14} />}{done ? "Reopen" : "Complete"}
            </button>
            {t.escalation !== "Yes" && (
              <button type="button" onClick={() => quickAction("escalate")} disabled={acting !== null} className={cn(stBtn.onCardGhost, "h-10 flex-1 justify-center text-[13px]")}>Escalate</button>
            )}
          </div>
        </div>
        {moreOpen && (
          <div className="fixed inset-0 z-[46] sm:hidden" role="dialog" aria-label="More actions">
            <button type="button" aria-label="Close" onClick={() => setMoreOpen(false)} className="absolute inset-0 cursor-default bg-[rgba(14,15,16,0.4)]" />
            <div className="st-pop absolute inset-x-0 bottom-0 rounded-t-[26px] bg-[var(--st-surface)] px-4 pb-[calc(18px+env(safe-area-inset-bottom))] pt-2 text-[var(--st-ink)]">
              <span aria-hidden className="mx-auto block h-[5px] w-10 rounded-full bg-[var(--st-line)]" />
              <div className="truncate px-1 pb-1 pt-3 text-[13px] text-[var(--st-muted)]">{t.actionItem} · {t.code}</div>
              {(prevCode || nextCode) && (
                <div className="flex gap-2 py-2">
                  <button type="button" disabled={!prevCode} onClick={() => { setMoreOpen(false); if (prevCode) goToCode(prevCode); }} className={cn(stBtn.ghost, "h-11 flex-1 justify-center disabled:opacity-40")}><ChevronLeft size={15} />Previous task</button>
                  <button type="button" disabled={!nextCode} onClick={() => { setMoreOpen(false); if (nextCode) goToCode(nextCode); }} className={cn(stBtn.ghost, "h-11 flex-1 justify-center disabled:opacity-40")}>Next task<ChevronRight size={15} /></button>
                </div>
              )}
              {data.companies.length > 1 && !t.archived && (
                <TaskCopyToCompanies
                  taskId={t.id}
                  currentCompanyId={t.companyId}
                  currentCompanyName={t.companyName}
                  companies={data.companies}
                  actions={copyActions}
                  triggerLabel="Copy to other companies"
                  triggerClassName="flex h-[50px] w-full items-center gap-3 border-b border-[var(--st-line-soft)] text-[15px]"
                />
              )}
              {data.ownerView && (
                <button type="button" onClick={() => { setMoreOpen(false); setRepeatOpen(true); }} className="flex h-[50px] w-full items-center gap-3 border-b border-[var(--st-line-soft)] text-[15px]">
                  <Repeat size={17} />Repeat…
                </button>
              )}
              <button type="button" onClick={() => { setMoreOpen(false); void toggleArchived(); }} disabled={archiving} className="flex h-[50px] w-full items-center gap-3 border-b border-[var(--st-line-soft)] text-[15px]">
                {t.archived ? <ArchiveRestore size={17} /> : <Archive size={17} />}{t.archived ? "Restore" : "Archive"}
              </button>
              <button type="button" onClick={() => { setMoreOpen(false); setConfirmDel(true); }} className="flex h-[50px] w-full items-center gap-3 text-[15px] text-[var(--st-late-text)]">
                <Trash2 size={17} />Delete…
              </button>
            </div>
          </div>
        )}

        {/* Three columns from lg, as the mockup's Expanded board — Details ·
            conversation · People/Share/Similar. The side columns start slim
            and widen with the screen; below lg they stack, conversation first. */}
        <div ref={studioGridRef} className="grid grid-cols-1 items-start gap-4 md:grid-cols-[minmax(0,1fr)_260px] lg:grid-cols-[250px_minmax(0,1fr)_240px] lg:grid-rows-[minmax(0,1fr)] lg:items-stretch xl:grid-cols-[290px_minmax(0,1fr)_304px] 2xl:grid-cols-[340px_minmax(0,1fr)_320px]">
          <div className="st-scroll order-2 hidden min-w-0 rounded-[18px] md:block lg:order-1 lg:min-h-0 lg:overflow-y-auto">{details}</div>
          <div className="order-1 min-w-0 md:row-span-2 lg:order-2 lg:row-span-1 lg:min-h-0">{centre}</div>
          <div className="st-scroll order-3 hidden min-w-0 rounded-[18px] md:block lg:min-h-0 lg:overflow-y-auto">{rail}</div>
        </div>
        {repeatSheet}
      </StudioScope>
    );
  }

  return (
    <>
    {repeatSheet}
    <EntityDrawer
      open={open}
      onClose={close}
      title={t ? t.actionItem : code ? `Task ${code}` : "Task"}
      tone={tone}
      loading={loading && !data}
      error={error}
      errorLabel="Couldn't load task."
      // Dossier split (D2): the drawer auto-widens on the Conversation tab so the
      // facts rail fits beside the chat; other tabs keep the classic width.
      maxWidth={activeTab === "conversation" ? "min(920px, 94vw)" : "680px"}
      fullScreenOnMobile
      hero={heroNode}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      actionBar={actionBar}
    />
    </>
  );
}

/** The record at its own URL — /task/CODE. This is the primary way to open a
 *  task (the owner's decision: a record is a page, as in ERPNext). */
export function TaskRecordPage({ code, stamp }: { code: string; stamp?: number }) {
  return <TaskRecord mode="page" codeProp={code} stamp={stamp} />;
}

/** Legacy `?task=CODE` links (old emails, notifications, pasted URLs) still
 *  open the record in a drawer over whatever page you were on. Nothing in the
 *  app links this way any more — see taskHref() in lib/task-href.ts. */
export function TaskDrawer() {
  return <TaskRecord mode="drawer" />;
}

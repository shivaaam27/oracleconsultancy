import { sb } from "@/db/supabase";
import { getAllTasks } from "@/lib/queries";
import { recordTaskView } from "@/lib/portal-auth";
import { LiveSync } from "@/components/live-sync";
import { PortalConversation as TaskConversation, type ConvoMessage, type ConvoEvent } from "@/components/portal-conversation";
import { adminAddUpdate, adminTogglePin } from "../actions";
import { flagLabel } from "@/lib/derive";
import { Card, PageHeader, Badge, Button, FieldLabel, Input, Select, Textarea } from "@/components/ui";
import { PolishedInput } from "@/components/polished-input";
import { DraftEmailButton } from "@/components/draft-email-button";
import { SimilarTasks } from "@/components/similar-tasks";
import { CompanyDrawerLink } from "@/components/company-drawer-link";
import { PersonPicker } from "@/components/person-picker";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { updateTask, deleteTask } from "../actions";
import { STATUSES, PRIORITIES, RISKS } from "@/lib/constants";
import { ArrowLeft, Save, Trash2, MessageSquarePlus, GitCommitHorizontal, FileText, AlignLeft, CheckCheck } from "lucide-react";
import {
  sortTimeline,
  mergeStatusIntoUpdates,
  liftPinnedUpdates,
  suppressUpdateMetaAudits,
  groupFieldEdits,
  cleanReason,
  formatAuditValue,
  applyTimelineFilter,
  parseTimelineFilter,
  type TimelineItem,
  type TimelineFilter,
} from "@/lib/timeline";
import { TimelineEditGroupView } from "@/components/timeline-edit-group";
import { CodeLinkedText } from "@/components/code-linked-text";
import { AssigneeList } from "@/components/assignee-list";
import { TimelineFilters } from "@/components/timeline-filters";
import { UpdateMenu } from "@/components/update-menu";
import { AuditMenu } from "@/components/audit-menu";
import { Pin, Pencil } from "lucide-react";

export const dynamic = "force-dynamic";

function fmt(d: Date | null | undefined) {
  if (!d) return "—";
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function fmtDate(d: Date | null | undefined) {
  if (!d) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
function dateInput(d: Date | null | undefined) {
  if (!d) return "";
  const dt = new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function flagBadgeTone(f: string): "default" | "success" | "warn" | "danger" | "info" {
  if (f === "closed") return "default";
  if (["escalated", "escalate-now", "overdue", "stalled"].includes(f)) return "danger";
  if (["due-soon", "no-deadline", "aging"].includes(f)) return "warn";
  if (f === "on-track") return "success";
  return "default";
}

export default async function TaskPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ tl?: string }>;
}) {
  const [{ code }, sp] = await Promise.all([params, searchParams]);
  const filter = parseTimelineFilter(sp.tl);
  const all = await getAllTasks();
  const r = all.find((t) => t.code === code);
  if (!r) {
    // Old links: redirect a legacy code to its current canonical code.
    const legacy = all.find((t) => t.legacyCode === code);
    if (legacy) redirect(`/task/${legacy.code}${sp.tl ? `?tl=${sp.tl}` : ""}`);
    return notFound();
  }

  // Stamp the owner's view so portal users see "Seen by Management".
  await recordTaskView(r.id, "admin");

  const [{ data: auditRaw }, { data: updateRaw }, { data: sourceMeeting }, { data: pplRaw }, { data: compRaw }] = await Promise.all([
    sb
      .from("audit_log")
      .select("id,field,old_value,new_value,change_reason,entry_type,created_at,created_by")
      .eq("task_code", code)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    sb
      .from("task_updates")
      .select("id,body,created_at,created_by,edited_at,original_body,pinned_at,parent_update_id,attachment_document_id")
      .eq("task_id", r.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    sb
      .from("meeting_tasks")
      .select("meetings(id,title,meeting_date)")
      .eq("task_id", r.id)
      .maybeSingle(),
    sb.from("people").select("id,name").eq("active", true).order("name"),
    sb.from("companies").select("id,name").order("name"),
  ]);
  const pickerPeople = (pplRaw ?? []).map((p) => ({ id: p.id as number, name: p.name as string }));
  const companyOptions = (compRaw ?? []).map((c) => ({ id: c.id as number, name: c.name as string }));

  // Which audit entries have been corrected by a later CORRECTION entry?
  const auditIds = (auditRaw ?? []).map((a) => a.id as number);
  const correctedMap = new Map<number, Date>();
  if (auditIds.length > 0) {
    const { data: corrRows } = await sb
      .from("corrections")
      .select("audit_log_id,created_at")
      .in("audit_log_id", auditIds);
    for (const c of corrRows ?? []) {
      if (c.audit_log_id != null) correctedMap.set(c.audit_log_id as number, new Date(c.created_at as string));
    }
  }

  // Acknowledgements on pinned instructions, so the owner sees who has read.
  const pinnedUpdateIds = (updateRaw ?? []).filter((u) => u.pinned_at).map((u) => u.id as number);
  const ackMap = new Map<number, string[]>();
  if (pinnedUpdateIds.length > 0) {
    const { data: acks } = await sb
      .from("update_acks")
      .select("update_id,people(name)")
      .in("update_id", pinnedUpdateIds);
    for (const a of acks ?? []) {
      const uid = a.update_id as number;
      const nm = (a.people as unknown as { name: string } | null)?.name ?? "Someone";
      ackMap.set(uid, [...(ackMap.get(uid) ?? []), nm]);
    }
  }

  // Reply previews: child update id → its parent's snippet (T2 conversation).
  const updBodyById = new Map((updateRaw ?? []).map((u) => [u.id as number, u.body as string]));
  const replyQuote = new Map<number, string>();
  for (const u of updateRaw ?? []) {
    const pid = u.parent_update_id as number | null;
    if (pid && updBodyById.has(pid)) replyQuote.set(u.id as number, updBodyById.get(pid)!.slice(0, 90));
  }

  // Attachment file names for messages carrying a document.
  const attIds = (updateRaw ?? []).map((u) => u.attachment_document_id as number | null).filter((x): x is number => x != null);
  const attachName = new Map<number, string>();
  if (attIds.length > 0) {
    const { data: docs } = await sb.from("documents").select("id,file_name,title").in("id", attIds);
    for (const d of docs ?? []) attachName.set(d.id as number, (d.file_name as string | null) || (d.title as string) || "Attachment");
  }
  const attachByUpdate = new Map<number, string>();
  for (const u of updateRaw ?? []) {
    const aid = u.attachment_document_id as number | null;
    if (aid && attachName.has(aid)) attachByUpdate.set(u.id as number, attachName.get(aid)!);
  }

  /* ---- T3 conversation: build messages + events for the admin chat ---- */
  // Team (assignees) for @mention autocomplete + name resolution.
  const convoTeam = r.assigneeIds.map((id, i) => ({ id, name: r.assignees[i] }));
  const teamName = new Map(convoTeam.map((p) => [p.id, p.name]));

  // Who has seen since the latest message (portal viewers), + record my view.
  await recordTaskView(r.id, "admin");
  const { data: viewRows } = await sb.from("task_views").select("viewer,last_viewed_at").eq("task_id", r.id);
  const latestUpd = (updateRaw ?? [])[0] ?? null;
  const adminSeen: string[] = [];
  if (latestUpd) {
    for (const v of viewRows ?? []) {
      if (new Date(v.last_viewed_at as string) < new Date(latestUpd.created_at as string)) continue;
      const viewer = v.viewer as string;
      if (viewer.startsWith("person:")) {
        const nm = teamName.get(Number(viewer.slice(7)));
        if (nm) adminSeen.push(nm);
      }
    }
  }

  const adminAuthorOf = (by: string | null): { name: string; management: boolean; me: boolean } => {
    if (!by) return { name: "System", management: false, me: false };
    if (by === "web-ui") return { name: "You", management: true, me: true };
    if (by === "ai-command") return { name: "COS Assistant", management: true, me: false };
    if (by === "meeting-mode") return { name: "Meeting", management: true, me: false };
    if (by.startsWith("portal-mgr:")) return { name: by.slice(11), management: true, me: false };
    if (by.startsWith("portal:")) return { name: by.slice(7), management: false, me: false };
    return { name: by, management: true, me: false };
  };

  const convoMessages: ConvoMessage[] = (updateRaw ?? []).map((u) => {
    const a = adminAuthorOf(u.created_by as string | null);
    const pid = u.parent_update_id as number | null;
    const parent = pid && updBodyById.has(pid)
      ? { authorName: adminAuthorOf(((updateRaw ?? []).find((x) => x.id === pid)?.created_by as string | null) ?? null).name, snippet: updBodyById.get(pid)!.slice(0, 80) }
      : null;
    const aid = u.attachment_document_id as number | null;
    return {
      id: u.id as number,
      body: u.body as string,
      at: u.created_at as string,
      authorName: a.name,
      management: a.management,
      me: a.me,
      pinned: Boolean(u.pinned_at),
      parent,
      ackNames: u.pinned_at ? ackMap.get(u.id as number) ?? [] : [],
      iAcked: false,
      attachment: aid && attachName.has(aid) ? { name: attachName.get(aid)! } : null,
    };
  });

  const fmtEvDate = (v: string) => {
    const dd = new Date(v);
    return isNaN(dd.getTime()) ? v : dd.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  };
  const convoEvents: ConvoEvent[] = (auditRaw ?? [])
    .filter((a) => (a.entry_type as string) === "CHANGE" && ["status", "deadline", "priority", "risk", "escalation"].includes(String(a.field).toLowerCase()))
    .map((a) => {
      const f = String(a.field).toLowerCase();
      const nv = (a.new_value as string | null) ?? "";
      let text: string;
      if (f === "status") text = `Status → ${nv}`;
      else if (f === "deadline") text = nv ? `Deadline → ${fmtEvDate(nv)}` : "Deadline cleared";
      else if (f === "priority") text = `Priority → ${nv}`;
      else if (f === "risk") text = `Risk → ${nv}`;
      else text = nv ? `Escalation → ${nv}` : "Escalation cleared";
      return { id: `a${a.id}`, at: a.created_at as string, text };
    });

  const convoClosed = r.status === "Completed" || r.status === "Closed";
  const convoStatusOptions = STATUSES.filter((s) => s !== r.status);

  const rawTimeline: TimelineItem[] = [
    ...(updateRaw ?? []).map<TimelineItem>((u) => ({
      kind: "update",
      id: u.id as number,
      taskId: r.id,
      taskCode: r.code,
      body: u.body as string,
      createdAt: new Date(u.created_at as string),
      createdBy: (u.created_by as string | null) ?? null,
      editedAt: (u.edited_at as string | null) ? new Date(u.edited_at as string) : null,
      originalBody: (u.original_body as string | null) ?? null,
      pinnedAt: (u.pinned_at as string | null) ? new Date(u.pinned_at as string) : null,
    })),
    ...(auditRaw ?? []).map<TimelineItem>((a) => ({
      kind: "audit",
      id: a.id as number,
      taskId: r.id,
      taskCode: r.code,
      field: (a.field as string | null) ?? null,
      oldValue: (a.old_value as string | null) ?? null,
      newValue: (a.new_value as string | null) ?? null,
      changeReason: (a.change_reason as string | null) ?? null,
      entryType: (a.entry_type as string | null) ?? null,
      createdAt: new Date(a.created_at as string),
      createdBy: (a.created_by as string | null) ?? null,
      correctedAt: correctedMap.get(a.id as number) ?? null,
    })),
  ];

  // Pipeline: stable sort → merge status into updates → suppress redundant
  // edit/delete/pin audit rows → group field-edit bursts → hoist pinned.
  const merged = liftPinnedUpdates(
    groupFieldEdits(
      suppressUpdateMetaAudits(mergeStatusIntoUpdates(sortTimeline(rawTimeline)))
    )
  );

  // Counts (before filter) for the chip strip.
  const counts: Record<TimelineFilter, number> = {
    all: merged.length,
    updates: merged.filter((i) => i.kind === "update").length,
    status: merged.filter((i) => (i.kind === "update" && i.statusChange) || (i.kind === "audit" && i.field === "Status")).length,
    field: merged.filter((i) => i.kind === "editgroup" || (i.kind === "audit" && i.field !== "Status" && i.entryType !== "CREATE")).length,
    escalation: merged.filter((i) => i.kind === "audit" && (i.entryType === "ESCALATION" || i.field === "Escalation" || i.newValue === "Escalated" || i.newValue === "Yes")).length,
    bulk: merged.filter((i) => i.kind === "audit" && i.changeReason?.toLowerCase().startsWith("bulk")).length,
  };
  const timeline = applyTimelineFilter(merged, filter);
  const buildTimelineHref = (f: TimelineFilter) => (f === "all" ? `/task/${r.code}` : `/task/${r.code}?tl=${f}`);

  const update = updateTask.bind(null, code);
  const remove = deleteTask.bind(null, code);

  const priorityColor: Record<string, string> = {
    Critical: "text-danger", High: "text-warn", Medium: "text-info", Low: "text-fg-muted",
  };

  // Coloured pill tints — gives each stat a distinct hue rather than uniform glass.
  const priorityTint: Record<string, string> = {
    Critical: "bg-danger-soft/60 ring-1 ring-danger/25",
    High:     "bg-warn-soft/60   ring-1 ring-warn/25",
    Medium:   "bg-info-soft/60   ring-1 ring-info/25",
    Low:      "bg-bg-subtle/60   ring-1 ring-border",
  };
  const statusTint: Record<string, string> = {
    "Not Started":      "bg-bg-subtle/60   ring-1 ring-border",
    "In Progress":      "bg-info-soft/60   ring-1 ring-info/25    text-info",
    "Under Review":     "bg-accent-soft/60 ring-1 ring-accent/25  text-accent",
    "Blocked":          "bg-danger-soft/60 ring-1 ring-danger/25  text-danger",
    "Waiting External": "bg-warn-soft/60   ring-1 ring-warn/25    text-warn",
    "Escalated":        "bg-danger-soft/60 ring-1 ring-danger/30  text-danger",
    "Completed":        "bg-success-soft/60 ring-1 ring-success/25 text-success",
    "Closed":           "bg-bg-subtle/60   ring-1 ring-border     text-fg-muted",
  };
  const dtdTone =
    r.daysToDeadline === "done" ? "bg-success-soft/60 ring-1 ring-success/25 text-success"
    : r.daysToDeadline !== null && Number(r.daysToDeadline) < 0 ? "bg-danger-soft/60 ring-1 ring-danger/30 text-danger"
    : r.daysToDeadline !== null && Number(r.daysToDeadline) <= 7 ? "bg-warn-soft/60 ring-1 ring-warn/25 text-warn"
    : "bg-bg-subtle/60 ring-1 ring-border";

  return (
    <div className="space-y-5 max-w-6xl pb-24 lg:pb-6">
      <LiveSync taskId={r.id} seconds={6} />
      {/* Top bar: circular back + breadcrumb (mobile-first iOS feel) */}
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/?tab=tasks"
          aria-label="Back to tasks"
          className="glass elevated h-10 w-10 rounded-full flex items-center justify-center text-fg-muted hover:text-fg transition-colors shrink-0"
        >
          <ArrowLeft size={16} />
        </Link>
        <div className="flex items-center gap-2 text-xs text-fg-muted min-w-0">
          <CompanyDrawerLink id={r.companyId} className="truncate hover:text-accent transition-colors text-left">{r.companyName}</CompanyDrawerLink>
          <span className="text-fg-subtle">·</span>
          <span className="font-mono">{r.code}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <DraftEmailButton taskId={r.id} />
        </div>
      </div>

      {/* Two-pane control centre: conversation (left) + facts (right). */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] items-start">
      <div className="space-y-5 min-w-0">

      {/* Hero card */}
      <div className="glass elevated rounded-3xl p-5 sm:p-6 space-y-4 relative overflow-hidden">
        {/* soft colour wash so the hero feels alive */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full blur-3xl opacity-60"
          style={{ background: "radial-gradient(circle, hsl(var(--accent) / 0.35), transparent 70%)" }}
        />
        <div
          aria-hidden
          className={`pointer-events-none absolute -bottom-20 -left-20 h-56 w-56 rounded-full blur-3xl opacity-50 ${
            r.flag === "overdue" || r.escalation === "Yes" ? "" : "hidden"
          }`}
          style={{ background: "radial-gradient(circle, hsl(var(--danger) / 0.35), transparent 70%)" }}
        />
        <div className="relative flex items-center gap-2 flex-wrap">
          <Badge tone={flagBadgeTone(r.flag)}>{flagLabel[r.flag]}</Badge>
          {r.escalation === "Yes" && <Badge tone="danger">Escalated</Badge>}
          <span className={`px-2 py-0.5 rounded-full text-[11px] uppercase tracking-wider font-medium ${priorityTint[r.priority] || ""} ${priorityColor[r.priority] || "text-fg-muted"}`}>
            {r.priority}
          </span>
        </div>
        <h1 className="text-[22px] sm:text-2xl font-semibold tracking-tight leading-snug">{r.actionItem}</h1>

        {/* Inline meta row */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-muted">
          <span>Created <strong className="text-fg">{fmtDate(r.createdDate)}</strong></span>
          {r.deadline && (
            <span>Deadline <strong className={r.flag === "overdue" ? "text-danger" : "text-fg"}>{fmtDate(r.deadline)}</strong></span>
          )}
          {r.assignees.length > 0 && (
            <span>
              Assigned <AssigneeList names={r.assignees} ids={r.assigneeIds} className="font-semibold text-fg" />
            </span>
          )}
        </div>
      </div>

      {/* The conversation — chat with the team (replies, @mentions, files, voice). */}
      <TaskConversation
        taskId={r.id}
        code={r.code}
        closed={convoClosed}
        statusOptions={convoStatusOptions}
        currentStatus={r.status}
        messages={convoMessages}
        events={convoEvents}
        latestId={latestUpd ? (latestUpd.id as number) : null}
        seenLabel={adminSeen}
        team={convoTeam}
        addAction={adminAddUpdate}
        pinAction={adminTogglePin}
        canPin={true}
        canAck={false}
        composerHint="You can set any status, pin the current instruction, attach files, and @mention the team."
      />

      </div>{/* end left column */}

      {/* Right pane — facts & controls */}
      <aside className="space-y-4 lg:sticky lg:top-4 h-fit">

      {/* Stat pills — colour-tinted per status / priority / DTD severity */}
      <div className="-mx-1 px-1 overflow-x-auto scrollbar-none lg:overflow-visible">
        <div className="flex gap-2.5 sm:flex-wrap min-w-min">
          {[
            { label: "Status",     value: r.status,   tint: statusTint[r.status] ?? "" },
            { label: "Priority",   value: r.priority, tint: priorityTint[r.priority] ?? "" },
            { label: "Days open",  value: String(r.daysOpen ?? "—"), tint: "bg-bg-subtle/60 ring-1 ring-border" },
            { label: "DTD",        value: r.daysToDeadline !== null && r.daysToDeadline !== "done"
              ? `${r.daysToDeadline}d`
              : (r.daysToDeadline === "done" ? "done" : "—"),
              tint: dtdTone },
            { label: "Risk",       value: r.risk || "—",       tint: priorityTint[r.risk || ""] ?? "bg-bg-subtle/60 ring-1 ring-border" },
            { label: "Category",   value: r.category || "—",   tint: "bg-bg-subtle/60 ring-1 ring-border" },
            { label: "Department", value: r.department || "—", tint: "bg-bg-subtle/60 ring-1 ring-border" },
          ].map((item) => (
            <div
              key={item.label}
              className={`rounded-2xl px-4 py-3 min-w-[112px] shrink-0 elevated backdrop-blur-md ${item.tint}`}
            >
              <div className="text-[10px] uppercase tracking-wider text-fg-muted">{item.label}</div>
              <div className="text-sm font-semibold mt-1 tabular">{item.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Description — the task's standing context (the main message). */}
      {r.comments && r.comments.trim() && (
        <div className="bg-bg-elev ring-1 ring-border elevated rounded-2xl px-4 py-3 flex items-start gap-3">
          <div className="mt-0.5 h-8 w-8 rounded-full bg-bg-muted text-fg-muted flex items-center justify-center shrink-0">
            <AlignLeft size={15} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-wider text-fg-muted mb-0.5">Description</div>
            <p className="text-sm leading-relaxed whitespace-pre-wrap"><CodeLinkedText text={r.comments} /></p>
          </div>
        </div>
      )}

      {(sourceMeeting as any)?.meetings && (
        <div className="rounded-xl border border-border bg-bg-elev px-4 py-3 flex items-start gap-3 elevated">
          <div className="mt-0.5 h-8 w-8 rounded-full bg-accent-soft text-accent flex items-center justify-center shrink-0">
            <FileText size={15} />
          </div>
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wider text-fg-subtle">Source meeting</div>
            <p className="text-sm font-medium truncate">{(sourceMeeting as any).meetings.title}</p>
            <p className="text-xs text-fg-muted">{fmtDate(new Date((sourceMeeting as any).meetings.meeting_date as string))}</p>
          </div>
        </div>
      )}

      <SimilarTasks query={r.actionItem} excludeId={r.id} />

        {/* Edit task (collapsible) */}
        <details className="group bg-bg-elev ring-1 ring-border elevated rounded-3xl overflow-hidden">
          <summary className="list-none cursor-pointer flex items-center gap-2 px-5 py-4 text-xs font-medium uppercase tracking-[0.08em] text-fg-muted select-none">
            <Pencil size={12} /> Edit task
            <span className="ml-auto text-fg-subtle text-base leading-none transition-transform group-open:rotate-180 normal-case tracking-normal">⌄</span>
          </summary>
          <div className="px-5 pb-5 space-y-4">
          <Card className="p-5 rounded-2xl">
            <form action={update} className="space-y-4">
              <div>
                <FieldLabel>Action Item <span className="text-fg-subtle normal-case font-normal">— click ✦ to polish</span></FieldLabel>
                <PolishedInput name="actionItem" defaultValue={r.actionItem} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <FieldLabel>Company <span className="text-fg-subtle normal-case font-normal">— changing it issues a new task code; the old code keeps redirecting here</span></FieldLabel>
                  <Select name="companyId" defaultValue={r.companyId}>
                    {companyOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                </div>
                <div>
                  <FieldLabel>Status</FieldLabel>
                  <Select name="status" defaultValue={r.status}>
                    {STATUSES.map((s) => <option key={s}>{s}</option>)}
                  </Select>
                </div>
                <div>
                  <FieldLabel>Priority</FieldLabel>
                  <Select name="priority" defaultValue={r.priority}>
                    {PRIORITIES.map((s) => <option key={s}>{s}</option>)}
                  </Select>
                </div>
                <div>
                  <FieldLabel>Department</FieldLabel>
                  <Input name="department" defaultValue={r.department || ""} />
                </div>
                <div>
                  <FieldLabel>Category</FieldLabel>
                  <Input name="category" defaultValue={r.category || ""} />
                </div>
                <div>
                  <FieldLabel>Risk</FieldLabel>
                  <Select name="risk" defaultValue={r.risk || ""}>
                    <option value="">—</option>
                    {RISKS.map((s) => <option key={s}>{s}</option>)}
                  </Select>
                </div>
                <div>
                  <FieldLabel>Escalation</FieldLabel>
                  <Select name="escalation" defaultValue={r.escalation || "No"}>
                    <option>No</option><option>Yes</option>
                  </Select>
                </div>
                <div>
                  <FieldLabel>Meeting Date</FieldLabel>
                  <Input name="meetingDate" type="date" defaultValue={dateInput(r.meetingDate)} />
                </div>
                <div>
                  <FieldLabel>Deadline</FieldLabel>
                  <Input name="deadline" type="date" defaultValue={dateInput(r.deadline)} />
                </div>
              </div>
              <div>
                <FieldLabel>Accountable</FieldLabel>
                <PersonPicker people={pickerPeople} defaultNames={r.assignees} placeholder="Search people, or type a new name…" />
              </div>
              <div>
                <FieldLabel>Comments</FieldLabel>
                <Textarea name="comments" defaultValue={r.comments || ""} rows={2} />
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-border gap-3">
                <Button type="submit" className="rounded-full"><Save size={13} /> Save Changes</Button>
              </div>
            </form>
          </Card>
          <form action={remove} className="flex justify-end">
            <Button variant="danger" type="submit" className="rounded-full"><Trash2 size={13} /> Delete task</Button>
          </form>
          </div>
        </details>

      </aside>{/* end right pane */}
      </div>{/* end two-pane grid */}

        {/* Full history & audit — the complete governance trail, with
            per-entry edit / delete / correct and filters. */}
        <details className="group bg-bg-elev ring-1 ring-border elevated rounded-3xl overflow-hidden">
            <summary className="list-none cursor-pointer flex items-center gap-2 px-4 py-3 text-xs font-medium uppercase tracking-[0.08em] text-fg-muted select-none">
              <MessageSquarePlus size={12} /> Full history &amp; audit
              <span className="text-fg-subtle normal-case tracking-normal">· {counts.all}</span>
              <span className="ml-auto text-fg-subtle text-base leading-none transition-transform group-open:rotate-180 normal-case tracking-normal">⌄</span>
            </summary>
            <div className="px-4 pb-4 space-y-3">

          {/* Filter chips */}
          {counts.all > 0 && (
            <TimelineFilters current={filter} counts={counts} buildHref={buildTimelineHref} />
          )}

          {/* Timeline */}
          <div className="space-y-0">
            {timeline.length === 0 ? (
              <p className="text-xs text-fg-muted py-4 text-center">
                {counts.all === 0
                  ? "No updates yet. Post the first one above."
                  : "No items match this filter."}
              </p>
            ) : (
              <div className="relative pl-5">
                {/* vertical line */}
                <div className="absolute left-1.5 top-2 bottom-2 w-px bg-border" />

                <div className="space-y-3">
                  {timeline.map((item) => (
                    <div key={`${item.kind}-${item.id}`} className="relative">
                      {/* dot */}
                      <div
                        className={`absolute -left-3.5 top-1.5 w-2 h-2 rounded-full border-2 border-bg ${
                          item.kind === "update"
                            ? "bg-accent"
                            : item.kind === "audit" && (item.newValue === "Completed" || item.newValue === "Closed")
                              ? "bg-success"
                              : "bg-border"
                        }`}
                      />

                      {item.kind === "editgroup" ? (
                        <TimelineEditGroupView group={item} />
                      ) : item.kind === "update" ? (
                        <div
                          className={`group bg-accent/5 border rounded-lg p-3 space-y-1.5 ${
                            item.pinnedAt ? "border-accent/50" : "border-accent/20"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-fg-muted">
                              {item.pinnedAt && (
                                <Pin size={9} className="text-accent fill-accent" />
                              )}
                              <span>Update</span>
                            </div>
                            <UpdateMenu
                              updateId={item.id}
                              body={item.body}
                              pinned={!!item.pinnedAt}
                            />
                          </div>
                          {replyQuote.has(item.id) && (
                            <div className="rounded border-l-2 border-accent/40 bg-bg-subtle/60 px-2 py-1 text-[11px] italic text-fg-muted">
                              ↪ {replyQuote.get(item.id)}{(replyQuote.get(item.id)?.length ?? 0) >= 90 ? "…" : ""}
                            </div>
                          )}
                          <p className="text-sm leading-relaxed">
                            <CodeLinkedText text={item.body} />
                          </p>
                          {attachByUpdate.has(item.id) && (
                            <a
                              href={`/api/portal/attachment?updateId=${item.id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-lg bg-bg-subtle ring-1 ring-border px-2.5 py-1.5 text-[11px] hover:ring-accent/40 transition-colors w-fit"
                            >
                              <FileText size={12} className="text-accent" />
                              <span className="truncate max-w-[14rem] font-medium">{attachByUpdate.get(item.id)}</span>
                              <span className="text-fg-subtle">· view</span>
                            </a>
                          )}
                          {item.editedAt && (
                            item.originalBody ? (
                              <details className="text-[11px] -mt-0.5">
                                <summary className="cursor-pointer list-none inline-flex items-center gap-1 text-fg-subtle hover:text-fg transition-colors w-fit">
                                  <Pencil size={9} />
                                  <span>edited · view original</span>
                                </summary>
                                <div className="mt-1.5 px-2.5 py-1.5 rounded bg-bg-subtle italic text-fg-muted leading-relaxed">
                                  &ldquo;{item.originalBody}&rdquo;
                                </div>
                              </details>
                            ) : (
                              <span className="text-[11px] text-fg-subtle inline-flex items-center gap-1">
                                <Pencil size={9} /> edited
                              </span>
                            )
                          )}
                          {item.statusChange && (
                            <div className="inline-flex items-center gap-1.5 text-[11px] bg-bg-subtle rounded px-2 py-0.5">
                              <GitCommitHorizontal size={10} className="text-fg-subtle" />
                              <span className="text-fg-subtle">Status</span>
                              {item.statusChange.from && (
                                <span className="text-fg-muted">{item.statusChange.from}</span>
                              )}
                              <span className="text-fg-subtle">→</span>
                              <span className="text-fg font-medium">{item.statusChange.to}</span>
                            </div>
                          )}
                          {item.pinnedAt && (ackMap.get(item.id)?.length ?? 0) > 0 && (
                            <p className="inline-flex items-center gap-1 text-[11px] text-success">
                              <CheckCheck size={11} /> Read by {ackMap.get(item.id)!.join(", ")}
                            </p>
                          )}
                          <p className="text-xs text-fg-muted">{fmt(item.createdAt)}</p>
                        </div>
                      ) : item.kind === "audit" ? (
                        <div className="group rounded-lg px-3 py-2 bg-bg-subtle">
                          {item.entryType === "CREATE" ? (
                            <p className="text-xs text-fg-muted">Task created</p>
                          ) : (
                            <div className="text-xs space-y-0.5">
                              <div className="flex items-start justify-between gap-2">
                                <span className="font-medium text-fg">{item.field}</span>
                                <AuditMenu entryId={item.id} currentReason={item.changeReason} />
                              </div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {item.oldValue && <span className="text-fg-muted">{formatAuditValue(item.field, item.oldValue)}</span>}
                                {item.oldValue && item.newValue && <GitCommitHorizontal size={10} className="text-fg-subtle" />}
                                {item.newValue && <span className="text-fg font-medium">{formatAuditValue(item.field, item.newValue)}</span>}
                              </div>
                              {cleanReason(item.changeReason) && (
                                <p className="italic text-fg-muted">
                                  <CodeLinkedText text={cleanReason(item.changeReason)!} />
                                </p>
                              )}
                            </div>
                          )}
                          <p className="text-xs text-fg-subtle mt-1">{fmt(item.createdAt)}</p>
                        </div>
                      ) : null /* per-task page doesn't surface bulk runs as a separate kind */}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
            </div>
          </details>
    </div>
  );
}

import { sb } from "@/db/supabase";
import { getAllTasks } from "@/lib/queries";
import { flagLabel } from "@/lib/derive";
import { Card, PageHeader, Badge, Button, FieldLabel, Input, Select, Textarea } from "@/components/ui";
import { UpdateBox } from "@/components/update-box";
import { PolishedInput } from "@/components/polished-input";
import { DraftEmailButton } from "@/components/draft-email-button";
import { SimilarTasks } from "@/components/similar-tasks";
import { CompanyDrawerLink } from "@/components/company-drawer-link";
import { PersonPicker } from "@/components/person-picker";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { updateTask, deleteTask } from "../actions";
import { STATUSES, PRIORITIES, RISKS } from "@/lib/constants";
import { ArrowLeft, Save, Trash2, MessageSquarePlus, GitCommitHorizontal, FileText, AlignLeft } from "lucide-react";
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

  const [{ data: auditRaw }, { data: updateRaw }, { data: sourceMeeting }, { data: pplRaw }, { data: compRaw }] = await Promise.all([
    sb
      .from("audit_log")
      .select("id,field,old_value,new_value,change_reason,entry_type,created_at,created_by")
      .eq("task_code", code)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    sb
      .from("task_updates")
      .select("id,body,created_at,created_by,edited_at,original_body,pinned_at")
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
    <div className="space-y-5 max-w-5xl pb-24 lg:pb-6">
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

      {/* Stat pills — colour-tinted per status / priority / DTD severity */}
      <div className="-mx-1 px-1 overflow-x-auto scrollbar-none">
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

      {/* Latest update callout */}
      {r.latestUpdate && (
        <div className="bg-bg-elev ring-1 ring-border elevated rounded-2xl px-4 py-3 flex items-start gap-3">
          <div className="mt-0.5 h-8 w-8 rounded-full bg-accent-soft text-accent flex items-center justify-center shrink-0">
            <MessageSquarePlus size={15} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-wider text-fg-muted mb-0.5">Latest update · {fmt(r.lastUpdatedAt)}</div>
            <p className="text-sm leading-relaxed"><CodeLinkedText text={r.latestUpdate} /></p>
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

      <div className="space-y-4">
        {/* Post update — primary action, above the edit form */}
        <UpdateBox taskId={r.id} taskCode={r.code} currentStatus={r.status} />

        {/* Edit form (collapsible, full width) */}
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

        {/* History */}
        <details className="group bg-bg-elev ring-1 ring-border elevated rounded-3xl overflow-hidden" open>
            <summary className="list-none cursor-pointer flex items-center gap-2 px-4 py-3 text-xs font-medium uppercase tracking-[0.08em] text-fg-muted select-none">
              <MessageSquarePlus size={12} /> History
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
                          <p className="text-sm leading-relaxed">
                            <CodeLinkedText text={item.body} />
                          </p>
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
    </div>
  );
}

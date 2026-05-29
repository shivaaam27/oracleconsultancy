import { sb } from "@/db/supabase";
import { getAllTasks } from "@/lib/queries";
import { flagLabel } from "@/lib/derive";
import { Card, PageHeader, Badge, Button, FieldLabel, Input, Select, Textarea } from "@/components/ui";
import { UpdateBox } from "@/components/update-box";
import { PolishedInput } from "@/components/polished-input";
import { DraftEmailButton } from "@/components/draft-email-button";
import { SimilarTasks } from "@/components/similar-tasks";
import Link from "next/link";
import { notFound } from "next/navigation";
import { updateTask, deleteTask } from "../actions";
import { STATUSES, PRIORITIES, RISKS } from "@/lib/constants";
import { ArrowLeft, Save, Trash2, MessageSquarePlus, GitCommitHorizontal, FileText } from "lucide-react";
import {
  sortTimeline,
  mergeStatusIntoUpdates,
  liftPinnedUpdates,
  suppressUpdateMetaAudits,
  groupFieldEdits,
  cleanReason,
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
  if (!r) return notFound();

  const [{ data: auditRaw }, { data: updateRaw }, { data: sourceMeeting }] = await Promise.all([
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
  ]);

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

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Back */}
      <div>
        <Link href="/?tab=tasks" className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg transition-colors">
          <ArrowLeft size={12} /> Tasks
        </Link>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="font-mono text-xs text-fg-muted bg-bg-subtle px-2 py-0.5 rounded">{r.code}</span>
            <Link href={`/companies/${r.companyId}`} className="text-xs text-fg-muted hover:text-accent transition-colors">{r.companyName}</Link>
            <span className="text-fg-subtle">·</span>
            <Badge tone={flagBadgeTone(r.flag)}>{flagLabel[r.flag]}</Badge>
            {r.escalation === "Yes" && <Badge tone="danger">Escalated</Badge>}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{r.actionItem}</h1>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-muted mt-2">
            <span>Created <strong>{fmtDate(r.createdDate)}</strong></span>
            {r.deadline && <span>Deadline <strong className={r.flag === "overdue" ? "text-danger" : ""}>{fmtDate(r.deadline)}</strong></span>}
            <span>Days open <strong className="tabular">{r.daysOpen ?? "—"}</strong></span>
            {r.daysToDeadline !== null && r.daysToDeadline !== "done" && (
              <span>DTD <strong className={`tabular ${Number(r.daysToDeadline) < 0 ? "text-danger" : Number(r.daysToDeadline) <= 7 ? "text-warn" : ""}`}>{r.daysToDeadline}d</strong></span>
            )}
            {r.assignees.length > 0 && (
              <span>
                Assigned to <AssigneeList names={r.assignees} ids={r.assigneeIds} className="font-semibold text-fg" />
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <DraftEmailButton taskId={r.id} />
          <form action={remove}>
            <Button variant="danger" type="submit"><Trash2 size={13} /> Delete</Button>
          </form>
        </div>
      </div>

      {/* Quick stats row */}
      <div className="flex gap-3 flex-wrap">
        {[
          { label: "Status", value: r.status },
          { label: "Priority", value: r.priority, className: priorityColor[r.priority] },
          { label: "Category", value: r.category || "—" },
          { label: "Department", value: r.department || "—" },
          { label: "Risk", value: r.risk || "—" },
        ].map(item => (
          <div key={item.label} className="bg-bg-subtle rounded-lg px-3 py-2 min-w-[100px]">
            <div className="text-xs text-fg-muted">{item.label}</div>
            <div className={`text-sm font-medium mt-0.5 ${(item as any).className || ""}`}>{item.value}</div>
          </div>
        ))}
      </div>

      {/* Latest update callout */}
      {r.latestUpdate && (
        <div className="border-l-2 border-accent pl-4 py-1">
          <div className="text-xs text-fg-muted mb-0.5">Latest update · {fmt(r.lastUpdatedAt)}</div>
          <p className="text-sm"><CodeLinkedText text={r.latestUpdate} /></p>
        </div>
      )}

      {(sourceMeeting as any)?.meetings && (
        <div className="rounded-2xl border border-border bg-bg-elev px-4 py-3 flex items-start gap-3">
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

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left: Edit form */}
        <div className="lg:col-span-3 space-y-4">
          <h2 className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-fg-muted">
            <Pencil size={12} /> Edit Task
          </h2>
          <Card className="p-5">
            <form action={update} className="space-y-4">
              <div>
                <FieldLabel>Action Item <span className="text-fg-subtle normal-case font-normal">— click ✦ to polish</span></FieldLabel>
                <PolishedInput name="actionItem" defaultValue={r.actionItem} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
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
                <FieldLabel>Accountable (comma-separated)</FieldLabel>
                <Input name="accountable" defaultValue={r.assignees.join(", ")} />
              </div>
              <div>
                <FieldLabel>Comments</FieldLabel>
                <Textarea name="comments" defaultValue={r.comments || ""} rows={2} />
              </div>
              <div>
                <FieldLabel>Change Reason <span className="text-fg-subtle normal-case font-normal">(recorded in history)</span></FieldLabel>
                <Input name="changeReason" placeholder="Why are you making this change?" />
              </div>
              <div className="flex items-center justify-end pt-2 border-t border-border">
                <Button type="submit"><Save size={13} /> Save Changes</Button>
              </div>
            </form>
          </Card>
        </div>

        {/* Right: Updates + Timeline */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-fg-muted">
            <MessageSquarePlus size={12} /> Updates & History
          </h2>

          <UpdateBox taskId={r.id} taskCode={r.code} currentStatus={r.status} />

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
                                {item.oldValue && <span className="text-fg-muted">{item.oldValue}</span>}
                                {item.oldValue && item.newValue && <GitCommitHorizontal size={10} className="text-fg-subtle" />}
                                {item.newValue && <span className="text-fg font-medium">{item.newValue}</span>}
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
      </div>
    </div>
  );
}

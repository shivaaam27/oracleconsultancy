import Link from "next/link";
import { sb } from "@/db/supabase";
import type { TaskRow } from "@/lib/queries";
import {
  Activity,
  CheckCircle2,
  AlertOctagon,
  MessageSquare,
  FilePlus2,
  GitCommitHorizontal,
  Layers,
  ChevronDown,
} from "lucide-react";
import { EmptyState } from "@/components/ui";
import { CodeLinkedText } from "@/components/code-linked-text";
import { TimelineFilters } from "@/components/timeline-filters";
import {
  sortTimeline,
  mergeStatusIntoUpdates,
  groupBulkRuns,
  suppressUpdateMetaAudits,
  suppressNoReasonAudits,
  applyTimelineFilter,
  parseTimelineFilter,
  type TimelineItem,
  type TimelineUpdate,
  type TimelineAudit,
  type TimelineBulk,
  type TimelineFilter,
} from "@/lib/timeline";
import { UpdateMenu } from "@/components/update-menu";
import { AuditMenu } from "@/components/audit-menu";
import { Pencil } from "lucide-react";

const ITEM_LIMIT = 200;

export async function TimelineTab({
  companyTasks,
  companyId,
  filterParam,
}: {
  companyTasks: TaskRow[];
  companyId: number;
  filterParam: string | undefined;
}) {
  if (companyTasks.length === 0) {
    return (
      <EmptyState
        icon={<Activity size={28} />}
        title="No activity yet."
        hint="This company has no tasks."
      />
    );
  }

  const filter = parseTimelineFilter(filterParam);

  const taskIds = companyTasks.map((t) => t.id);
  const taskCodes = companyTasks.map((t) => t.code);
  const codeById = new Map(companyTasks.map((t) => [t.id, t.code]));
  const titleByCode = new Map(companyTasks.map((t) => [t.code, t.actionItem]));

  const [updRes, audRes] = await Promise.all([
    sb
      .from("task_updates")
      .select("id,task_id,body,created_at,created_by,edited_at,original_body")
      .in("task_id", taskIds)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(ITEM_LIMIT),
    sb
      .from("audit_log")
      .select("id,task_id,task_code,field,old_value,new_value,change_reason,entry_type,created_at,created_by")
      .in("task_code", taskCodes)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(ITEM_LIMIT),
  ]);

  const raw: TimelineItem[] = [];
  for (const u of (updRes.data ?? []) as Array<{
    id: number; task_id: number; body: string; created_at: string; created_by: string | null;
    edited_at: string | null; original_body: string | null;
  }>) {
    raw.push({
      kind: "update",
      id: u.id,
      taskId: u.task_id,
      taskCode: codeById.get(u.task_id) ?? null,
      body: u.body,
      createdAt: new Date(u.created_at),
      createdBy: u.created_by,
      editedAt: u.edited_at ? new Date(u.edited_at) : null,
      originalBody: u.original_body,
    });
  }
  for (const a of (audRes.data ?? []) as Array<{
    id: number; task_id: number | null; task_code: string | null; field: string | null;
    old_value: string | null; new_value: string | null; change_reason: string | null;
    entry_type: string | null; created_at: string; created_by: string | null;
  }>) {
    raw.push({
      kind: "audit",
      id: a.id,
      taskId: a.task_id,
      taskCode: a.task_code,
      field: a.field,
      oldValue: a.old_value,
      newValue: a.new_value,
      changeReason: a.change_reason,
      entryType: a.entry_type,
      createdAt: new Date(a.created_at),
      createdBy: a.created_by,
    });
  }

  // Pipeline: sort → merge status into updates → suppress update-meta audits
  // (edited/deleted/pinned) → suppress reasonless field-change noise →
  // collapse bulk runs.
  const merged = groupBulkRuns(
    suppressNoReasonAudits(
      suppressUpdateMetaAudits(mergeStatusIntoUpdates(sortTimeline(raw)))
    )
  );

  // Counts (post-merge, pre-filter) for the chip strip.
  const counts: Record<TimelineFilter, number> = {
    all: merged.length,
    updates: merged.filter((i) => i.kind === "update").length,
    status: merged.filter(
      (i) =>
        (i.kind === "update" && i.statusChange) ||
        (i.kind === "audit" && i.field === "Status") ||
        (i.kind === "bulk" && i.field === "Status")
    ).length,
    field: merged.filter(
      (i) =>
        (i.kind === "audit" && i.field !== "Status" && i.entryType !== "CREATE") ||
        (i.kind === "bulk" && i.field !== "Status")
    ).length,
    escalation: merged.filter(
      (i) =>
        i.kind === "audit" &&
        (i.entryType === "ESCALATION" || i.field === "Escalation" || i.newValue === "Escalated" || i.newValue === "Yes")
    ).length,
    bulk: merged.filter((i) => i.kind === "bulk").length,
  };

  const items = applyTimelineFilter(merged, filter);
  const trimmed = items.slice(0, ITEM_LIMIT);

  const buildHref = (f: TimelineFilter) => {
    const params = new URLSearchParams();
    params.set("tab", "timeline");
    if (f !== "all") params.set("tl", f);
    return `/companies/${companyId}?${params.toString()}`;
  };

  // Group by YYYY-MM-DD (already desc from sort)
  const groups = new Map<string, TimelineItem[]>();
  for (const it of trimmed) {
    const k = ymd(it.createdAt);
    const list = groups.get(k) || [];
    list.push(it);
    groups.set(k, list);
  }
  const orderedDays = Array.from(groups.keys());

  return (
    <div className="space-y-6">
      <ActivitySummary items={merged} />

      {counts.all > 0 && (
        <TimelineFilters current={filter} counts={counts} buildHref={buildHref} />
      )}

      {trimmed.length === 0 ? (
        <EmptyState
          icon={<Activity size={28} />}
          title={counts.all === 0 ? "No activity yet." : "No items match this filter."}
          hint={
            counts.all === 0
              ? "Updates and field changes on this company's tasks will appear here."
              : "Try All, or a different filter."
          }
        />
      ) : (
        <div className="space-y-5">
          {orderedDays.map((day) => (
            <DayGroup
              key={day}
              day={day}
              items={groups.get(day)!}
              titleByCode={titleByCode}
            />
          ))}
          {items.length > ITEM_LIMIT && (
            <div className="text-xs text-fg-subtle text-center py-2">
              Showing latest {ITEM_LIMIT} events.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ActivitySummary({ items }: { items: TimelineItem[] }) {
  // Count from merged items so bulk-of-N counts as N actions, not 1 row.
  const expand = (arr: TimelineItem[]): Array<TimelineUpdate | TimelineAudit> => {
    const out: Array<TimelineUpdate | TimelineAudit> = [];
    for (const i of arr) {
      if (i.kind === "bulk") out.push(...i.items);
      else out.push(i);
    }
    return out;
  };
  const expanded = expand(items);
  const updates = expanded.filter((i) => i.kind === "update").length;
  const statusChanges = expanded.filter(
    (i) =>
      (i.kind === "update" && (i as TimelineUpdate).statusChange) ||
      (i.kind === "audit" && ((i as TimelineAudit).field === "Status" || (i as TimelineAudit).entryType === "STATUS"))
  ).length;
  const completions = expanded.filter(
    (i) => i.kind === "audit" && (i as TimelineAudit).newValue === "Completed"
  ).length;
  const escalations = expanded.filter(
    (i) =>
      i.kind === "audit" &&
      ((i as TimelineAudit).entryType === "ESCALATION" ||
        (i as TimelineAudit).newValue === "Escalated" ||
        (i as TimelineAudit).newValue === "Yes")
  ).length;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      {[
        { label: "Updates", value: updates, icon: MessageSquare, tone: "text-accent" },
        { label: "Status changes", value: statusChanges, icon: GitCommitHorizontal, tone: "text-fg" },
        { label: "Completions", value: completions, icon: CheckCircle2, tone: "text-success" },
        { label: "Escalations", value: escalations, icon: AlertOctagon, tone: "text-danger" },
      ].map((s) => {
        const Icon = s.icon;
        return (
          <div key={s.label} className="card p-3">
            <div className="flex items-center gap-1.5 text-xs text-fg-muted">
              <Icon size={11} /> {s.label}
            </div>
            <div className={`text-xl font-semibold tabular mt-0.5 ${s.tone}`}>{s.value}</div>
          </div>
        );
      })}
    </div>
  );
}

function DayGroup({
  day,
  items,
  titleByCode,
}: {
  day: string;
  items: TimelineItem[];
  titleByCode: Map<string, string>;
}) {
  const label = formatDayLabel(day);
  return (
    <section>
      <div className="sticky top-16 z-10 -mx-1 px-1 mb-2 flex items-center gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted bg-bg/80 backdrop-blur px-2 py-0.5 rounded">
          {label}
        </div>
        <div className="text-[10px] text-fg-subtle">{items.length} event{items.length === 1 ? "" : "s"}</div>
        <div className="flex-1 h-px bg-border" />
      </div>
      <div className="relative pl-5">
        <div className="absolute left-1.5 top-2 bottom-2 w-px bg-border" />
        <div className="space-y-3">
          {items.map((it) => (
            <TimelineItemView
              key={`${it.kind}-${it.id}`}
              item={it}
              titleByCode={titleByCode}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function TimelineItemView({
  item,
  titleByCode,
}: {
  item: TimelineItem;
  titleByCode: Map<string, string>;
}) {
  if (item.kind === "bulk") return <BulkRow item={item} titleByCode={titleByCode} />;

  const code = item.kind === "update" ? item.taskCode ?? null : item.taskCode;
  const title = code ? titleByCode.get(code) ?? null : null;
  const dot =
    item.kind === "update"
      ? "bg-accent"
      : item.kind === "audit" && (item.newValue === "Completed" || item.newValue === "Closed")
        ? "bg-success"
        : item.kind === "audit" && (item.entryType === "ESCALATION" || item.newValue === "Escalated")
          ? "bg-danger"
          : "bg-border";

  return (
    <div className="relative">
      <div className={`absolute -left-3.5 top-1.5 w-2 h-2 rounded-full border-2 border-bg ${dot}`} />
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-[11px] text-fg-muted">
          {code && (
            <Link href={`/task/${code}`} className="font-mono hover:text-accent">{code}</Link>
          )}
          {title && <span className="truncate max-w-[420px]">— {title}</span>}
          <span className="text-fg-subtle ml-auto whitespace-nowrap">{fmtTime(item.createdAt)}</span>
        </div>
        {item.kind === "update" ? (
          <div className="group bg-accent/5 border border-accent/20 rounded-lg p-2.5 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-fg-muted">
                <FilePlus2 size={10} /> Update
              </div>
              <UpdateMenu
                updateId={item.id}
                body={item.body}
                pinned={false}
                showPin={false}
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
                {item.statusChange.from && <span className="text-fg-muted">{item.statusChange.from}</span>}
                <span className="text-fg-subtle">→</span>
                <span className="text-fg font-medium">{item.statusChange.to}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="group rounded-lg px-3 py-2 bg-bg-subtle text-xs">
            {item.entryType === "CREATE" ? (
              <p className="text-fg-muted">Task created</p>
            ) : (
              <div className="space-y-0.5">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-fg">{item.field || item.entryType}</span>
                  <AuditMenu entryId={item.id} currentReason={item.changeReason} />
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {item.oldValue && <span className="text-fg-muted">{item.oldValue}</span>}
                  {item.oldValue && item.newValue && <GitCommitHorizontal size={10} className="text-fg-subtle" />}
                  {item.newValue && <span className="text-fg font-medium">{item.newValue}</span>}
                </div>
                {item.changeReason && (
                  <p className="italic text-fg-muted">
                    <CodeLinkedText text={item.changeReason} />
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function BulkRow({
  item,
  titleByCode,
}: {
  item: TimelineBulk;
  titleByCode: Map<string, string>;
}) {
  const summary = `${item.changeReason} · ${item.items.length} tasks`;
  return (
    <div className="relative">
      <div className="absolute -left-3.5 top-1.5 w-2 h-2 rounded-full border-2 border-bg bg-warn" />
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-[11px] text-fg-muted">
          <Layers size={11} className="text-warn" />
          <span className="font-medium text-fg">{summary}</span>
          {item.field && item.newValue && (
            <span className="text-fg-muted">— {item.field} → {item.newValue}</span>
          )}
          <span className="text-fg-subtle ml-auto whitespace-nowrap">{fmtTime(item.createdAt)}</span>
        </div>
        <details className="group rounded-lg bg-bg-subtle px-3 py-2 text-xs">
          <summary className="cursor-pointer list-none flex items-center gap-1.5 text-fg-muted hover:text-fg">
            <ChevronDown size={11} className="transition-transform group-open:rotate-180" />
            View affected tasks
          </summary>
          <ul className="mt-2 space-y-0.5">
            {item.items.map((a) => {
              const c = a.taskCode;
              const title = c ? titleByCode.get(c) ?? null : null;
              return (
                <li key={a.id} className="flex items-center gap-2">
                  {c && (
                    <Link href={`/task/${c}`} className="font-mono text-[10px] text-fg-muted hover:text-accent">
                      {c}
                    </Link>
                  )}
                  <span className="truncate text-fg-muted">{title}</span>
                </li>
              );
            })}
          </ul>
        </details>
      </div>
    </div>
  );
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function formatDayLabel(k: string): string {
  const [y, m, d] = k.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - dt.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return dt.toLocaleDateString("en-GB", { weekday: "long" });
  return dt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

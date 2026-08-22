import Link from "next/link";
import { sb } from "@/db/supabase";
import type { TaskRow } from "@/lib/queries";
import {
  Activity,
  CheckCircle2,
  AlertOctagon,
  MessageSquare,
  GitCommitHorizontal,
  Layers,
  ChevronDown,
  ChevronRight,
  Trash2,
} from "lucide-react";
import { EmptyState } from "@/components/ui";
import { CodeLinkedText } from "@/components/code-linked-text";
import {
  sortTimeline,
  mergeStatusIntoUpdates,
  groupBulkRuns,
  groupFieldEdits,
  suppressUpdateMetaAudits,
  cleanReason,
  formatAuditValue,
  type TimelineItem,
  type TimelineUpdate,
  type TimelineAudit,
  type TimelineBulk,
} from "@/lib/timeline";
import { UpdateMenu } from "@/components/update-menu";
import { AuditMenu } from "@/components/audit-menu";
import { TimelineEditGroupView } from "@/components/timeline-edit-group";
import { Pencil } from "lucide-react";

const ITEM_LIMIT = 200;

export async function TimelineTab({
  companyTasks,
  companyId,
}: {
  companyTasks: TaskRow[];
  companyId: number;
  filterParam?: string | undefined;
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

  const taskIds = companyTasks.map((t) => t.id);
  const taskCodes = companyTasks.map((t) => t.code);
  const codeById = new Map(companyTasks.map((t) => [t.id, t.code]));
  const titleByCode = new Map(companyTasks.map((t) => [t.code, t.actionItem]));

  const [updRes, audRes, delUpdRes, delAudRes] = await Promise.all([
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
    // Soft-deleted rows — surfaced (collapsed) in "Recently removed" so they can be restored.
    sb
      .from("task_updates")
      .select("id,task_id,body,deleted_at")
      .in("task_id", taskIds)
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false })
      .limit(50),
    sb
      .from("audit_log")
      .select("id,task_code,field,old_value,new_value,entry_type,deleted_at")
      .in("task_code", taskCodes)
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false })
      .limit(50),
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
  // (edited/deleted/pinned) → collapse bulk runs → group field-edit bursts.
  const merged = groupFieldEdits(
    groupBulkRuns(
      suppressUpdateMetaAudits(mergeStatusIntoUpdates(sortTimeline(raw)))
    )
  );

  // Group per task (merged is already desc by time). Order tasks by their most
  // recent activity so the freshest threads sit on top.
  const byTask = new Map<string, TimelineItem[]>();
  for (const it of merged.slice(0, ITEM_LIMIT)) {
    // Bulk runs span multiple tasks → bucket them under a shared thread.
    const code = it.kind === "bulk" ? "—" : (it.taskCode ?? "—");
    const list = byTask.get(code) || [];
    list.push(it);
    byTask.set(code, list);
  }
  const orderedCodes = Array.from(byTask.keys()).sort((a, b) => {
    const ta = byTask.get(a)![0].createdAt.getTime();
    const tb = byTask.get(b)![0].createdAt.getTime();
    return tb - ta;
  });

  return (
    <div className="space-y-4">
      <ActivitySummary items={merged} />

      {orderedCodes.length === 0 ? (
        <EmptyState
          icon={<Activity size={28} />}
          title="No activity yet."
          hint="Updates and field changes on this company's tasks will appear here."
        />
      ) : (
        <div className="space-y-2.5">
          {orderedCodes.map((code) => (
            <TaskThread
              key={code}
              code={code}
              title={code === "—" ? "Bulk changes" : (titleByCode.get(code) ?? null)}
              items={byTask.get(code)!}
            />
          ))}
        </div>
      )}

      <RemovedSection
        updates={(delUpdRes.data ?? []) as RemovedUpdate[]}
        audits={(delAudRes.data ?? []) as RemovedAudit[]}
        codeById={codeById}
      />
    </div>
  );
}

type RemovedUpdate = { id: number; task_id: number; body: string; deleted_at: string | null };
type RemovedAudit = {
  id: number; task_code: string | null; field: string | null;
  old_value: string | null; new_value: string | null; entry_type: string | null; deleted_at: string | null;
};

/** Collapsed "Recently removed" drawer — soft-deleted updates + audit entries, each
 *  restorable in place. Kept separate from the live timeline so a removed item never
 *  pollutes the activity counts, but stays reachable (and recoverable). */
function RemovedSection({
  updates,
  audits,
  codeById,
}: {
  updates: RemovedUpdate[];
  audits: RemovedAudit[];
  codeById: Map<number, string>;
}) {
  const total = updates.length + audits.length;
  if (total === 0) return null;

  return (
    <details className="group glass elevated rounded-2xl overflow-hidden">
      {/* On a phone the code chip and the event count are `shrink-0`, so the TITLE
          was the only thing that could give — "Clifford Machinery Update - …" in
          about 200px while "1 event" sat there in full. It WRAPS below `sm` now
          instead of truncating, so the whole title is readable.
          ⚠️ It does NOT get a line of its own, and three attempts to give it one
          failed: `basis-full` loses to `flex-1`'s basis, and with shrink still at
          1 the item shrinks to fit rather than wrapping to a new line — set
          `shrink-0` as well and it overflows the row instead. Forcing the break
          needs the markup restructured, which is not worth it for a title that
          already reads in full. */}
      <summary className="list-none cursor-pointer flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-3 select-none sm:flex-nowrap">
        <ChevronRight size={14} className="text-fg-subtle transition-transform group-open:rotate-90 shrink-0" />
        <Trash2 size={13} className="text-fg-subtle shrink-0" />
        <span className="text-sm font-medium">Recently removed</span>
        <span className="text-xs text-fg-subtle tabular ml-auto">{total} hidden</span>
      </summary>
      <div className="px-4 pb-4 space-y-2 opacity-80">
        {updates.map((u) => (
          <div key={`u-${u.id}`} className="flex items-start justify-between gap-2 text-xs bg-bg-subtle/60 rounded-xl px-3 py-2">
            <div className="min-w-0">
              <span className="text-xs uppercase tracking-wider text-fg-subtle">Update · {codeById.get(u.task_id) ?? "—"}</span>
              <p className="text-fg-muted line-through truncate mt-0.5">{u.body}</p>
            </div>
            <UpdateMenu updateId={u.id} body={u.body} pinned={false} showPin={false} deleted />
          </div>
        ))}
        {audits.map((a) => (
          <div key={`a-${a.id}`} className="flex items-start justify-between gap-2 text-xs bg-bg-subtle/60 rounded-xl px-3 py-2">
            <div className="min-w-0">
              <span className="text-xs uppercase tracking-wider text-fg-subtle">{a.field || a.entry_type} · {a.task_code ?? "—"}</span>
              <p className="text-fg-muted line-through truncate mt-0.5">
                {[a.old_value, a.new_value].filter(Boolean).join(" → ") || "Audit entry"}
              </p>
            </div>
            <AuditMenu entryId={a.id} currentReason={null} deleted />
          </div>
        ))}
      </div>
    </details>
  );
}

function ActivitySummary({ items }: { items: TimelineItem[] }) {
  const expand = (arr: TimelineItem[]): Array<TimelineUpdate | TimelineAudit> => {
    const out: Array<TimelineUpdate | TimelineAudit> = [];
    for (const i of arr) {
      if (i.kind === "bulk" || i.kind === "editgroup") out.push(...i.items);
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

  const tiles = [
    { label: "Updates", value: updates, Icon: MessageSquare, tone: "text-accent" },
    { label: "Status", value: statusChanges, Icon: GitCommitHorizontal, tone: "text-fg" },
    { label: "Completions", value: completions, Icon: CheckCircle2, tone: "text-success" },
    { label: "Escalations", value: escalations, Icon: AlertOctagon, tone: "text-danger" },
  ];

  return (
    // Four across gives each tile ~80px on a phone, and every label truncated to
    // "UPDA…", "STAT…", "COMP…", "ESCA…" — four numbers with nothing to say what
    // they count. Two across below `sm`; unchanged from `sm` up.
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {tiles.map((s) => (
        <div key={s.label} className="glass elevated rounded-xl px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-fg-muted">
            <s.Icon size={11} /> <span className="truncate">{s.label}</span>
          </div>
          <div className={`text-lg font-semibold tabular mt-0.5 ${s.tone}`}>{s.value}</div>
        </div>
      ))}
    </div>
  );
}

/** One collapsible thread per task — its events nested as a compact timeline. */
function TaskThread({
  code,
  title,
  items,
}: {
  code: string;
  title: string | null;
  items: TimelineItem[];
}) {
  return (
    <details className="group glass elevated rounded-2xl overflow-hidden" open>
      <summary className="list-none cursor-pointer flex items-center gap-2 px-4 py-3 select-none">
        <ChevronRight size={14} className="text-fg-subtle transition-transform group-open:rotate-90 shrink-0" />
        {code !== "—" && (
          <Link
            href={`/task/${code}`}
            className="font-mono text-xs font-medium text-fg-muted px-1.5 py-0.5 rounded-md bg-bg-subtle/80 ring-1 ring-border/60 shrink-0 hover:text-accent"
          >
            {code}
          </Link>
        )}
        <span className="text-sm font-medium truncate min-w-0 flex-1 max-sm:whitespace-normal max-sm:text-clip">{title ?? "Task"}</span>
        <span className="text-xs text-fg-subtle tabular shrink-0">{items.length} event{items.length === 1 ? "" : "s"}</span>
      </summary>

      <div className="px-4 pb-4">
        <div className="relative pl-4">
          <div className="absolute left-1 top-1.5 bottom-1.5 w-px bg-border" />
          <div className="space-y-2.5">
            {items.map((it) => (
              <EventRow key={`${it.kind}-${it.id}`} item={it} />
            ))}
          </div>
        </div>
      </div>
    </details>
  );
}

/** A single event inside a task thread — no repeated code/title, just content + time. */
function EventRow({ item }: { item: TimelineItem }) {
  const dot =
    item.kind === "update"
      ? "bg-accent"
      : item.kind === "bulk"
        ? "bg-warn"
        : item.kind === "audit" && (item.newValue === "Completed" || item.newValue === "Closed")
          ? "bg-success"
          : item.kind === "audit" && (item.entryType === "ESCALATION" || item.newValue === "Escalated")
            ? "bg-danger"
            : "bg-border";

  return (
    <div className="relative">
      <div className={`absolute -left-[13px] top-2 w-2 h-2 rounded-full border-2 border-bg ${dot}`} />

      {item.kind === "editgroup" ? (
        <div className="flex items-start justify-between gap-2">
          <TimelineEditGroupView group={item} />
          <span className="text-xs text-fg-subtle tabular shrink-0 pt-0.5">{fmtTime(item.createdAt)}</span>
        </div>
      ) : item.kind === "bulk" ? (
        <BulkRow item={item} />
      ) : item.kind === "update" ? (
        <div className="bg-accent/5 ring-1 ring-accent/15 rounded-xl p-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs uppercase tracking-wider text-fg-muted">Update</span>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-fg-subtle tabular">{fmtTime(item.createdAt)}</span>
              <UpdateMenu updateId={item.id} body={item.body} pinned={false} showPin={false} />
            </div>
          </div>
          <p className="text-sm leading-relaxed mt-1"><CodeLinkedText text={item.body} /></p>
          {item.editedAt && item.originalBody && (
            <details className="text-xs mt-1">
              <summary className="cursor-pointer list-none inline-flex items-center gap-1 text-fg-subtle hover:text-fg w-fit">
                <Pencil size={9} /> edited · view original
              </summary>
              <div className="mt-1.5 px-2.5 py-1.5 rounded bg-bg-subtle italic text-fg-muted leading-relaxed">
                &ldquo;{item.originalBody}&rdquo;
              </div>
            </details>
          )}
          {item.statusChange && (
            <div className="inline-flex items-center gap-1.5 text-xs bg-bg-subtle rounded-full px-2 py-0.5 mt-1.5">
              <GitCommitHorizontal size={10} className="text-fg-subtle" />
              {item.statusChange.from && <span className="text-fg-muted">{item.statusChange.from}</span>}
              <span className="text-fg-subtle">→</span>
              <span className="text-fg font-medium">{item.statusChange.to}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="text-xs">
          {item.entryType === "CREATE" ? (
            <div className="flex items-center justify-between gap-2 py-0.5">
              <span className="text-fg-muted">Task created</span>
              <span className="text-xs text-fg-subtle tabular">{fmtTime(item.createdAt)}</span>
            </div>
          ) : (
            <div className="space-y-0.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-fg">{item.field || item.entryType}</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-fg-subtle tabular">{fmtTime(item.createdAt)}</span>
                  <AuditMenu entryId={item.id} currentReason={item.changeReason} />
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {item.oldValue && <span className="text-fg-muted">{formatAuditValue(item.field, item.oldValue)}</span>}
                {item.oldValue && item.newValue && <GitCommitHorizontal size={10} className="text-fg-subtle" />}
                {item.newValue && <span className="text-fg font-medium">{formatAuditValue(item.field, item.newValue)}</span>}
              </div>
              {cleanReason(item.changeReason) && (
                <p className="italic text-fg-muted"><CodeLinkedText text={cleanReason(item.changeReason)!} /></p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BulkRow({ item }: { item: TimelineBulk }) {
  return (
    <details className="group/bulk text-xs">
      <summary className="cursor-pointer list-none flex items-center gap-1.5 text-fg-muted hover:text-fg">
        <Layers size={11} className="text-warn shrink-0" />
        <span className="font-medium text-fg truncate">{item.changeReason} · {item.items.length} tasks</span>
        {item.field && item.newValue && <span className="text-fg-muted hidden sm:inline">— {item.field} → {item.newValue}</span>}
        <ChevronDown size={11} className="ml-auto transition-transform group-open/bulk:rotate-180 shrink-0" />
        <span className="text-xs text-fg-subtle tabular shrink-0">{fmtTime(item.createdAt)}</span>
      </summary>
      <ul className="mt-2 space-y-0.5 pl-4">
        {item.items.map((a) => (
          <li key={a.id} className="flex items-center gap-2">
            {a.taskCode && (
              <Link href={`/task/${a.taskCode}`} className="font-mono text-xs text-fg-muted hover:text-accent">{a.taskCode}</Link>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

function fmtTime(d: Date): string {
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

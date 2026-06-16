"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { motion, LayoutGroup, useReducedMotion } from "framer-motion";
import {
  ExternalLink, Clock, CheckCircle2, AlertOctagon, Plus, X, Loader2, Building2,
} from "lucide-react";
import type { TaskRow } from "@/lib/queries";
import { spring } from "@/lib/motion";
import { Badge } from "@/components/ui";
import { FluidSelect, type FluidOption } from "@/components/fluid-select";
import { Combobox } from "@/components/combobox";
import { TaskInlineStatus, TaskInlinePriority } from "@/components/task-inline-edit";
import { TaskMetaLine, PinnedMarker, WaitingOnChip } from "@/components/task-meta-line";
import { TaskUpdateLine } from "@/components/task-update-line";
import { TaskRowActions } from "@/components/task-row-actions";
import { AssigneeList } from "@/components/assignee-list";
import { PeekPreview, type PeekAction } from "@/components/peek-preview";
import { TaskContext } from "@/components/task-context";
import { PeekQuickUpdate } from "@/components/peek-quick-update";
import { SnoozeSheet } from "@/components/snooze-sheet";
import { triggerHaptic } from "@/lib/use-long-press";
import { useToast } from "@/components/toast";
import { callUndo } from "@/components/undo-banner";
import { inlineUpdateTask } from "@/app/task/actions";
import { createCaptureTask } from "@/app/capture/actions";
import { SelectCheckbox, OrderRegistrar } from "./selection";

const BOARD_STATUSES = [
  "Not Started", "In Progress", "Under Review", "Waiting External",
  "Blocked", "Escalated", "Completed", "Closed",
] as const;

function priorityTone(p: string): "default" | "success" | "warn" | "danger" | "info" {
  if (p === "Critical") return "danger";
  if (p === "High") return "warn";
  if (p === "Medium") return "info";
  return "default";
}

function statusTone(s: string): "default" | "success" | "warn" | "danger" | "info" {
  if (s === "Completed" || s === "Closed") return "success";
  if (s === "Blocked" || s === "Escalated") return "danger";
  if (s === "Waiting External" || s === "Under Review") return "warn";
  if (s === "In Progress") return "info";
  return "default";
}

/** The coloured priority spine down a card's leading edge (CSS var → token colour). */
function prioritySpine(p: string): string {
  if (p === "Critical") return "hsl(var(--danger))";
  if (p === "High") return "hsl(var(--warn))";
  if (p === "Medium") return "hsl(var(--info))";
  return "hsl(var(--fg-subtle))";
}

const PRIORITY_ORDER = ["Critical", "High", "Medium", "Low"];

export function BoardView({ rows, showClosed }: { rows: TaskRow[]; showClosed: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const reduce = useReducedMotion();

  // Optimistic status overrides (code → status) so a dropped card moves instantly.
  const [moved, setMoved] = useState<Record<string, string>>({});
  const [dragCode, setDragCode] = useState<string | null>(null);
  const [overStatus, setOverStatus] = useState<string | null>(null);
  const [peek, setPeek] = useState<TaskRow | null>(null);
  const [snoozeRow, setSnoozeRow] = useState<TaskRow | null>(null);
  const [addInStatus, setAddInStatus] = useState<string | null>(null);

  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStart = useRef<{ x: number; y: number } | null>(null);
  const longPressed = useRef(false);

  // Companies + people derived from the visible rows — the board is global, so we
  // don't need the host to pass them in for the per-column quick-add.
  const companies = useMemo(
    () => [...new Map(rows.map((r) => [r.companyId, r.companyName])).entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [rows],
  );
  const people = useMemo(
    () => [...new Set(rows.flatMap((r) => r.assignees))].filter(Boolean).sort(),
    [rows],
  );

  const statusOf = (r: TaskRow) => moved[r.code] ?? r.status;
  const visible = BOARD_STATUSES.filter((s) => showClosed || s !== "Closed");
  const columns = visible.map((s) => ({
    status: s,
    items: rows
      .filter((r) => statusOf(r) === s)
      .sort((a, b) => PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority)),
  }));
  const orderedCodes = columns.flatMap((c) => c.items.map((r) => r.code));

  function openTask(code: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("task", code);
    params.delete("person");
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  async function move(r: TaskRow, toStatus: string) {
    if (statusOf(r) === toStatus) return;
    setMoved((m) => ({ ...m, [r.code]: toStatus }));
    triggerHaptic();
    const res = await inlineUpdateTask(r.code, "status", toStatus);
    if (res.ok) {
      toast(`${r.code} → ${toStatus}`, {
        tone: "success", duration: 6000,
        action: res.undoToken ? { label: "Undo", onClick: async () => { await callUndo(res.undoToken!); setMoved((m) => { const n = { ...m }; delete n[r.code]; return n; }); router.refresh(); } } : undefined,
      });
    } else {
      setMoved((m) => { const n = { ...m }; delete n[r.code]; return n; }); // revert
      toast(res.error || "Move failed", { tone: "warn", duration: 3000 });
    }
    router.refresh();
  }

  async function doSnooze(r: TaskRow, iso: string) {
    const res = await inlineUpdateTask(r.code, "deadline", iso);
    if (res.ok) {
      const when = new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
      toast(`${r.code} snoozed to ${when}`, { tone: "success", duration: 6000, action: res.undoToken ? { label: "Undo", onClick: async () => { await callUndo(res.undoToken!); router.refresh(); } } : undefined });
    }
    router.refresh();
  }

  async function runPeek(action: "complete" | "escalate", r: TaskRow) {
    const field = action === "complete" ? "status" : "escalation";
    const value = action === "complete" ? "Completed" : "Yes";
    const res = await inlineUpdateTask(r.code, field, value);
    if (res.ok) {
      toast(`${r.code} ${action === "complete" ? "completed" : "escalated"}`, {
        tone: "success",
        duration: 6000,
        action: res.undoToken ? { label: "Undo", onClick: async () => { await callUndo(res.undoToken!); router.refresh(); } } : undefined,
      });
      setPeek(null);
    } else {
      toast(res.error || "Update failed", { tone: "warn", duration: 3000 });
    }
    router.refresh();
  }

  // Long-press → peek (cleared if a drag or scroll starts).
  function clearPress() { if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; } }
  function onCardPointerDown(r: TaskRow, e: React.PointerEvent) {
    longPressed.current = false;
    pressStart.current = { x: e.clientX, y: e.clientY };
    clearPress();
    pressTimer.current = setTimeout(() => { longPressed.current = true; triggerHaptic(); setPeek(r); }, 400);
  }
  function onCardPointerMove(e: React.PointerEvent) {
    if (!pressStart.current) return;
    if (Math.abs(e.clientX - pressStart.current.x) > 8 || Math.abs(e.clientY - pressStart.current.y) > 8) clearPress();
  }

  const peekActions = (r: TaskRow): PeekAction[] => {
    const done = r.status === "Completed" || r.status === "Closed";
    return [
      { label: "Open", icon: <ExternalLink size={15} />, tone: "accent", onClick: () => openTask(r.code) },
      ...(done ? [] : [{ label: "Complete", icon: <CheckCircle2 size={15} />, onClick: () => runPeek("complete", r) }]),
      ...(!done && r.escalation !== "Yes" ? [{ label: "Escalate", icon: <AlertOctagon size={15} />, tone: "danger" as const, onClick: () => runPeek("escalate", r) }] : []),
      { label: "Snooze…", icon: <Clock size={15} />, onClick: () => setSnoozeRow(r) },
    ];
  };

  return (
    <>
      <OrderRegistrar codes={orderedCodes} />
      <LayoutGroup>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
        {columns.map((col) => (
          <div
            key={col.status}
            onDragOver={(e) => { e.preventDefault(); setOverStatus(col.status); }}
            onDragLeave={() => setOverStatus((s) => (s === col.status ? null : s))}
            onDrop={(e) => {
              e.preventDefault();
              const r = rows.find((x) => x.code === dragCode);
              if (r) move(r, col.status);
              setDragCode(null); setOverStatus(null);
            }}
            className={
              "w-[244px] sm:w-[268px] shrink-0 rounded-2xl transition-colors " +
              (overStatus === col.status ? "bg-accent/8 ring-1 ring-accent/40" : "")
            }
          >
            <div className="flex items-center gap-2 px-2 py-1.5 sticky top-0">
              <span className="inline-flex h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: `hsl(var(--${toneVar(statusTone(col.status))}))` }} />
              <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted truncate">{col.status}</div>
              <div className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-bg-subtle text-fg-muted text-[10px] font-semibold tabular">{col.items.length}</div>
              {/* + per column → create straight into this status */}
              {col.status !== "Completed" && col.status !== "Closed" && (
                <button
                  type="button"
                  onClick={() => setAddInStatus((s) => (s === col.status ? null : col.status))}
                  aria-label={`Add a task to ${col.status}`}
                  title={`Add a task to ${col.status}`}
                  className="ml-auto inline-flex h-5 w-5 items-center justify-center rounded-md text-fg-subtle hover:text-accent hover:bg-bg-muted/70 transition-colors"
                >
                  <Plus size={14} />
                </button>
              )}
            </div>

            {addInStatus === col.status && (
              <ColumnQuickAdd
                status={col.status}
                companies={companies}
                people={people}
                onClose={() => setAddInStatus(null)}
                onCreated={(code) => {
                  setAddInStatus(null);
                  toast(`${code} added to ${col.status}`, { tone: "success", duration: 5000 });
                  router.refresh();
                }}
              />
            )}

            <div className="space-y-1.5 min-h-[60px] px-0.5 pb-1">
              {col.items.map((r) => {
                const done = r.status === "Completed" || r.status === "Closed";
                return (
                <motion.div key={r.id} layout={!reduce} layoutId={reduce ? undefined : r.code} transition={spring}>
                <div
                  draggable
                  onDragStart={(e) => { clearPress(); setDragCode(r.code); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", r.code); }}
                  onDragEnd={() => { setDragCode(null); setOverStatus(null); }}
                  onPointerDown={(e) => onCardPointerDown(r, e)}
                  onPointerMove={onCardPointerMove}
                  onPointerUp={clearPress}
                  onPointerLeave={clearPress}
                  onPointerCancel={clearPress}
                  onContextMenu={(e) => e.preventDefault()}
                  onClick={() => { if (longPressed.current) { longPressed.current = false; return; } openTask(r.code); }}
                  className={
                    "group/card relative glass elevated rounded-xl p-2.5 pl-3 overflow-hidden " +
                    "cursor-grab active:cursor-grabbing select-none transition-shadow hover:shadow-md " +
                    "focus-within:ring-1 focus-within:ring-accent/30 " +
                    (dragCode === r.code ? "opacity-40 " : "") + (done ? "opacity-65 " : "")
                  }
                >
                  {/* Coloured priority spine */}
                  <span
                    aria-hidden
                    className="absolute inset-y-0 left-0 w-[3px] rounded-l-xl"
                    style={{ backgroundColor: prioritySpine(r.priority) }}
                  />

                  {/* Header: select · code · pin · trailing actions */}
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-1.5 min-w-0" onClick={(e) => e.stopPropagation()}>
                      <SelectCheckbox code={r.code} />
                      <span className="font-mono text-[10px] text-fg-muted">{r.code}</span>
                      {r.unread && <span title="New activity since you last looked" className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
                      <PinnedMarker task={r} />
                    </div>
                    <div className="opacity-0 group-hover/card:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
                      <TaskRowActions task={r} compact onDone={() => router.refresh()} />
                    </div>
                  </div>

                  {/* Title */}
                  <div className={"text-[13px] leading-snug mb-1 line-clamp-2" + (done ? " line-through decoration-fg-subtle/40" : "")}>{r.actionItem}</div>

                  {/* Description snippet */}
                  <TaskMetaLine task={r} className="mb-1.5" />

                  {/* Waiting-on chip for Blocked / Waiting-External */}
                  {r.waiting && <div className="mb-1.5"><WaitingOnChip task={r} on={r.owner} /></div>}

                  {/* Latest activity (taps through to the Conversation tab) */}
                  <div onClick={(e) => e.stopPropagation()} className="mb-2">
                    <TaskUpdateLine task={r} onOpenConversation={() => openTask(r.code)} />
                  </div>

                  {/* In-row glass inline edits */}
                  <div className="flex items-center gap-1.5 mb-2" onClick={(e) => e.stopPropagation()}>
                    <TaskInlineStatus task={r} buttonClassName="text-[11px] py-0.5" />
                    <TaskInlinePriority task={r} buttonClassName="text-[11px] py-0.5" />
                  </div>

                  {/* Footer: company · assignees */}
                  <div className="flex items-center justify-between text-[11px] text-fg-muted gap-2">
                    <span className="truncate inline-flex items-center gap-1.5 min-w-0">
                      <span className="inline-block w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: r.companyAccent || "transparent" }} />
                      <span className="truncate">{r.companyName}</span>
                    </span>
                    {r.assignees.length > 0 ? (
                      <span onClick={(e) => e.stopPropagation()} className="shrink-0 truncate max-w-[55%] text-right">
                        <AssigneeList names={r.assignees} ids={r.assigneeIds} className="text-fg-muted" />
                      </span>
                    ) : (
                      <span className="shrink-0 italic text-fg-subtle">Unassigned</span>
                    )}
                  </div>
                </div>
                </motion.div>
                );
              })}

              {col.items.length === 0 && addInStatus !== col.status && (
                <div className="rounded-lg border border-dashed border-border/70 text-center text-[11px] text-fg-subtle py-6">
                  Drop here
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      </LayoutGroup>

      <PeekPreview
        open={!!peek}
        onClose={() => setPeek(null)}
        onOpen={peek ? () => openTask(peek.code) : undefined}
        title={peek?.actionItem}
        subtitle={peek ? `${peek.code} · ${peek.companyName}` : undefined}
        creator={peek?.latestActivity?.author ?? null}
        whenISO={peek?.latestActivity?.atISO ?? null}
        pills={peek ? (
          <>
            <Badge tone={statusTone(peek.status)}>{peek.status}</Badge>
            <Badge tone={priorityTone(peek.priority)}>{peek.priority}</Badge>
          </>
        ) : undefined}
        body={peek ? <TaskContext comments={peek.comments} latestUpdate={peek.latestUpdate} /> : undefined}
        quickUpdate={peek ? <PeekQuickUpdate row={peek} onPosted={() => { setPeek(null); router.refresh(); }} /> : undefined}
        actions={peek ? peekActions(peek) : []}
        actionsLayout="row"
      />

      <SnoozeSheet
        open={!!snoozeRow}
        onClose={() => setSnoozeRow(null)}
        onPick={(iso) => { if (snoozeRow) doSnooze(snoozeRow, iso); }}
        label={snoozeRow ? `Snooze ${snoozeRow.code} until…` : undefined}
      />
    </>
  );
}

/** Map a Badge tone to the matching CSS colour variable for the column dot. */
function toneVar(t: "default" | "success" | "warn" | "danger" | "info"): string {
  if (t === "success") return "success";
  if (t === "warn") return "warn";
  if (t === "danger") return "danger";
  if (t === "info") return "info";
  return "fg-subtle";
}

/* ------------------------------------------------------------------ *
 * ColumnQuickAdd — a soft inline composer docked under a column header.
 * Creates a task straight into the column's status via createCaptureTask
 * (no new server action). Defaults priority Medium / status = the column.
 * ------------------------------------------------------------------ */
function ColumnQuickAdd({
  status,
  companies,
  people,
  onClose,
  onCreated,
}: {
  status: string;
  companies: { id: number; name: string }[];
  people: string[];
  onClose: () => void;
  onCreated: (code: string) => void;
}) {
  const { toast } = useToast();
  const [action, setAction] = useState("");
  const [companyId, setCompanyId] = useState<number | undefined>(companies[0]?.id);
  const [assignee, setAssignee] = useState("");
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const companyOptions: FluidOption[] = companies.map((c) => ({ value: String(c.id), label: c.name }));

  async function submit() {
    const a = action.trim();
    if (!a) { inputRef.current?.focus(); return; }
    if (!companyId) { toast("Pick a company first.", { tone: "warn" }); return; }
    setPending(true);
    const res = await createCaptureTask({
      companyId,
      actionItem: a,
      status,
      priority: "Medium",
      assignees: assignee.trim() || undefined,
    });
    setPending(false);
    if (res.ok && res.code) {
      setAction("");
      onCreated(res.code);
    } else {
      toast(res.error || "Couldn't create task.", { tone: "danger" });
    }
  }

  return (
    <div className="glass glass-menu elevated rounded-xl p-2 mb-2 mx-0.5 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-muted">New in {status}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cancel"
          className="inline-flex h-5 w-5 items-center justify-center rounded-md text-fg-subtle hover:text-fg hover:bg-bg-muted/70 transition-colors"
        >
          <X size={13} />
        </button>
      </div>
      <textarea
        ref={inputRef}
        autoFocus
        rows={2}
        value={action}
        onChange={(e) => setAction(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); submit(); }
          if (e.key === "Escape") onClose();
        }}
        placeholder="What needs doing?"
        className="w-full rounded-lg px-2.5 py-1.5 text-[13px] bg-bg-muted/50 ring-1 ring-border/50 placeholder:text-fg-subtle resize-none focus:outline-none focus:ring-accent/40 transition-shadow"
      />
      <div className="flex items-center gap-1.5">
        <span className="inline-flex items-center gap-1 text-fg-subtle"><Building2 size={12} /></span>
        <FluidSelect
          value={String(companyId ?? "")}
          options={companyOptions}
          onSelect={(v) => setCompanyId(Number(v))}
          placeholder="Company"
          buttonClassName="text-[11px] py-0.5"
        />
      </div>
      <Combobox
        options={people}
        placeholder="Assignee (optional)"
        onInput={setAssignee}
        onCommit={setAssignee}
        className="w-full rounded-lg px-2.5 py-1.5 text-[12px] bg-bg-muted/50 ring-1 ring-border/50 placeholder:text-fg-subtle focus:outline-none focus:ring-accent/40 transition-shadow"
      />
      <div className="flex items-center justify-end gap-2 pt-0.5">
        <span className="mr-auto text-[10px] text-fg-subtle">⌘↵ to add</span>
        <button
          type="button"
          onClick={submit}
          disabled={pending || !action.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1 text-[12px] font-medium text-accent-fg disabled:opacity-40 hover:opacity-90 active:scale-95 transition-all"
        >
          {pending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
          Add
        </button>
      </div>
    </div>
  );
}

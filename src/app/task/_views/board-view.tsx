"use client";

import { useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ExternalLink, Clock } from "lucide-react";
import type { TaskRow } from "@/lib/queries";
import { flagLabel } from "@/lib/derive";
import { Badge } from "@/components/ui";
import { InlineEdit } from "@/components/inline-edit";
import { Deadline } from "@/components/deadline";
import { AssigneeList } from "@/components/assignee-list";
import { PeekPreview, type PeekAction } from "@/components/peek-preview";
import { TaskQuickEdit } from "@/components/task-quick-edit";
import { SnoozeSheet } from "@/components/snooze-sheet";
import { triggerHaptic } from "@/lib/use-long-press";
import { useToast } from "@/components/toast";
import { callUndo } from "@/components/undo-banner";
import { inlineUpdateTask } from "@/app/task/actions";
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

function flagBadgeTone(f: string): "default" | "success" | "warn" | "danger" | "info" {
  switch (f) {
    case "closed": return "default";
    case "escalated": case "escalate-now": case "overdue": case "stalled": return "danger";
    case "due-soon": case "no-deadline": case "aging": return "warn";
    case "on-track": return "success";
    default: return "default";
  }
}

const PRIORITY_ORDER = ["Critical", "High", "Medium", "Low"];

export function BoardView({ rows, showClosed }: { rows: TaskRow[]; showClosed: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  // Optimistic status overrides (code → status) so a dropped card moves instantly.
  const [moved, setMoved] = useState<Record<string, string>>({});
  const [dragCode, setDragCode] = useState<string | null>(null);
  const [overStatus, setOverStatus] = useState<string | null>(null);
  const [peek, setPeek] = useState<TaskRow | null>(null);
  const [snoozeRow, setSnoozeRow] = useState<TaskRow | null>(null);

  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStart = useRef<{ x: number; y: number } | null>(null);
  const longPressed = useRef(false);

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

  const peekActions = (r: TaskRow): PeekAction[] => [
    { label: "Open", icon: <ExternalLink size={15} />, tone: "accent", onClick: () => openTask(r.code) },
    { label: "Snooze…", icon: <Clock size={15} />, onClick: () => setSnoozeRow(r) },
  ];

  return (
    <>
      <OrderRegistrar codes={orderedCodes} />
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
              "w-[268px] shrink-0 rounded-xl transition-colors " +
              (overStatus === col.status ? "bg-accent/8 ring-1 ring-accent/40" : "")
            }
          >
            <div className="flex items-center justify-between px-2.5 py-1.5 sticky top-0">
              <div className="text-xs font-semibold uppercase tracking-wider text-fg-muted">{col.status}</div>
              <div className="text-xs text-fg-subtle tabular">{col.items.length}</div>
            </div>

            <div className="space-y-2 min-h-[60px] px-0.5 pb-1">
              {col.items.map((r) => (
                <div
                  key={r.id}
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
                    "elevated bg-bg-elev rounded-xl p-3 border-l-[3px] cursor-grab active:cursor-grabbing select-none " +
                    "transition-shadow hover:shadow-md " + (dragCode === r.code ? "opacity-40" : "")
                  }
                  style={{ borderLeftColor: r.companyAccent || "transparent" }}
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-1.5 min-w-0" onClick={(e) => e.stopPropagation()}>
                      <SelectCheckbox code={r.code} />
                      <span className="font-mono text-[10px] text-fg-muted">{r.code}</span>
                    </div>
                    <span onClick={(e) => e.stopPropagation()}>
                      <InlineEdit field="priority" taskCode={r.code} value={r.priority}>
                        <Badge tone={priorityTone(r.priority)}>{r.priority}</Badge>
                      </InlineEdit>
                    </span>
                  </div>

                  <div className="text-sm leading-snug mb-2 line-clamp-3 group-hover:text-accent">{r.actionItem}</div>

                  <div className="flex items-center justify-between text-xs text-fg-muted gap-2">
                    <span className="truncate inline-flex items-center gap-1.5">
                      <span className="inline-block w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: r.companyAccent || "transparent" }} />
                      {r.companyName}
                    </span>
                    <span onClick={(e) => e.stopPropagation()}>
                      <InlineEdit field="deadline" taskCode={r.code} value={r.deadline ? r.deadline.toISOString() : null} className="whitespace-nowrap">
                        <Deadline date={r.deadline} />
                      </InlineEdit>
                    </span>
                  </div>

                  {r.assignees.length > 0 && (
                    <div className="text-xs text-fg-subtle mt-1.5 truncate" onClick={(e) => e.stopPropagation()}>
                      <AssigneeList names={r.assignees} ids={r.assigneeIds} />
                    </div>
                  )}

                  <div className="mt-2">
                    <Badge tone={flagBadgeTone(r.flag)}>{flagLabel[r.flag]}</Badge>
                  </div>
                </div>
              ))}

              {col.items.length === 0 && (
                <div className="rounded-lg border border-dashed border-border/70 text-center text-[11px] text-fg-subtle py-6">
                  Drop here
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <PeekPreview
        open={!!peek}
        onClose={() => setPeek(null)}
        onOpen={peek ? () => openTask(peek.code) : undefined}
        title={peek?.actionItem}
        subtitle={peek ? `${peek.code} · ${peek.companyName} · ${peek.status}` : undefined}
        body={peek?.latestUpdate || undefined}
        editor={peek ? <TaskQuickEdit row={peek} onChanged={() => router.refresh()} /> : undefined}
        actions={peek ? peekActions(peek) : []}
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

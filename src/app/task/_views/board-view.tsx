"use client";

/**
 * The Tasks board — one column per stage, in the Studio look (owner, 26 Sept
 * 2026: "the board needs to be improved completely, revamped").
 *
 * Drag a card to another column to change its stage (the same write and undo
 * toast as the list's status menu); a tap opens the side panel, as a list row
 * does; a long press peeks. "+" on a column adds a task straight into it.
 *
 * ⚠️ From `sm` up the board is exactly as tall as the window allows
 * (useFillViewport) and each column scrolls its own cards, so a column's
 * heading never scrolls away. A phone shows one column at a time and the page
 * scrolls — a nested scroller under a thumb fights the page.
 */
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertOctagon, CheckCircle2, Clock, ExternalLink, Loader2, Plus, Repeat } from "lucide-react";
import type { TaskRow } from "@/lib/tasks/queries";
import { markPush, withReturn } from "@/lib/nav/return-to";
import { taskHref } from "@/lib/tasks/task-href";
import { useFillViewport } from "@/lib/hooks/use-fill-viewport";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { triggerHaptic } from "@/lib/hooks/use-long-press";
import { useToast } from "@/components/shell/toast";
import { callUndo } from "@/components/shell/undo-banner";
import { inlineUpdateTask } from "@/app/task/actions";
import { createCaptureTask } from "@/app/capture/actions";
import { PeekPreview, type PeekAction } from "@/components/tasks/peek-preview";
import { TaskContext } from "@/components/tasks/task-context";
import { PeekQuickUpdate } from "@/components/tasks/peek-quick-update";
import { SnoozeSheet } from "@/components/tasks/snooze-sheet";
import { PinnedMarker, WaitingOnChip } from "@/components/tasks/task-meta-line";
import { Combobox } from "@/components/forms/combobox";
import { StudioChoiceMenu, StudioFaces } from "@/components/studio/tasks/cells";
import { useStudioPick } from "@/components/studio/tasks/pick";
import { STATUS_DOT, ago, deadlineWords } from "@/components/studio/tasks/task-words";
import { Dot, stBtn } from "@/components/studio/kit";
import { cn } from "@/lib/cn";
import { SelectCheckbox, OrderRegistrar, useSelection } from "./selection";

const STAGES = [
  "Not Started", "In Progress", "Under Review", "Waiting External",
  "Blocked", "Escalated", "Completed", "Closed",
] as const;

const PRIORITY_ORDER = ["Critical", "High", "Medium", "Low"];
const isDone = (s: string) => s === "Completed" || s === "Closed";

export function BoardView({ rows, showClosed }: { rows: TaskRow[]; showClosed: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const pick = useStudioPick();
  const { selected } = useSelection();
  const ticking = selected.size > 0;
  const phone = useMediaQuery("(max-width: 639px)");
  const frame = useRef<HTMLDivElement>(null);
  useFillViewport(frame, { mode: "exact", minimum: 420, enabled: !phone, deps: [phone] });

  // Optimistic stage overrides (code → stage) so a dropped card moves at once.
  const [moved, setMoved] = useState<Record<string, string>>({});
  const [dragCode, setDragCode] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const [peek, setPeek] = useState<TaskRow | null>(null);
  const [snoozeRow, setSnoozeRow] = useState<TaskRow | null>(null);
  const [addIn, setAddIn] = useState<string | null>(null);

  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStart = useRef<{ x: number; y: number } | null>(null);
  const longPressed = useRef(false);

  // The per-column quick add offers the companies and people on the board.
  const companies = useMemo(
    () => [...new Map(rows.map((r) => [r.companyId, r.companyName])).entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [rows],
  );
  const people = useMemo(() => [...new Set(rows.flatMap((r) => r.assignees))].filter(Boolean).sort(), [rows]);

  const stageOf = (r: TaskRow) => moved[r.code] ?? r.status;
  const columns = STAGES.filter((s) => showClosed || s !== "Closed").map((s) => ({
    stage: s,
    items: rows
      .filter((r) => stageOf(r) === s)
      .sort((a, b) => PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority)),
  }));
  const orderedCodes = columns.flatMap((c) => c.items.map((r) => r.code));

  function openTask(code: string) {
    const to = withReturn(taskHref(code, { list: orderedCodes }), `${window.location.pathname}${window.location.search}`);
    markPush(to);
    router.push(to);
  }

  /** A tap: the side panel, as a list row (a second tap lets go). */
  function tap(r: TaskRow) {
    if (longPressed.current) { longPressed.current = false; return; }
    if (pick) pick.setCode(pick.code === r.code ? null : r.code);
    else openTask(r.code);
  }

  async function move(r: TaskRow, to: string) {
    if (stageOf(r) === to) return;
    setMoved((m) => ({ ...m, [r.code]: to }));
    triggerHaptic();
    const res = await inlineUpdateTask(r.code, "status", to);
    if (res.ok) {
      toast(`${r.code} → ${to}`, {
        tone: "success", duration: 6000,
        action: res.undoToken ? { label: "Undo", onClick: async () => { await callUndo(res.undoToken!); setMoved((m) => { const n = { ...m }; delete n[r.code]; return n; }); router.refresh(); } } : undefined,
      });
    } else {
      setMoved((m) => { const n = { ...m }; delete n[r.code]; return n; });
      toast(res.error || "Couldn't move it", { tone: "warn", duration: 3000 });
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
    const res = await inlineUpdateTask(r.code, action === "complete" ? "status" : "escalation", action === "complete" ? "Completed" : "Yes");
    if (res.ok) {
      toast(`${r.code} ${action === "complete" ? "completed" : "escalated"}`, {
        tone: "success", duration: 6000,
        action: res.undoToken ? { label: "Undo", onClick: async () => { await callUndo(res.undoToken!); router.refresh(); } } : undefined,
      });
      setPeek(null);
    } else {
      toast(res.error || "Couldn't update it", { tone: "warn", duration: 3000 });
    }
    router.refresh();
  }

  // Long press → peek (cleared if a drag or a scroll starts).
  function clearPress() { if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; } }
  function onPointerDown(r: TaskRow, e: React.PointerEvent) {
    longPressed.current = false;
    pressStart.current = { x: e.clientX, y: e.clientY };
    clearPress();
    pressTimer.current = setTimeout(() => { longPressed.current = true; triggerHaptic(); setPeek(r); }, 400);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!pressStart.current) return;
    if (Math.abs(e.clientX - pressStart.current.x) > 8 || Math.abs(e.clientY - pressStart.current.y) > 8) clearPress();
  }

  const peekActions = (r: TaskRow): PeekAction[] => [
    { label: "Open", icon: <ExternalLink size={15} />, tone: "accent", onClick: () => openTask(r.code) },
    ...(isDone(r.status) ? [] : [{ label: "Complete", icon: <CheckCircle2 size={15} />, onClick: () => runPeek("complete", r) }]),
    ...(!isDone(r.status) && r.escalation !== "Yes" ? [{ label: "Escalate", icon: <AlertOctagon size={15} />, tone: "danger" as const, onClick: () => runPeek("escalate", r) }] : []),
    { label: "Snooze…", icon: <Clock size={15} />, onClick: () => setSnoozeRow(r) },
  ];

  return (
    <>
      <OrderRegistrar codes={orderedCodes} />
      <div
        ref={frame}
        className="st-scroll -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:snap-none sm:px-0 sm:pb-1"
      >
        {columns.map((col) => {
          const over = overStage === col.stage;
          const canAdd = !isDone(col.stage);
          return (
            <section
              key={col.stage}
              aria-label={col.stage}
              onDragOver={(e) => { e.preventDefault(); setOverStage(col.stage); }}
              onDragLeave={() => setOverStage((s) => (s === col.stage ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                const r = rows.find((x) => x.code === dragCode);
                if (r) move(r, col.stage);
                setDragCode(null); setOverStage(null);
              }}
              className={cn(
                "flex w-[84vw] shrink-0 snap-center flex-col rounded-[20px] p-2 transition-colors sm:w-[284px] sm:min-h-0",
                "bg-[color-mix(in_srgb,var(--st-seg)_55%,transparent)]",
                over && "bg-[color-mix(in_srgb,var(--st-seg)_95%,transparent)] ring-2 ring-[var(--st-field-line)]",
              )}
            >
              <header className="flex h-10 shrink-0 items-center gap-2 pl-2.5 pr-1">
                <Dot color={STATUS_DOT[col.stage]} size={8} />
                <h3 className="truncate text-[13px] font-semibold">{col.stage}</h3>
                <span className="st-mono text-[11px] text-[var(--st-muted)]">{col.items.length}</span>
                {canAdd && (
                  <button
                    type="button"
                    onClick={() => setAddIn((s) => (s === col.stage ? null : col.stage))}
                    aria-label={`Add a task to ${col.stage}`}
                    title={`Add a task to ${col.stage}`}
                    className="ml-auto grid h-7 w-7 place-items-center rounded-lg text-[var(--st-muted)] transition-colors hover:bg-[var(--st-surface)] hover:text-[var(--st-ink)]"
                  >
                    <Plus size={15} />
                  </button>
                )}
              </header>

              {addIn === col.stage && (
                <ColumnQuickAdd
                  stage={col.stage}
                  companies={companies}
                  people={people}
                  onClose={() => setAddIn(null)}
                  onCreated={(code) => {
                    setAddIn(null);
                    toast(`${code} added to ${col.stage}`, { tone: "success", duration: 5000 });
                    router.refresh();
                  }}
                />
              )}

              <div className="st-scroll flex min-h-[88px] flex-col gap-2 sm:min-h-0 sm:flex-1 sm:overflow-y-auto">
                {col.items.map((r) => (
                  <BoardCard
                    key={r.id}
                    r={r}
                    stage={stageOf(r)}
                    picked={pick?.code === r.code}
                    dragging={dragCode === r.code}
                    ticking={ticking}
                    onTap={() => tap(r)}
                    onDragStart={(e) => { clearPress(); setDragCode(r.code); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", r.code); }}
                    onDragEnd={() => { setDragCode(null); setOverStage(null); }}
                    press={{
                      onPointerDown: (e) => onPointerDown(r, e),
                      onPointerMove,
                      onPointerUp: clearPress,
                      onPointerLeave: clearPress,
                      onPointerCancel: clearPress,
                    }}
                  />
                ))}
                {col.items.length === 0 && addIn !== col.stage && (
                  <div className="grid h-[88px] shrink-0 place-items-center rounded-[14px] border border-dashed border-[var(--st-field-line)] text-[12px] text-[var(--st-muted)]">
                    Drop a task here
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <PeekPreview
        open={!!peek}
        onClose={() => setPeek(null)}
        onOpen={peek ? () => openTask(peek.code) : undefined}
        title={peek?.actionItem}
        subtitle={peek ? `${peek.code} · ${peek.companyName}` : undefined}
        creator={peek?.latestActivity?.author ?? null}
        whenISO={peek?.latestActivity?.atISO ?? null}
        pills={peek ? (
          <span className="inline-flex items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1.5"><Dot color={STATUS_DOT[peek.status] ?? "#B9BBBF"} />{peek.status}</span>
            <span className="text-[var(--st-muted)]">{peek.priority} priority</span>
          </span>
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

/** One task on the board: what it is, who has it, when it is due, and the
 *  last thing said about it. */
function BoardCard({ r, stage, picked, dragging, ticking, onTap, onDragStart, onDragEnd, press }: {
  r: TaskRow;
  stage: string;
  picked: boolean;
  dragging: boolean;
  ticking: boolean;
  onTap: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  press: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: () => void;
    onPointerLeave: () => void;
    onPointerCancel: () => void;
  };
}) {
  const done = isDone(stage);
  const due = deadlineWords({ ...r, status: stage });
  const a = r.latestActivity;
  return (
    <article
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      {...press}
      onContextMenu={(e) => e.preventDefault()}
      onClick={onTap}
      className={cn(
        "group/card shrink-0 cursor-pointer select-none rounded-[14px] border bg-[var(--st-surface)] p-3 transition-[border-color,box-shadow,opacity]",
        picked ? "border-[var(--st-ink)]" : "border-[var(--st-line)] hover:border-[var(--st-field-line)] hover:shadow-[0_4px_14px_rgba(17,18,20,0.06)]",
        dragging && "opacity-40",
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <span onClick={(e) => e.stopPropagation()} className={cn("shrink-0", !ticking && "hidden group-hover/card:inline-flex")}>
          <SelectCheckbox code={r.code} />
        </span>
        <span className="st-mono shrink-0 text-[11px] text-[var(--st-muted)]">{r.code}</span>
        {r.unread && <span title="New activity since you last looked" className="h-[7px] w-[7px] shrink-0 rounded-full bg-[var(--st-blue)]" />}
        {!done && (r.priority === "Critical" || r.priority === "High") && (
          <span title={`${r.priority} priority`} className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: r.priority === "Critical" ? "var(--st-late)" : "var(--st-soon)" }} />
        )}
        <PinnedMarker task={r} className="shrink-0" />
        {r.recurringRuleId != null && <Repeat size={11} className="shrink-0 text-[var(--st-muted)]" aria-label="Repeats" />}
        <span className="ml-auto shrink-0 whitespace-nowrap text-[12px]" style={{ color: due.onPage }}>{due.words}</span>
      </div>

      <div className={cn("mt-1.5 line-clamp-2 text-[14px] font-medium leading-snug", done && "text-[var(--st-muted)] line-through")}>{r.actionItem}</div>
      <div className="mt-0.5 truncate text-[12px] text-[var(--st-muted)]">{r.companyName}</div>

      {r.waiting && <div className="mt-2"><WaitingOnChip task={r} on={r.owner} /></div>}

      {a && (
        <div className="mt-2.5 rounded-[10px] bg-[var(--st-page)] px-2.5 py-2">
          <div className="line-clamp-2 text-[12px] leading-snug text-[var(--st-sub)]">{a.body}</div>
          <div className="mt-1 truncate text-[11px] text-[var(--st-muted)]">{a.author} · {ago(a.atISO)}</div>
        </div>
      )}

      <div className="mt-2.5 flex min-h-[26px] items-center justify-between gap-2">
        {r.assignees.length > 0 ? <StudioFaces names={r.assignees} max={4} /> : <span className="text-[12px] text-[var(--st-muted)]">Nobody yet</span>}
        <span className="truncate text-[11px] text-[var(--st-muted)]">{r.priority}</span>
      </div>
    </article>
  );
}

/** A task straight into a column's stage, in the column itself. */
function ColumnQuickAdd({ stage, companies, people, onClose, onCreated }: {
  stage: string;
  companies: { id: number; name: string }[];
  people: string[];
  onClose: () => void;
  onCreated: (code: string) => void;
}) {
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [companyId, setCompanyId] = useState<number | undefined>(companies[0]?.id);
  const [who, setWho] = useState("");
  const [pending, setPending] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);

  async function submit() {
    const a = text.trim();
    if (!a) { box.current?.focus(); return; }
    if (!companyId) { toast("Pick a company first.", { tone: "warn" }); return; }
    setPending(true);
    const res = await createCaptureTask({ companyId, actionItem: a, status: stage, priority: "Medium", assignees: who.trim() || undefined });
    setPending(false);
    if (res.ok && res.code) { setText(""); onCreated(res.code); }
    else toast(res.error || "Couldn't create the task.", { tone: "danger" });
  }

  const field = "bare-field w-full rounded-[10px] border border-[var(--st-field-line)] bg-[var(--st-page)] px-3 text-[13px] outline-none placeholder:text-[var(--st-muted)] focus:border-[var(--st-muted)]";
  return (
    <div className="mb-2 shrink-0 rounded-[14px] border border-[var(--st-line)] bg-[var(--st-surface)] p-2.5">
      <textarea
        ref={box}
        autoFocus
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); submit(); }
          if (e.key === "Escape") onClose();
        }}
        placeholder="What needs doing?"
        className={cn(field, "resize-none py-2 leading-snug")}
      />
      <div className="mt-2">
        <StudioChoiceMenu
          value={companyId ? String(companyId) : null}
          options={companies.map((c) => ({ value: String(c.id), label: c.name }))}
          onPick={(v) => setCompanyId(Number(v))}
          showDot={false}
          empty="Company"
          title="Which company"
        />
      </div>
      <Combobox options={people} placeholder="Who (optional)" onInput={setWho} onCommit={setWho} className={cn(field, "mt-2 h-9")} />
      <div className="mt-2.5 flex items-center justify-end gap-2">
        <span className="mr-auto text-[11px] text-[var(--st-muted)]">Ctrl+Enter adds it</span>
        <button type="button" onClick={onClose} className={cn(stBtn.ghost, "h-8 px-3 text-xs")}>Cancel</button>
        <button type="button" onClick={submit} disabled={pending || !text.trim()} className={cn(stBtn.dark, "h-8 px-3 text-xs disabled:opacity-40")}>
          {pending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}Add
        </button>
      </div>
    </div>
  );
}

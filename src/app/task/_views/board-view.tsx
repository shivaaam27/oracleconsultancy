"use client";

/**
 * The Tasks board — the stages in ONE line along the top, a column under each,
 * in the Studio look (owner, 26 Sept 2026).
 *
 * DRAG A CARD to another column — or onto a stage in the top line — to change
 * its stage: the same write and undo toast as the list's status menu, shown at
 * once and then confirmed by the server. The drag is our own (pointer events),
 * not the browser's drag-and-drop, so it works the same with a mouse, a finger
 * and a pen: a mouse drags as soon as it moves; a finger holds for a moment
 * first (so a swipe still scrolls). A tap opens the side panel, as a list row
 * does; a long press without moving peeks.
 *
 * ⚠️ HEIGHT: from `sm` up every column is the same fixed height and scrolls its
 * own cards, and that height is MEASURED so the whole board — its bottom edge
 * included — fits above the floating search bar once the page is scrolled to
 * the end (owner: "allow me to scroll … so I know it ended"). It used to be
 * sized by useFillViewport, whose negative bottom margin put the foot of every
 * column under the footer where nothing could reach it. A phone shows one
 * column at a time and the page scrolls.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AlertOctagon, CheckCircle2, Clock, ExternalLink, Loader2, Plus, Repeat } from "lucide-react";
import type { TaskRow } from "@/lib/tasks/queries";
import { markPush, withReturn } from "@/lib/nav/return-to";
import { taskHref } from "@/lib/tasks/task-href";
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
/** One width for a stage in the top line and its column, so they line up. */
const COL_W = "w-[80vw] sm:w-[276px]";

/** A finger holds this long before a card lifts (shorter = a swipe lifts it). */
const TOUCH_HOLD_MS = 320;
/** A mouse held still this long peeks instead. */
const MOUSE_PEEK_MS = 450;

type Lift = { code: string; x: number; y: number; offX: number; offY: number; w: number; over: string | null; moved: boolean };

export function BoardView({ rows, showClosed }: { rows: TaskRow[]; showClosed: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const pick = useStudioPick();
  const { selected } = useSelection();
  const ticking = selected.size > 0;
  const phone = useMediaQuery("(max-width: 639px)");

  // Optimistic stage overrides (code → stage) so a dropped card moves at once.
  const [moved, setMoved] = useState<Record<string, string>>({});
  const [peek, setPeek] = useState<TaskRow | null>(null);
  const [snoozeRow, setSnoozeRow] = useState<TaskRow | null>(null);
  const [addIn, setAddIn] = useState<string | null>(null);
  const [lift, setLift] = useState<Lift | null>(null);

  const board = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const cols = useRef<HTMLDivElement>(null);

  // The per-column quick add offers the companies and people on the board.
  const companies = useMemo(
    () => [...new Map(rows.map((r) => [r.companyId, r.companyName])).entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [rows],
  );
  const people = useMemo(() => [...new Set(rows.flatMap((r) => r.assignees))].filter(Boolean).sort(), [rows]);

  const stageOf = useCallback((r: TaskRow) => moved[r.code] ?? r.status, [moved]);
  const columns = STAGES.filter((s) => showClosed || s !== "Closed").map((s) => ({
    stage: s,
    items: rows
      .filter((r) => stageOf(r) === s)
      .sort((a, b) => PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority)),
  }));
  const orderedCodes = columns.flatMap((c) => c.items.map((r) => r.code));

  // Once the server has the new stage, the override is no longer needed.
  useEffect(() => {
    setMoved((m) => {
      const left = Object.fromEntries(Object.entries(m).filter(([code, st]) => rows.find((r) => r.code === code)?.status !== st));
      return Object.keys(left).length === Object.keys(m).length ? m : left;
    });
  }, [rows]);

  /* ---------------- height: the whole board fits above the bar ---------------- */
  useLayoutEffect(() => {
    const el = cols.current, outer = board.current;
    if (!el || !outer) return;
    if (phone) { el.style.height = ""; return; }
    const fit = () => {
      const doc = document.documentElement;
      const bottom = outer.getBoundingClientRect().bottom + window.scrollY;
      const after = doc.scrollHeight - bottom;              // bar, gaps, the page's foot
      const chrome = outer.offsetHeight - el.offsetHeight;  // the stage line, padding
      const room = window.innerHeight - after - 28 - chrome; // 28: clear of the frame's top edge
      el.style.height = `${Math.round(Math.max(380, Math.min(760, room)))}px`;
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [phone]);

  function openTask(code: string) {
    const to = withReturn(taskHref(code, { list: orderedCodes }), `${window.location.pathname}${window.location.search}`);
    markPush(to);
    router.push(to);
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

  /* ---------------- the drag ---------------- */
  const liftRef = useRef<Lift | null>(null);
  const swallowClick = useRef(false);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const moveRef = useRef(move);
  moveRef.current = move;

  const setLiftBoth = (l: Lift | null) => { liftRef.current = l; setLift(l); };

  /** The stage under a point — a column, or a stage in the top line. */
  const stageAt = (x: number, y: number): string | null =>
    (document.elementFromPoint(x, y)?.closest("[data-stage]") as HTMLElement | null)?.dataset.stage ?? null;

  function onCardPointerDown(r: TaskRow, e: React.PointerEvent<HTMLElement>) {
    if (e.button !== 0 || addIn) return;
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const startX = e.clientX, startY = e.clientY;
    const touch = e.pointerType !== "mouse";
    let started = false;
    let done = false;

    const start = (x: number, y: number) => {
      started = true;
      triggerHaptic();
      setLiftBoth({ code: r.code, x, y, offX: startX - rect.left, offY: startY - rect.top, w: rect.width, over: stageAt(x, y), moved: false });
      document.addEventListener("touchmove", stopScroll, { passive: false });
      autoScroll();
    };
    // Mouse: a still press peeks. Finger: a still press lifts the card.
    const timer = window.setTimeout(() => {
      if (done || started) return;
      if (touch) start(startX, startY);
      else { swallowClick.current = true; window.setTimeout(() => { swallowClick.current = false; }, 800); triggerHaptic(); setPeek(r); finish(); }
    }, touch ? TOUCH_HOLD_MS : MOUSE_PEEK_MS);

    const onMove = (ev: PointerEvent) => {
      const far = Math.hypot(ev.clientX - startX, ev.clientY - startY);
      if (!started) {
        if (touch) { if (far > 8) finish(); return; }   // a swipe: let it scroll
        if (far > 5) { window.clearTimeout(timer); start(ev.clientX, ev.clientY); }
        return;
      }
      const cur = liftRef.current;
      if (!cur) return;
      setLiftBoth({ ...cur, x: ev.clientX, y: ev.clientY, over: stageAt(ev.clientX, ev.clientY), moved: cur.moved || far > 8 });
    };
    const onUp = (ev: PointerEvent) => {
      const cur = liftRef.current;
      if (started && cur) {
        // The click that follows this release is not a tap. Cleared on the
        // next tick, or a drag that ended off its card ate the NEXT real tap.
        swallowClick.current = true;
        window.setTimeout(() => { swallowClick.current = false; }, 60);
        const target = stageAt(ev.clientX, ev.clientY);
        const row = rowsRef.current.find((x) => x.code === cur.code);
        if (!cur.moved && touch && row) setPeek(row);      // held and let go: a peek
        else if (target && row) void moveRef.current(row, target);
      }
      finish();
    };
    const finish = () => {
      done = true;
      window.clearTimeout(timer);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", finish);
      document.removeEventListener("touchmove", stopScroll);
      setLiftBoth(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", finish);
  }

  // While a card is lifted: the page must not scroll under the finger…
  function stopScroll(e: TouchEvent) { e.preventDefault(); }
  // …and near an edge the board (and a column) scrolls to meet the card.
  function autoScroll() {
    const step = () => {
      const cur = liftRef.current;
      if (!cur) return;
      const sc = scroller.current;
      if (sc) {
        const b = sc.getBoundingClientRect();
        if (cur.x < b.left + 56) sc.scrollLeft -= 14;
        else if (cur.x > b.right - 56) sc.scrollLeft += 14;
      }
      const body = (document.elementFromPoint(cur.x, cur.y)?.closest("[data-col-body]") as HTMLElement | null);
      if (body && body.scrollHeight > body.clientHeight) {
        const b = body.getBoundingClientRect();
        if (cur.y < b.top + 44) body.scrollTop -= 12;
        else if (cur.y > b.bottom - 44) body.scrollTop += 12;
      } else if (cur.y > window.innerHeight - 120) window.scrollBy(0, 12);
      else if (cur.y < 80) window.scrollBy(0, -12);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /** A tap: the side panel, as a list row (a second tap lets go). */
  function tap(r: TaskRow) {
    if (swallowClick.current) { swallowClick.current = false; return; }
    if (pick) pick.setCode(pick.code === r.code ? null : r.code);
    else openTask(r.code);
  }

  const peekActions = (r: TaskRow): PeekAction[] => [
    { label: "Open", icon: <ExternalLink size={15} />, tone: "accent", onClick: () => openTask(r.code) },
    ...(isDone(r.status) ? [] : [{ label: "Complete", icon: <CheckCircle2 size={15} />, onClick: () => runPeek("complete", r) }]),
    ...(!isDone(r.status) && r.escalation !== "Yes" ? [{ label: "Escalate", icon: <AlertOctagon size={15} />, tone: "danger" as const, onClick: () => runPeek("escalate", r) }] : []),
    { label: "Snooze…", icon: <Clock size={15} />, onClick: () => setSnoozeRow(r) },
  ];

  // A phone shows one stage at a time — the first with anything open in it.
  const [phoneStage, setPhoneStage] = useState<string>(() => columns.find((c) => c.items.length > 0 && !isDone(c.stage))?.stage ?? "Not Started");
  const lifted = lift ? rows.find((r) => r.code === lift.code) ?? null : null;
  const liftedFrom = lifted ? stageOf(lifted) : null;
  const overOf = (stage: string) => !!lift && lift.over === stage && stage !== liftedFrom;

  return (
    <>
      <OrderRegistrar codes={orderedCodes} />
      {phone ? (
        /* A phone: the stages as one row of buttons, and the chosen stage's
           cards full width under it (owner, 26 Sept 2026: columns "not
           fitting"). Hold a card and drop it on a stage to move it. */
        <div ref={board} className="flex flex-col gap-2.5">
          <div ref={scroller} className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {columns.map((col) => {
              const on = phoneStage === col.stage;
              const over = overOf(col.stage);
              return (
                <button
                  key={col.stage}
                  type="button"
                  data-stage={col.stage}
                  onClick={() => setPhoneStage(col.stage)}
                  aria-pressed={on}
                  className={cn(
                    "inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-[12px] border px-3 text-[13px] transition-colors",
                    over ? "border-[var(--st-ink)] bg-[var(--st-ink)] text-[var(--st-page)] scale-[1.04]"
                      : on ? "border-[var(--st-ink)] bg-[var(--st-surface)] font-semibold"
                      : "border-[var(--st-line)] bg-[var(--st-surface)] text-[var(--st-sub)]",
                  )}
                >
                  <Dot color={STATUS_DOT[col.stage]} size={7} />
                  {col.stage}
                  <span className={cn("st-mono text-[11px]", over ? "opacity-70" : "text-[var(--st-muted)]")}>{col.items.length}</span>
                </button>
              );
            })}
          </div>
          {lift && <div className="text-center text-[12px] text-[var(--st-muted)]">Drop it on a stage above</div>}
          {(() => {
            const col = columns.find((c) => c.stage === phoneStage) ?? columns[0];
            return (
              <section aria-label={col.stage} className="flex flex-col gap-2">
                {/* Not Started has "Create a quick task" above the board already. */}
                {!isDone(col.stage) && col.stage !== "Not Started" && (addIn === col.stage ? (
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
                ) : (
                  <button type="button" onClick={() => setAddIn(col.stage)} className="flex h-11 items-center gap-2 rounded-[14px] border border-dashed border-[var(--st-field-line)] px-4 text-[13px] text-[var(--st-sub)]">
                    <Plus size={15} />Add a task to {col.stage}
                  </button>
                ))}
                {col.items.map((r) => (
                  <BoardCard
                    key={r.id}
                    r={r}
                    stage={stageOf(r)}
                    picked={pick?.code === r.code}
                    lifted={lift?.code === r.code}
                    ticking={ticking}
                    onTap={() => tap(r)}
                    onPointerDown={(e) => onCardPointerDown(r, e)}
                  />
                ))}
                {col.items.length === 0 && (
                  <div className="grid h-24 place-items-center rounded-[14px] border border-dashed border-[var(--st-line)] text-[13px] text-[var(--st-muted)]">Nothing in {col.stage}</div>
                )}
              </section>
            );
          })()}
        </div>
      ) : (
      <div ref={board} className="rounded-[20px] bg-[var(--st-surface)] p-2 sm:p-2.5">
        <div
          ref={scroller}
          className={cn("st-scroll -mx-2 overflow-x-auto px-2 pb-1 sm:mx-0 sm:px-0", !lift && "max-sm:snap-x max-sm:snap-mandatory")}
        >
          <div className="w-max min-w-full">
            {/* The stages, in one line — each is also a place to drop a card. */}
            <div className="flex gap-3 rounded-[14px] bg-[var(--st-seg)] p-1">
              {columns.map((col) => {
                const over = overOf(col.stage);
                return (
                  <div
                    key={col.stage}
                    data-stage={col.stage}
                    className={cn(
                      "flex h-9 shrink-0 items-center gap-2 rounded-[10px] pl-3 pr-1 transition-colors max-sm:snap-center",
                      COL_W,
                      over ? "bg-[var(--st-ink)] text-[var(--st-page)]" : lift ? "bg-[var(--st-surface)]" : "",
                    )}
                  >
                    <Dot color={STATUS_DOT[col.stage]} size={8} />
                    <h3 className="truncate text-[13px] font-semibold">{col.stage}</h3>
                    <span className={cn("st-mono text-[11px]", over ? "opacity-70" : "text-[var(--st-muted)]")}>{col.items.length}</span>
                    {!isDone(col.stage) && (
                      <button
                        type="button"
                        onClick={() => setAddIn((s) => (s === col.stage ? null : col.stage))}
                        aria-label={`Add a task to ${col.stage}`}
                        title={`Add a task to ${col.stage}`}
                        className={cn("ml-auto grid h-7 w-7 place-items-center rounded-lg transition-colors", over ? "" : "text-[var(--st-muted)] hover:bg-[var(--st-surface)] hover:text-[var(--st-ink)]")}
                      >
                        <Plus size={15} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* The columns: one fixed height, each scrolling its own cards. */}
            <div ref={cols} className="mt-2 flex gap-3 px-1">
              {columns.map((col) => {
                const over = overOf(col.stage);
                return (
                  <section
                    key={col.stage}
                    aria-label={col.stage}
                    data-stage={col.stage}
                    className={cn(
                      "flex shrink-0 flex-col rounded-[16px] border transition-colors max-sm:snap-center sm:min-h-0",
                      COL_W,
                      over
                        ? "border-[var(--st-ink)] bg-[color-mix(in_srgb,var(--st-seg)_80%,transparent)]"
                        : "border-[var(--st-line)] bg-[color-mix(in_srgb,var(--st-seg)_40%,transparent)]",
                    )}
                  >
                    {addIn === col.stage && (
                      <div className="p-2 pb-0">
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
                      </div>
                    )}
                    <div data-col-body className="st-scroll flex min-h-[96px] flex-col gap-2 p-2 sm:min-h-0 sm:flex-1 sm:overflow-y-auto">
                      {col.items.map((r) => (
                        <BoardCard
                          key={r.id}
                          r={r}
                          stage={stageOf(r)}
                          picked={pick?.code === r.code}
                          lifted={lift?.code === r.code}
                          ticking={ticking}
                          onTap={() => tap(r)}
                          onPointerDown={(e) => onCardPointerDown(r, e)}
                        />
                      ))}
                      {col.items.length === 0 && addIn !== col.stage && (
                        <div className="grid h-[88px] shrink-0 place-items-center rounded-[12px] border border-dashed border-[var(--st-field-line)] text-[12px] text-[var(--st-muted)]">
                          {lift ? "Drop it here" : "Nothing here"}
                        </div>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      )}

      {/* The lifted card, under the pointer. */}
      {lift && lifted && typeof document !== "undefined" && createPortal(
        <div
          aria-hidden
          className="studio pointer-events-none fixed left-0 top-0 z-[150]"
          style={{ width: lift.w, transform: `translate(${lift.x - lift.offX}px, ${lift.y - lift.offY}px) rotate(2deg)` }}
        >
          <div className="rounded-[14px] shadow-[0_18px_40px_rgba(17,18,20,0.22)]">
            <BoardCard r={lifted} stage={liftedFrom ?? lifted.status} picked={false} lifted={false} ticking={false} ghost onTap={() => {}} onPointerDown={() => {}} />
          </div>
        </div>,
        document.body,
      )}

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
function BoardCard({ r, stage, picked, lifted, ticking, ghost = false, onTap, onPointerDown }: {
  r: TaskRow;
  stage: string;
  picked: boolean;
  lifted: boolean;
  ticking: boolean;
  ghost?: boolean;
  onTap: () => void;
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
}) {
  const done = isDone(stage);
  const due = deadlineWords({ ...r, status: stage });
  const a = r.latestActivity;
  return (
    <article
      onPointerDown={onPointerDown}
      onContextMenu={(e) => e.preventDefault()}
      onClick={onTap}
      style={{ WebkitTouchCallout: "none" }}
      className={cn(
        "group/card shrink-0 cursor-grab select-none rounded-[14px] border bg-[var(--st-surface)] p-3 transition-[border-color,box-shadow,opacity] active:cursor-grabbing",
        picked ? "border-[var(--st-ink)]" : "border-[var(--st-line)] hover:border-[var(--st-field-line)] hover:shadow-[0_4px_14px_rgba(17,18,20,0.06)]",
        lifted && "border-dashed opacity-35",
        ghost && "border-[var(--st-field-line)]",
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        {!ghost && (
          <span onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} className={cn("shrink-0", !ticking && "hidden group-hover/card:inline-flex")}>
            <SelectCheckbox code={r.code} />
          </span>
        )}
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
        <div className="mt-2 rounded-[10px] bg-[var(--st-page)] px-2.5 py-1.5">
          <div className="line-clamp-2 text-[12px] leading-snug text-[var(--st-sub)]">{a.body}</div>
          <div className="mt-0.5 truncate text-[11px] text-[var(--st-muted)]">{a.author} · {ago(a.atISO)}</div>
        </div>
      )}

      <div className="mt-2 flex min-h-[26px] items-center justify-between gap-2">
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
    <div className="rounded-[14px] border border-[var(--st-line)] bg-[var(--st-surface)] p-2.5">
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

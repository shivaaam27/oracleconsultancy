"use client";

/**
 * Subtasks — a to-do list inside a task (owner, 25 Sept 2026). On the task
 * page, in the quick side panel, and on the full new-task form.
 *
 * The motion follows the reference the owner sent, in Studio's colours:
 *  - the ring is dashed while open; ticking fills it green with a pop and draws
 *    the tick;
 *  - a line is drawn through the words (it rides on the text, so a wrapped
 *    subtask gets a line per row);
 *  - a beat later the finished one settles to the bottom of the list (a spring);
 *    unticking runs the same road back.
 * Reduced motion: everything happens at once.
 *
 * Click the words to rename (Enter saves, Escape leaves it); × deletes. The
 * field at the foot adds one and stays put for the next — a list is typed in
 * one go.
 *
 * `TaskSubtasks` saves as it goes (subtask-actions.ts). `DraftSubtasks` holds a
 * plain list for a task that does not exist yet; the form saves it after the
 * task is made.
 */
import { AnimatePresence, motion, useReducedMotion, type Transition } from "framer-motion";
import { Plus, X } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";
import { addSubtask, deleteSubtask, listSubtasks, renameSubtask, tickSubtask } from "@/app/task/subtask-actions";
import type { Subtask } from "@/lib/subtasks-shared";
import { cn } from "@/lib/cn";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;
const EASE_IN_OUT = [0.65, 0, 0.35, 1] as const;
const FILL: Transition = { duration: 0.24, ease: EASE_OUT };
const POP: Transition = { duration: 0.34, ease: EASE_OUT, times: [0, 0.4, 1] };
const TICK: Transition = { duration: 0.22, ease: EASE_OUT, delay: 0.06 };
const STRIKE: Transition = { duration: 0.38, ease: EASE_IN_OUT, delay: 0.12 };
const REORDER: Transition = { type: "spring", stiffness: 320, damping: 30 };
const INSTANT: Transition = { duration: 0 };
/** How long a ticked one waits (tick + strike) before settling to the bottom. */
const SETTLE_MS = 620;

const RING_R = 10;
const RING_DASH = `1 ${(2 * Math.PI * RING_R) / 12 - 1}`;
const STRIKE_STYLE: CSSProperties = {
  backgroundImage: "linear-gradient(currentColor, currentColor)",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "0 55%",
  boxDecorationBreak: "clone",
  WebkitBoxDecorationBreak: "clone",
};

type Tone = "page" | "sheet";
const TONE = {
  page: { fg: "text-[var(--st-ink)]", muted: "text-[var(--st-muted)]", ring: "text-[#B9BBBF]", hover: "hover:bg-[var(--st-page)]", field: "border-[var(--st-line)] bg-[var(--st-surface)] text-[var(--st-ink)] placeholder:text-[var(--st-muted)]", bar: "bg-[var(--st-page)]" },
  sheet: { fg: "text-[var(--sh-fg)]", muted: "text-[var(--sh-muted)]", ring: "text-[var(--sh-muted)]", hover: "hover:bg-[var(--sh-hover)]", field: "border-[var(--sh-chip-line)] bg-[var(--sh-field)] text-[var(--sh-fg)] placeholder:text-[var(--sh-muted)]", bar: "bg-[var(--sh-hover)]" },
} as const;

function useTiming() {
  const reduced = useReducedMotion() ?? false;
  return (t: Transition) => (reduced ? INSTANT : t);
}

function Check({ done, tone }: { done: boolean; tone: Tone }) {
  const timing = useTiming();
  return (
    <motion.svg viewBox="0 0 24 24" aria-hidden className={cn("h-5 w-5 shrink-0", TONE[tone].ring)}
      initial={false} animate={{ scale: done ? [1, 1.12, 1] : 1 }} transition={done ? timing(POP) : INSTANT}>
      <motion.circle cx="12" cy="12" r={RING_R} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray={RING_DASH}
        initial={false} animate={{ opacity: done ? 0 : 1 }} transition={timing(FILL)} />
      <motion.circle cx="12" cy="12" r="11" fill="var(--st-ok, #19C37D)" style={{ transformBox: "view-box", transformOrigin: "12px 12px" }}
        initial={false} animate={{ scale: done ? 1 : 0 }} transition={timing(FILL)} />
      <motion.path d="M7.6 12.4 10.7 15.4 16.4 9.1" fill="none" stroke="#fff" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"
        initial={false} animate={{ pathLength: done ? 1 : 0, opacity: done ? 1 : 0 }} transition={timing(TICK)} />
    </motion.svg>
  );
}

function Row({ item, tone, onTick, onRename, onDelete, tickable = true }: {
  tickable?: boolean;
  item: { key: string | number; title: string; done: boolean };
  tone: Tone;
  onTick: (done: boolean) => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}) {
  const timing = useTiming();
  const t = TONE[tone];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.title);
  const save = () => {
    setEditing(false);
    const v = draft.trim();
    if (v && v !== item.title) onRename(v); else setDraft(item.title);
  };
  return (
    <div className={cn("group/sub flex items-start gap-2.5 rounded-[11px] px-2 py-1.5 transition-colors", t.hover)}>
      {!tickable ? <span aria-hidden className="mt-px grid h-6 w-6 shrink-0 place-items-center"><Check done={false} tone={tone} /></span> : <button type="button" role="checkbox" aria-checked={item.done} aria-label={item.done ? `Reopen ${item.title}` : `Tick off ${item.title}`}
        onClick={() => onTick(!item.done)} className="mt-px grid h-6 w-6 shrink-0 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--st-ok,#19C37D)]">
        <Check done={item.done} tone={tone} />
      </button>}
      {editing ? (
        <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={save}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); save(); } else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setDraft(item.title); setEditing(false); } }}
          aria-label="Rename the subtask"
          style={{ background: "transparent", border: 0, boxShadow: "none", color: "inherit" }}
          className={cn("bare-field min-w-0 flex-1 py-0.5 text-[13.5px] font-medium leading-5 outline-none", t.fg)} />
      ) : (
        <button type="button" onClick={() => { setDraft(item.title); setEditing(true); }} title="Click to rename" className="min-w-0 flex-1 py-0.5 text-left">
          <motion.span style={STRIKE_STYLE} initial={false} animate={{ backgroundSize: `${item.done ? 100 : 0}% 1.5px` }} transition={timing(STRIKE)}
            className={cn("break-words text-[13.5px] font-medium leading-5 transition-colors duration-300", item.done ? t.muted : t.fg)}>
            {item.title}
          </motion.span>
        </button>
      )}
      <button type="button" aria-label={`Delete ${item.title}`} onClick={onDelete}
        className={cn("mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-[8px] transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/sub:opacity-100 focus-visible:opacity-100", t.muted, "hover:text-[var(--st-late,#E0479E)]")}>
        <X size={13} />
      </button>
    </div>
  );
}

/** The list, the progress and the add field — shared by both modes. */
function ListShell<T extends { key: string | number; title: string; done: boolean }>({ items, tone, title, onAdd, onTick, onRename, onDelete, autoFocus, tickable = true }: {
  tickable?: boolean;
  items: T[];
  tone: Tone;
  title?: boolean;
  autoFocus?: boolean;
  onAdd: (title: string) => void;
  onTick: (item: T, done: boolean) => void;
  onRename: (item: T, title: string) => void;
  onDelete: (item: T) => void;
}) {
  const timing = useTiming();
  const reduced = useReducedMotion() ?? false;
  const t = TONE[tone];
  const [text, setText] = useState("");
  // A ticked one stays where it is while its tick and strike play, then settles.
  const [settled, setSettled] = useState<Set<string | number>>(() => new Set(items.filter((i) => i.done).map((i) => i.key)));
  useEffect(() => {
    const doneKeys = items.filter((i) => i.done).map((i) => i.key);
    const pending = doneKeys.filter((k) => !settled.has(k));
    const stale = [...settled].filter((k) => !doneKeys.includes(k));
    if (stale.length) setSettled((s) => { const n = new Set(s); stale.forEach((k) => n.delete(k)); return n; });
    if (!pending.length) return;
    const timer = setTimeout(() => setSettled((s) => new Set([...s, ...pending])), reduced ? 0 : SETTLE_MS);
    return () => clearTimeout(timer);
  }, [items, reduced]); // eslint-disable-line react-hooks/exhaustive-deps

  const ordered = [...items.filter((i) => !settled.has(i.key) || !i.done), ...items.filter((i) => settled.has(i.key) && i.done)];
  const done = items.filter((i) => i.done).length;

  const add = () => { const v = text.trim(); if (!v) return; onAdd(v); setText(""); };

  return (
    <div className="flex flex-col gap-1.5">
      {title !== false && (
        <div className="flex items-center gap-2.5 px-1">
          <span className={cn("text-[13px] font-semibold", t.fg)}>Subtasks</span>
          {items.length > 0 && <span className={cn("text-xs tabular-nums", t.muted)}>{done} of {items.length}</span>}
          {items.length > 0 && (
            <span className={cn("h-1.5 flex-1 overflow-hidden rounded-full", t.bar)}>
              <motion.span className="block h-full rounded-full bg-[var(--st-ok,#19C37D)]" initial={false} animate={{ width: `${(done / items.length) * 100}%` }} transition={timing(FILL)} />
            </span>
          )}
        </div>
      )}
      <ul className="flex flex-col">
        <AnimatePresence initial={false}>
          {ordered.map((i) => (
            <motion.li key={i.key} layout={!reduced} transition={timing(REORDER)}
              initial={reduced ? false : { opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={reduced ? undefined : { opacity: 0, height: 0 }}>
              <Row item={i} tone={tone} tickable={tickable} onTick={(d) => onTick(i, d)} onRename={(v) => onRename(i, v)} onDelete={() => onDelete(i)} />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      <label className={cn("flex h-9 items-center gap-2 rounded-[11px] border px-2.5", t.field)}>
        <Plus size={15} strokeWidth={2.2} className={t.fg} />
        <span className="sr-only">Add a subtask</span>
        <input value={text} autoFocus={autoFocus} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); add(); } }}
          placeholder={items.length ? "Add another subtask" : "Add a subtask — Enter adds it"}
          style={{ background: "transparent", border: 0, boxShadow: "none", color: "inherit" }}
          className="bare-field h-full w-full text-[13px] outline-none" />
      </label>
    </div>
  );
}

/** A task's subtasks, saved as you go. */
export function TaskSubtasks({ taskId, tone = "page", title, onCount }: {
  taskId: number;
  tone?: Tone;
  title?: boolean;
  /** Told the count after every change (the task page's tab shows it). */
  onCount?: (c: { done: number; total: number }) => void;
}) {
  const [items, setItems] = useState<Subtask[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (items) onCount?.({ done: items.filter((x) => x.done).length, total: items.length });
  }, [items]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let live = true;
    listSubtasks(taskId).then((l) => { if (live) setItems(l); }).catch(() => { if (live) setItems([]); });
    return () => { live = false; };
  }, [taskId]);

  const fail = (e: unknown) => setError(e instanceof Error ? e.message : "That did not save — try again.");
  if (items == null) return <div aria-busy className="h-9 animate-pulse rounded-[11px] bg-[var(--st-page)]" />;
  const withKeys = items.map((s) => ({ ...s, key: s.id }));
  return (
    <div className="flex flex-col gap-1.5">
      <ListShell
        items={withKeys}
        tone={tone}
        title={title}
        onAdd={(v) => {
          const temp = -Date.now();
          setItems((l) => [...(l ?? []), { id: temp, title: v, done: false }]);
          addSubtask(taskId, v).then((s) => setItems((l) => (l ?? []).map((x) => (x.id === temp ? s : x)))).catch((e) => { setItems((l) => (l ?? []).filter((x) => x.id !== temp)); fail(e); });
        }}
        onTick={(s, done) => {
          setItems((l) => (l ?? []).map((x) => (x.id === s.id ? { ...x, done } : x)));
          if (s.id > 0) tickSubtask(s.id, done).catch((e) => { setItems((l) => (l ?? []).map((x) => (x.id === s.id ? { ...x, done: !done } : x))); fail(e); });
        }}
        onRename={(s, v) => {
          setItems((l) => (l ?? []).map((x) => (x.id === s.id ? { ...x, title: v } : x)));
          if (s.id > 0) renameSubtask(s.id, v).catch(fail);
        }}
        onDelete={(s) => {
          const before = items;
          setItems((l) => (l ?? []).filter((x) => x.id !== s.id));
          if (s.id > 0) deleteSubtask(s.id).catch((e) => { setItems(before); fail(e); });
        }}
      />
      {error && <p role="alert" className="px-1 text-xs text-[var(--st-late-text,#C2267A)]">{error}</p>}
    </div>
  );
}

/** Subtasks for a task that does not exist yet — the form saves them after. */
export function DraftSubtasks({ value, onChange, tone = "page", title }: { value: string[]; onChange: (v: string[]) => void; tone?: Tone; title?: boolean }) {
  // Drafts carry no "done" — a brand-new task's list starts open.
  const items = value.map((v, i) => ({ key: `${i}:${v}`, title: v, done: false }));
  const indexOf = (k: string | number) => Number(String(k).split(":")[0]);
  return (
    <ListShell
      items={items}
      tone={tone}
      title={title}
      onAdd={(v) => onChange([...value, v])}
      tickable={false}
      onTick={() => { /* nothing to tick before the task exists */ }}
      onRename={(i, v) => onChange(value.map((x, n) => (n === indexOf(i.key) ? v : x)))}
      onDelete={(i) => onChange(value.filter((_, n) => n !== indexOf(i.key)))}
    />
  );
}

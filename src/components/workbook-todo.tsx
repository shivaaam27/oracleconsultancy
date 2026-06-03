"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Clock, Plus, Pencil, Trash2, ChevronRight, ListTodo, CircleAlert, Loader2 } from "lucide-react";
import type { TaskRow } from "@/lib/queries";
import type { Todo } from "@/app/todos/actions";
import { createTodo, updateTodo, toggleTodo, deleteTodo } from "@/app/todos/actions";
import { Deadline, hasTime } from "@/components/deadline";
import { FluidSelect } from "@/components/fluid-select";
import { SnoozeSheet } from "@/components/snooze-sheet";
import { useToast } from "@/components/toast";
import { callUndo } from "@/components/undo-banner";
import { inlineUpdateTask } from "@/app/task/actions";

const pad = (n: number) => String(n).padStart(2, "0");
type Mode = "personal" | "company";

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
/** Midnight next Monday — the boundary between "this week" and "later". */
function startOfNextWeek(base: number) {
  const d = new Date(base);
  const day = d.getDay(); // 0 Sun … 6 Sat
  d.setDate(d.getDate() + (day === 0 ? 1 : 8 - day));
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

type Section = { key: string; label: string; tone?: "danger" };
const SECTION_ORDER: Section[] = [
  { key: "overdue", label: "Overdue", tone: "danger" },
  { key: "today", label: "Today" },
  { key: "tomorrow", label: "Tomorrow" },
  { key: "week", label: "This week" },
  { key: "later", label: "Later" },
  { key: "none", label: "No date" },
];

/** Which dated bucket a to-do falls into, relative to now. */
function bucketOf(dueAt: string | null): string {
  if (!dueAt) return "none";
  const due = new Date(dueAt).getTime();
  const today = startOfDay(new Date()).getTime();
  const tomorrow = today + 86400000;
  const dayAfter = today + 2 * 86400000;
  const nextWeek = startOfNextWeek(today);
  if (due < today) return "overdue";
  if (due < tomorrow) return "today";
  if (due < dayAfter) return "tomorrow";
  if (due < nextWeek) return "week";
  return "later";
}
const byDeadline = (a: TaskRow, b: TaskRow) => a.deadline!.getTime() - b.deadline!.getTime();
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isTimed = (d: Date) => d.getUTCHours() !== 0 || d.getUTCMinutes() !== 0;

/** Build a due-at ISO from date + optional time (all-day → UTC midnight). */
function composeDue(date: string, time: string): string | null {
  if (!date) return null;
  return time ? new Date(`${date}T${time}`).toISOString() : new Date(date).toISOString();
}

export function WorkbookTodo({
  companyTasks, todos, companies,
}: {
  companyTasks: TaskRow[];
  todos: Todo[];
  companies: { id: number; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [mode, setMode] = useState<Mode>("personal");
  const [items, setItems] = useState<Todo[]>(todos);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [showCompleted, setShowCompleted] = useState(false);
  const [snoozeRow, setSnoozeRow] = useState<TaskRow | null>(null);
  const [snoozeTodo, setSnoozeTodo] = useState<Todo | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  // Deletes are deferred so "Undo" can cancel them before they hit the server.
  const pendingDeletes = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  // Composer (shared by add + edit)
  const [composerOpen, setComposerOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [fTitle, setFTitle] = useState("");
  const [fDate, setFDate] = useState("");
  const [fTime, setFTime] = useState("");
  const [fCompany, setFCompany] = useState("");
  const [saving, setSaving] = useState(false);

  function openAdd() {
    setEditId(null); setFTitle(""); setFDate(""); setFTime(""); setFCompany(""); setComposerOpen(true);
  }

  // Lets the global context action bar trigger "New to-do".
  useEffect(() => {
    const h = () => openAdd();
    window.addEventListener("workbook:new-todo", h);
    return () => window.removeEventListener("workbook:new-todo", h);
  }, []);
  function openEdit(t: Todo) {
    setEditId(t.id); setFTitle(t.title);
    const d = t.dueAt ? new Date(t.dueAt) : null;
    setFDate(d ? localDate(d) : "");
    setFTime(d && isTimed(d) ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : "");
    setFCompany(t.companyId ? String(t.companyId) : "");
    setComposerOpen(true);
  }

  async function submitComposer() {
    if (!fTitle.trim()) return;
    setSaving(true);
    const dueAt = composeDue(fDate, fTime);
    const companyId = fCompany ? Number(fCompany) : null;
    try {
      if (editId) {
        await updateTodo({ id: editId, title: fTitle, dueAt, companyId });
        const cName = companies.find((c) => c.id === companyId)?.name ?? null;
        setItems((arr) => arr.map((t) => (t.id === editId ? { ...t, title: fTitle.trim(), dueAt, companyId, companyName: cName } : t)));
        setComposerOpen(false);
      } else {
        const created = await createTodo({ title: fTitle, dueAt, companyId });
        setItems((arr) => [created, ...arr]);
        // Rapid entry: stay open, keep the date/company, clear the title and refocus.
        setFTitle("");
        titleRef.current?.focus();
      }
    } catch {
      toast("Could not save to-do", { tone: "warn", duration: 3000 });
    }
    setSaving(false);
  }

  async function toggle(t: Todo) {
    const next = !t.done;
    setItems((arr) => arr.map((x) => (x.id === t.id ? { ...x, done: next, completedAt: next ? new Date().toISOString() : null } : x)));
    try { await toggleTodo(t.id, next); } catch { toast("Could not update", { tone: "warn", duration: 3000 }); return; }
    if (next) {
      toast("Marked done", {
        tone: "success", duration: 5000,
        action: { label: "Undo", onClick: async () => {
          setItems((arr) => arr.map((x) => (x.id === t.id ? { ...x, done: false, completedAt: null } : x)));
          try { await toggleTodo(t.id, false); } catch { /* best-effort */ }
        } },
      });
    }
  }

  function remove(t: Todo) {
    setItems((arr) => arr.filter((x) => x.id !== t.id));
    // Defer the server delete; "Undo" cancels it and restores the row.
    const timer = setTimeout(async () => {
      pendingDeletes.current.delete(t.id);
      try { await deleteTodo(t.id); } catch { toast("Could not delete", { tone: "warn", duration: 3000 }); }
    }, 5200);
    pendingDeletes.current.set(t.id, timer);
    toast("To-do deleted", {
      tone: "default", duration: 5000,
      action: { label: "Undo", onClick: () => {
        const tm = pendingDeletes.current.get(t.id);
        if (tm) { clearTimeout(tm); pendingDeletes.current.delete(t.id); }
        setItems((arr) => [t, ...arr]);
      } },
    });
  }

  async function snoozeTodoTo(t: Todo, iso: string) {
    setItems((arr) => arr.map((x) => (x.id === t.id ? { ...x, dueAt: iso } : x)));
    try { await updateTodo({ id: t.id, dueAt: iso }); }
    catch { toast("Could not reschedule", { tone: "warn", duration: 3000 }); }
  }

  // If we unmount with deletes still pending, persist them straight away so a
  // delete isn't silently lost when navigating away inside the undo window.
  useEffect(() => {
    const map = pendingDeletes.current;
    return () => {
      map.forEach((tm, id) => { clearTimeout(tm); void deleteTodo(id); });
      map.clear();
    };
  }, []);

  // ---- Personal lists ----
  const open = items.filter((t) => !t.done).sort((a, b) => {
    const ad = a.dueAt ? new Date(a.dueAt).getTime() : Infinity;
    const bd = b.dueAt ? new Date(b.dueAt).getTime() : Infinity;
    return ad - bd || b.createdAt.localeCompare(a.createdAt);
  });
  const completed = items.filter((t) => t.done).sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || ""));

  // Bucket the open list into Overdue / Today / Tomorrow / This week / Later / No date.
  const grouped = SECTION_ORDER
    .map((s) => ({ ...s, rows: open.filter((t) => bucketOf(t.dueAt) === s.key) }))
    .filter((s) => s.rows.length > 0);

  // ---- Company task reminders (open dated tasks) ----
  async function completeTask(t: TaskRow) {
    const res = await inlineUpdateTask(t.code, "status", "Completed");
    if (res.ok) toast(`${t.code} completed`, { tone: "success", duration: 6000, action: res.undoToken ? { label: "Undo", onClick: async () => { await callUndo(res.undoToken!); router.refresh(); } } : undefined });
    router.refresh();
  }
  async function doSnooze(t: TaskRow, iso: string) {
    const res = await inlineUpdateTask(t.code, "deadline", iso);
    if (res.ok) { const when = new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }); toast(`${t.code} moved to ${when}`, { tone: "success", duration: 6000, action: res.undoToken ? { label: "Undo", onClick: async () => { await callUndo(res.undoToken!); router.refresh(); } } : undefined }); }
    router.refresh();
  }
  function openTask(code: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("task", code);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }
  const companyMap = new Map<string, { accent: string | null; items: TaskRow[] }>();
  for (const t of companyTasks) {
    const g = companyMap.get(t.companyName) || { accent: t.companyAccent, items: [] };
    g.items.push(t); companyMap.set(t.companyName, g);
  }
  const companyGroups = [...companyMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [, g] of companyGroups) g.items.sort(byDeadline);
  const companyTotal = companyTasks.length;
  const overdue = companyTasks.filter((t) => t.deadline && startOfDay(t.deadline).getTime() < startOfDay(new Date()).getTime()).length;

  const Toggle = (
    <div className="inline-flex items-center rounded-full bg-bg-subtle p-0.5 text-xs">
      {(["personal", "company"] as Mode[]).map((mo) => (
        <button key={mo} type="button" onClick={() => setMode(mo)} className={"px-3 py-1 rounded-full transition-colors " + (mode === mo ? "bg-bg-elev text-fg shadow-sm" : "text-fg-muted hover:text-fg")}>
          {mo === "personal" ? "Personal" : "By company"}
        </button>
      ))}
    </div>
  );

  function TodoRow({ t }: { t: Todo }) {
    const due = t.dueAt ? new Date(t.dueAt) : null;
    return (
      <motion.div layout exit={{ opacity: 0, height: 0 }} className="flex items-center gap-3 px-3 py-2.5 hover:bg-bg-muted/40 transition-colors group">
        <button type="button" onClick={() => toggle(t)} className={"shrink-0 h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors " + (t.done ? "bg-accent border-accent text-accent-fg" : "border-border hover:border-accent text-transparent hover:text-accent")} aria-label={t.done ? "Mark not done" : "Mark complete"}>
          <Check size={12} />
        </button>
        <div className="min-w-0 flex-1">
          <div className={"text-sm leading-snug " + (t.done ? "line-through text-fg-subtle" : "")}>{t.title}</div>
          {(due || t.companyName || t.taskCode) && (
            <div className="text-xs text-fg-muted mt-0.5 flex items-center gap-1.5 flex-wrap">
              {due && hasTime(due) && <span className="font-mono text-fg-subtle">{pad(due.getHours())}:{pad(due.getMinutes())}</span>}
              {t.companyName && <span className="truncate max-w-[160px]">{t.companyName}</span>}
              {t.taskCode && <button type="button" onClick={() => openTask(t.taskCode!)} className="font-mono text-accent hover:underline">{t.taskCode}</button>}
            </div>
          )}
        </div>
        {due && <span className="shrink-0"><Deadline date={due} className="text-xs" /></span>}
        {!t.done && (
          <button type="button" onClick={() => setSnoozeTodo(t)} className="shrink-0 h-7 w-7 rounded-lg text-fg-muted hover:text-accent hover:bg-bg-muted inline-flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" aria-label="Snooze"><Clock size={13} /></button>
        )}
        {!t.done && (
          <button type="button" onClick={() => openEdit(t)} className="shrink-0 h-7 w-7 rounded-lg text-fg-muted hover:text-accent hover:bg-bg-muted inline-flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" aria-label="Edit"><Pencil size={13} /></button>
        )}
        <button type="button" onClick={() => remove(t)} className="shrink-0 h-7 w-7 rounded-lg text-fg-muted hover:text-danger hover:bg-bg-muted inline-flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" aria-label="Delete"><Trash2 size={13} /></button>
      </motion.div>
    );
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm text-fg-muted">
          <ListTodo size={16} className="text-accent" />
          {mode === "personal"
            ? <span className="font-medium text-fg">{open.length} to-do{open.length === 1 ? "" : "s"}</span>
            : <><span className="font-medium text-fg">{companyTotal} due</span>{overdue > 0 && <span className="inline-flex items-center gap-1 text-danger"><CircleAlert size={13} /> {overdue} overdue</span>}</>}
        </div>
        {Toggle}
      </div>

      {mode === "personal" ? (
        <div className="space-y-3">
          {/* Composer */}
          {composerOpen ? (
            <div className="glass elevated rounded-2xl p-3 space-y-2.5">
              <input ref={titleRef} autoFocus value={fTitle} onChange={(e) => setFTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submitComposer(); if (e.key === "Escape") setComposerOpen(false); }} placeholder="What needs doing?" className="w-full bg-transparent text-sm outline-none placeholder:text-fg-subtle" />
              <div className="flex items-center gap-2 flex-wrap">
                <input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)} className="px-2 py-1.5 text-xs rounded-lg border border-border bg-bg" />
                <input type="time" value={fTime} onChange={(e) => setFTime(e.target.value)} disabled={!fDate} className="px-2 py-1.5 text-xs rounded-lg border border-border bg-bg disabled:opacity-40" />
                <FluidSelect value={fCompany} onSelect={setFCompany} placeholder="No company" options={[{ value: "", label: "No company" }, ...companies.map((c) => ({ value: String(c.id), label: c.name }))]} />
                <div className="ml-auto flex items-center gap-2">
                  <button type="button" onClick={() => setComposerOpen(false)} className="text-xs px-2.5 py-1.5 rounded-lg text-fg-muted hover:text-fg">Cancel</button>
                  <button type="button" onClick={submitComposer} disabled={saving || !fTitle.trim()} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-accent text-accent-fg font-medium disabled:opacity-50 hover:opacity-90">
                    {saving ? <Loader2 size={13} className="animate-spin" /> : editId ? <Check size={13} /> : <Plus size={13} />} {editId ? "Save" : "Add"}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button type="button" onClick={openAdd} className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-border text-sm text-fg-muted hover:text-accent hover:border-accent/50 py-2.5 transition-colors">
              <Plus size={15} /> Add to-do
            </button>
          )}

          {/* Open to-dos — grouped by when they're due */}
          {grouped.map((s) => (
            <section key={s.key} className="space-y-1.5">
              <div className="flex items-center gap-2 px-1">
                <span className={"text-xs font-semibold uppercase tracking-wider " + (s.tone === "danger" ? "text-danger" : "text-fg-muted")}>{s.label}</span>
                <span className="text-xs text-fg-subtle">· {s.rows.length}</span>
              </div>
              <div className="glass elevated rounded-2xl divide-y divide-border/60 overflow-hidden">
                <AnimatePresence initial={false}>{s.rows.map((t) => <TodoRow key={t.id} t={t} />)}</AnimatePresence>
              </div>
            </section>
          ))}
          {open.length === 0 && !composerOpen && (
            <div className="text-center text-sm text-fg-subtle py-8">No personal to-dos. Add one above.</div>
          )}

          {/* Completed */}
          {completed.length > 0 && (
            <div>
              <button type="button" onClick={() => setShowCompleted((s) => !s)} className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-fg-muted hover:text-fg">
                <ChevronRight size={13} className={"transition-transform " + (showCompleted ? "rotate-90" : "")} /> Completed <span className="text-fg-subtle font-normal">· {completed.length}</span>
              </button>
              <AnimatePresence initial={false}>
                {showCompleted && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                    <div className="glass elevated rounded-2xl divide-y divide-border/60 overflow-hidden mt-1.5">
                      {completed.map((t) => <TodoRow key={t.id} t={t} />)}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      ) : (
        // By company — task reminders grouped by company
        <div className="space-y-4">
          {companyGroups.length === 0 && <div className="text-center text-sm text-fg-subtle py-8">No company tasks with a deadline.</div>}
          {companyGroups.map(([name, g]) => {
            const isCollapsed = collapsed.has(name);
            return (
              <section key={name} className="space-y-1.5">
                <button type="button" onClick={() => setCollapsed((s) => { const n = new Set(s); n.has(name) ? n.delete(name) : n.add(name); return n; })} className="w-full flex items-center gap-2 text-left">
                  <ChevronRight size={14} className={"text-fg-subtle transition-transform " + (isCollapsed ? "" : "rotate-90")} />
                  <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: g.accent || "var(--accent)" }} />
                  <span className="text-sm font-medium">{name}</span>
                  <span className="text-xs text-fg-subtle">· {g.items.length}</span>
                </button>
                <AnimatePresence initial={false}>
                  {!isCollapsed && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                      <div className="glass elevated rounded-2xl divide-y divide-border/60 overflow-hidden">
                        {g.items.map((t) => (
                          <div key={t.code} className="flex items-center gap-3 px-3 py-2.5 hover:bg-bg-muted/40 transition-colors">
                            <button type="button" onClick={() => completeTask(t)} className="shrink-0 h-5 w-5 rounded-full border-2 border-border hover:border-accent flex items-center justify-center text-transparent hover:text-accent transition-colors" aria-label="Mark complete"><Check size={12} /></button>
                            <button type="button" onClick={() => openTask(t.code)} className="min-w-0 flex-1 text-left">
                              <div className="text-sm leading-snug truncate">{t.actionItem}</div>
                              <div className="text-xs text-fg-muted mt-0.5 font-mono">{t.code}{t.deadline && hasTime(t.deadline) ? ` · ${pad(t.deadline.getHours())}:${pad(t.deadline.getMinutes())}` : ""}</div>
                            </button>
                            <span className="shrink-0"><Deadline date={t.deadline} className="text-xs" /></span>
                            <button type="button" onClick={() => setSnoozeRow(t)} className="shrink-0 h-7 w-7 rounded-lg text-fg-muted hover:text-accent hover:bg-bg-muted inline-flex items-center justify-center" aria-label="Snooze"><Clock size={14} /></button>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </section>
            );
          })}
        </div>
      )}

      <SnoozeSheet open={!!snoozeRow} onClose={() => setSnoozeRow(null)} onPick={(iso) => { if (snoozeRow) doSnooze(snoozeRow, iso); }} label={snoozeRow ? `Snooze ${snoozeRow.code} until…` : undefined} />
      <SnoozeSheet open={!!snoozeTodo} onClose={() => setSnoozeTodo(null)} onPick={(iso) => { if (snoozeTodo) snoozeTodoTo(snoozeTodo, iso); }} label={snoozeTodo ? "Reschedule to…" : undefined} />
    </div>
  );
}

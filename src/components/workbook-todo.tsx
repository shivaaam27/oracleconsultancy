"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Clock, CircleAlert, ListTodo, Loader2, ChevronRight } from "lucide-react";
import type { TaskRow } from "@/lib/queries";
import { Deadline, hasTime } from "@/components/deadline";
import { SnoozeSheet } from "@/components/snooze-sheet";
import { useToast } from "@/components/toast";
import { callUndo } from "@/components/undo-banner";
import { inlineUpdateTask } from "@/app/task/actions";

const pad = (n: number) => String(n).padStart(2, "0");

type Mode = "date" | "company";
type Bucket = { key: string; label: string; tone: "danger" | "warn" | "default"; items: TaskRow[] };

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
const byDeadline = (a: TaskRow, b: TaskRow) => a.deadline!.getTime() - b.deadline!.getTime();

function bucketise(tasks: TaskRow[]): Bucket[] {
  const todayMs = startOfDay(new Date()).getTime();
  const b: Record<string, TaskRow[]> = { overdue: [], today: [], tomorrow: [], week: [], later: [] };
  for (const t of tasks) {
    if (!t.deadline) continue;
    const diff = Math.round((startOfDay(t.deadline).getTime() - todayMs) / 86400000);
    if (diff < 0) b.overdue.push(t);
    else if (diff === 0) b.today.push(t);
    else if (diff === 1) b.tomorrow.push(t);
    else if (diff <= 7) b.week.push(t);
    else b.later.push(t);
  }
  for (const k of Object.keys(b)) b[k].sort(byDeadline);
  const out: Bucket[] = [
    { key: "overdue", label: "Overdue", tone: "danger", items: b.overdue },
    { key: "today", label: "Today", tone: "warn", items: b.today },
    { key: "tomorrow", label: "Tomorrow", tone: "default", items: b.tomorrow },
    { key: "week", label: "This week", tone: "default", items: b.week },
    { key: "later", label: "Later", tone: "default", items: b.later },
  ];
  return out.filter((x) => x.items.length > 0);
}

/**
 * Workbook To-do — a reminders list built on timed deadlines. Two views:
 * "By date" (Overdue/Today/… — the everyday default) and "By company"
 * (collapsible per-company sections). Tick to complete, snooze, or open.
 * Shares the tasks data, so changes here show everywhere.
 */
export function WorkbookTodo({ tasks }: { tasks: TaskRow[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [done, setDone] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [snoozeRow, setSnoozeRow] = useState<TaskRow | null>(null);
  const [mode, setMode] = useState<Mode>("date");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const live = tasks.filter((t) => !done.has(t.code) && t.deadline);

  function openTask(code: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("task", code);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  async function complete(t: TaskRow) {
    setBusy(t.code);
    setDone((s) => new Set(s).add(t.code));
    const res = await inlineUpdateTask(t.code, "status", "Completed");
    setBusy(null);
    if (res.ok) {
      toast(`${t.code} completed`, { tone: "success", duration: 6000, action: res.undoToken ? { label: "Undo", onClick: async () => { await callUndo(res.undoToken!); setDone((s) => { const n = new Set(s); n.delete(t.code); return n; }); router.refresh(); } } : undefined });
    } else {
      setDone((s) => { const n = new Set(s); n.delete(t.code); return n; });
      toast(res.error || "Failed", { tone: "warn", duration: 3000 });
    }
    router.refresh();
  }

  async function doSnooze(t: TaskRow, iso: string) {
    const res = await inlineUpdateTask(t.code, "deadline", iso);
    if (res.ok) {
      const when = new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
      toast(`${t.code} moved to ${when}`, { tone: "success", duration: 6000, action: res.undoToken ? { label: "Undo", onClick: async () => { await callUndo(res.undoToken!); router.refresh(); } } : undefined });
    }
    router.refresh();
  }

  function Row({ t }: { t: TaskRow }) {
    return (
      <motion.div key={t.code} layout exit={{ opacity: 0, height: 0 }} className="flex items-center gap-3 px-3 py-2.5 hover:bg-bg-muted/40 transition-colors">
        <button type="button" onClick={() => complete(t)} disabled={busy === t.code} className="shrink-0 h-5 w-5 rounded-full border-2 border-border hover:border-accent flex items-center justify-center text-transparent hover:text-accent transition-colors" aria-label="Mark complete">
          {busy === t.code ? <Loader2 size={12} className="animate-spin text-accent" /> : <Check size={12} />}
        </button>
        <button type="button" onClick={() => openTask(t.code)} className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-1.5 text-sm leading-snug">
            <span className="inline-block w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: t.companyAccent || "var(--accent)" }} />
            <span className="truncate">{t.actionItem}</span>
          </div>
          <div className="text-xs text-fg-muted mt-0.5 flex items-center gap-1.5">
            <span className="font-mono">{t.code}</span>
            {t.deadline && hasTime(t.deadline) && <span className="font-mono text-fg-subtle">{pad(t.deadline.getHours())}:{pad(t.deadline.getMinutes())}</span>}
            {t.assignees.length > 0 && <span className="truncate max-w-[160px]">· {t.assignees.join(", ")}</span>}
          </div>
        </button>
        <span className="shrink-0"><Deadline date={t.deadline} className="text-xs" /></span>
        <button type="button" onClick={() => setSnoozeRow(t)} className="shrink-0 h-7 w-7 rounded-lg text-fg-muted hover:text-accent hover:bg-bg-muted inline-flex items-center justify-center" aria-label="Snooze" title="Snooze"><Clock size={14} /></button>
      </motion.div>
    );
  }

  const buckets = bucketise(live);
  const total = live.length;
  const overdue = buckets.find((b) => b.key === "overdue")?.items.length ?? 0;

  // Company groups (sorted by name; each list sorted by deadline).
  const companyMap = new Map<string, { accent: string | null; items: TaskRow[] }>();
  for (const t of live) {
    const g = companyMap.get(t.companyName) || { accent: t.companyAccent, items: [] };
    g.items.push(t);
    companyMap.set(t.companyName, g);
  }
  const companyGroups = [...companyMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [, g] of companyGroups) g.items.sort(byDeadline);

  const Toggle = (
    <div className="inline-flex items-center rounded-full bg-bg-subtle p-0.5 text-xs">
      {(["date", "company"] as Mode[]).map((mo) => (
        <button key={mo} type="button" onClick={() => setMode(mo)} className={"px-3 py-1 rounded-full transition-colors " + (mode === mo ? "bg-bg-elev text-fg shadow-sm" : "text-fg-muted hover:text-fg")}>
          {mo === "date" ? "By date" : "By company"}
        </button>
      ))}
    </div>
  );

  if (total === 0) {
    return (
      <div className="elevated bg-bg-elev rounded-xl border border-border py-16 text-center">
        <ListTodo size={28} className="mx-auto text-fg-subtle mb-2" />
        <p className="text-sm text-fg-muted">Nothing due.</p>
        <p className="text-xs text-fg-subtle mt-1">Tasks with a deadline appear here as reminders. Add a time to a deadline to make it a timed to-do.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm text-fg-muted">
          <ListTodo size={16} className="text-accent" />
          <span className="font-medium text-fg">{total} due</span>
          {overdue > 0 && <span className="inline-flex items-center gap-1 text-danger"><CircleAlert size={13} /> {overdue} overdue</span>}
        </div>
        {Toggle}
      </div>

      {mode === "date" ? (
        buckets.map((b) => (
          <section key={b.key} className="space-y-1.5">
            <h3 className={"text-xs font-semibold uppercase tracking-wider " + (b.tone === "danger" ? "text-danger" : b.tone === "warn" ? "text-warn" : "text-fg-muted")}>
              {b.label} <span className="text-fg-subtle font-normal">· {b.items.length}</span>
            </h3>
            <div className="elevated bg-bg-elev rounded-xl border border-border divide-y divide-border/60 overflow-hidden">
              <AnimatePresence initial={false}>{b.items.map((t) => <Row key={t.code} t={t} />)}</AnimatePresence>
            </div>
          </section>
        ))
      ) : (
        companyGroups.map(([name, g]) => {
          const isCollapsed = collapsed.has(name);
          return (
            <section key={name} className="space-y-1.5">
              <button
                type="button"
                onClick={() => setCollapsed((s) => { const n = new Set(s); n.has(name) ? n.delete(name) : n.add(name); return n; })}
                className="w-full flex items-center gap-2 text-left"
              >
                <ChevronRight size={14} className={"text-fg-subtle transition-transform " + (isCollapsed ? "" : "rotate-90")} />
                <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: g.accent || "var(--accent)" }} />
                <span className="text-sm font-medium">{name}</span>
                <span className="text-xs text-fg-subtle">· {g.items.length}</span>
              </button>
              <AnimatePresence initial={false}>
                {!isCollapsed && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }} className="overflow-hidden">
                    <div className="elevated bg-bg-elev rounded-xl border border-border divide-y divide-border/60 overflow-hidden">
                      {g.items.map((t) => <Row key={t.code} t={t} />)}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </section>
          );
        })
      )}

      <SnoozeSheet open={!!snoozeRow} onClose={() => setSnoozeRow(null)} onPick={(iso) => { if (snoozeRow) doSnooze(snoozeRow, iso); }} label={snoozeRow ? `Snooze ${snoozeRow.code} until…` : undefined} />
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Clock, CircleAlert, ListTodo, Loader2 } from "lucide-react";
import type { TaskRow } from "@/lib/queries";
import { Deadline, hasTime } from "@/components/deadline";
import { SnoozeSheet } from "@/components/snooze-sheet";
import { useToast } from "@/components/toast";
import { callUndo } from "@/components/undo-banner";
import { inlineUpdateTask } from "@/app/task/actions";

const pad = (n: number) => String(n).padStart(2, "0");

type Bucket = { key: string; label: string; tone: "danger" | "warn" | "default"; items: TaskRow[] };

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }

function bucketise(tasks: TaskRow[]): Bucket[] {
  const todayMs = startOfDay(new Date()).getTime();
  const buckets: Record<string, TaskRow[]> = { overdue: [], today: [], tomorrow: [], week: [], later: [] };
  for (const t of tasks) {
    if (!t.deadline) continue;
    const diff = Math.round((startOfDay(t.deadline).getTime() - todayMs) / 86400000);
    if (diff < 0) buckets.overdue.push(t);
    else if (diff === 0) buckets.today.push(t);
    else if (diff === 1) buckets.tomorrow.push(t);
    else if (diff <= 7) buckets.week.push(t);
    else buckets.later.push(t);
  }
  const sortFn = (a: TaskRow, b: TaskRow) => (a.deadline!.getTime() - b.deadline!.getTime());
  for (const k of Object.keys(buckets)) buckets[k].sort(sortFn);
  const out: Bucket[] = [
    { key: "overdue", label: "Overdue", tone: "danger", items: buckets.overdue },
    { key: "today", label: "Today", tone: "warn", items: buckets.today },
    { key: "tomorrow", label: "Tomorrow", tone: "default", items: buckets.tomorrow },
    { key: "week", label: "This week", tone: "default", items: buckets.week },
    { key: "later", label: "Later", tone: "default", items: buckets.later },
  ];
  return out.filter((b) => b.items.length > 0);
}

/**
 * Workbook To-do — a reminders list built on timed deadlines. Every open task
 * with a deadline, grouped Overdue / Today / Tomorrow / This week / Later. Tick
 * to complete, snooze to a new day/time, or tap to open. Shares the tasks data,
 * so changes here show everywhere.
 */
export function WorkbookTodo({ tasks }: { tasks: TaskRow[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [done, setDone] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [snoozeRow, setSnoozeRow] = useState<TaskRow | null>(null);

  const live = tasks.filter((t) => !done.has(t.code));
  const buckets = bucketise(live);

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

  if (buckets.length === 0) {
    return (
      <div className="elevated bg-bg-elev rounded-xl border border-border py-16 text-center">
        <ListTodo size={28} className="mx-auto text-fg-subtle mb-2" />
        <p className="text-sm text-fg-muted">Nothing due.</p>
        <p className="text-xs text-fg-subtle mt-1">Tasks with a deadline appear here as reminders. Add a time to a deadline to make it a timed to-do.</p>
      </div>
    );
  }

  const total = live.filter((t) => t.deadline).length;
  const overdue = buckets.find((b) => b.key === "overdue")?.items.length ?? 0;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center gap-2 text-sm text-fg-muted">
        <ListTodo size={16} className="text-accent" />
        <span className="font-medium text-fg">{total} due</span>
        {overdue > 0 && <span className="inline-flex items-center gap-1 text-danger"><CircleAlert size={13} /> {overdue} overdue</span>}
      </div>

      {buckets.map((b) => (
        <section key={b.key} className="space-y-1.5">
          <h3 className={"text-xs font-semibold uppercase tracking-wider " + (b.tone === "danger" ? "text-danger" : b.tone === "warn" ? "text-warn" : "text-fg-muted")}>
            {b.label} <span className="text-fg-subtle font-normal">· {b.items.length}</span>
          </h3>
          <div className="elevated bg-bg-elev rounded-xl border border-border divide-y divide-border/60 overflow-hidden">
            <AnimatePresence initial={false}>
              {b.items.map((t) => (
                <motion.div
                  key={t.code}
                  layout
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-center gap-3 px-3 py-2.5 hover:bg-bg-muted/40 transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => complete(t)}
                    disabled={busy === t.code}
                    className="shrink-0 h-5 w-5 rounded-full border-2 border-border hover:border-accent flex items-center justify-center text-transparent hover:text-accent transition-colors"
                    aria-label="Mark complete"
                  >
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
                  <button type="button" onClick={() => setSnoozeRow(t)} className="shrink-0 h-7 w-7 rounded-lg text-fg-muted hover:text-accent hover:bg-bg-muted inline-flex items-center justify-center" aria-label="Snooze" title="Snooze">
                    <Clock size={14} />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </section>
      ))}

      <SnoozeSheet
        open={!!snoozeRow}
        onClose={() => setSnoozeRow(null)}
        onPick={(iso) => { if (snoozeRow) doSnooze(snoozeRow, iso); }}
        label={snoozeRow ? `Snooze ${snoozeRow.code} until…` : undefined}
      />
    </div>
  );
}

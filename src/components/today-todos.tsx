"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ListTodo, ChevronRight, UserRound, CircleAlert } from "lucide-react";
import type { Todo } from "@/app/todos/actions";
import { toggleTodo } from "@/app/todos/actions";
import { Deadline, hasTime } from "@/components/deadline";
import { useToast } from "@/components/toast";

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Overview widget: the personal to-dos due today (and anything overdue), with a
 * tick-to-complete and a link through to the full list. Hidden when empty so it
 * never adds noise on a clear day.
 */
export function TodayTodos({ todos }: { todos: Todo[] }) {
  const { toast } = useToast();
  const [items, setItems] = useState<Todo[]>(todos);

  if (items.length === 0) return null;

  const startToday = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); })();
  const overdue = items.filter((t) => t.dueAt && new Date(t.dueAt).getTime() < startToday).length;

  async function complete(t: Todo) {
    setItems((arr) => arr.filter((x) => x.id !== t.id));
    try { await toggleTodo(t.id, true); } catch { toast("Could not update", { tone: "warn", duration: 3000 }); return; }
    toast("Marked done", {
      tone: "success", duration: 5000,
      action: { label: "Undo", onClick: async () => { setItems((arr) => [t, ...arr]); try { await toggleTodo(t.id, false); } catch { /* best-effort */ } } },
    });
  }

  return (
    <div className="glass elevated rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-border/60">
        <div className="flex items-center gap-2 text-sm">
          <ListTodo size={16} className="text-accent" />
          <span className="font-medium">To-dos for today</span>
          <span className="text-fg-subtle">· {items.length}</span>
          {overdue > 0 && <span className="inline-flex items-center gap-1 text-danger text-xs"><CircleAlert size={12} /> {overdue} overdue</span>}
        </div>
        <Link href="/workbook?tab=todo" className="inline-flex items-center gap-0.5 text-xs text-fg-muted hover:text-accent transition-colors">
          All <ChevronRight size={13} />
        </Link>
      </div>
      <div className="divide-y divide-border/60">
        <AnimatePresence initial={false}>
          {items.map((t) => {
            const due = t.dueAt ? new Date(t.dueAt) : null;
            return (
              <motion.div key={t.id} layout exit={{ opacity: 0, height: 0 }} className="flex items-center gap-3 px-3.5 py-2.5 hover:bg-bg-muted/40 transition-colors">
                <button type="button" onClick={() => complete(t)} aria-label="Mark complete" className="shrink-0 h-5 w-5 rounded-full border-2 border-border hover:border-accent flex items-center justify-center text-transparent hover:text-accent transition-colors">
                  <Check size={12} />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="text-sm leading-snug truncate">{t.title}</div>
                  {(t.companyName || t.personName || (due && hasTime(due))) && (
                    <div className="text-xs text-fg-muted mt-0.5 flex items-center gap-1.5 flex-wrap">
                      {due && hasTime(due) && <span className="font-mono text-fg-subtle">{pad(due.getHours())}:{pad(due.getMinutes())}</span>}
                      {t.companyName && <span className="truncate max-w-[160px]">{t.companyName}</span>}
                      {t.personName && <span className="inline-flex items-center gap-1 text-accent"><UserRound size={11} className="shrink-0" />{t.personName}</span>}
                    </div>
                  )}
                </div>
                {due && <span className="shrink-0"><Deadline date={due} className="text-xs" /></span>}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

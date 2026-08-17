"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, ListChecks, Plus, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useToast } from "@/components/toast";
import { isOverdue, whenLabel, type NoteTodo } from "@/lib/note-todos-shared";
import { remindAboutNote, removeNoteTodo, toggleNoteTodo } from "@/app/notes/actions";

/**
 * What this note put on your plate. Phase 4 of memory/notes_module_plan.md.
 *
 * These are ORDINARY `todos` rows with `note_id` set — the same rows the Home
 * card, the reminder cron, the push and the morning digest already work from. So
 * ticking one here ticks it everywhere, and there is no second list to keep in
 * step. That reuse is the whole design; do not grow a note-only to-do store.
 *
 * The panel is deliberately small: tick, remove, and one way to add a reminder
 * for the note itself. Everything richer (companies, people, due dates) belongs
 * on the to-do list proper, which these rows are already part of.
 */
export function NoteTodosPanel({
  noteId,
  noteTitle,
  todos,
}: {
  noteId: number;
  noteTitle: string;
  todos: NoteTodo[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [, start] = useTransition();
  const [adding, setAdding] = useState(false);

  const open = todos.filter((t) => !t.done);
  const done = todos.filter((t) => t.done);

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-bg-elev">
      <header className="flex items-center gap-1.5 border-b border-border bg-bg-subtle/60 px-2.5 py-1.5">
        <ListChecks size={12} className="text-fg-subtle" />
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-muted">To-dos</h2>
        {open.length > 0 && <span className="ml-auto text-[11px] tabular text-fg-subtle">{open.length}</span>}
      </header>

      {todos.length === 0 && !adding && (
        <p className="px-2.5 py-2.5 text-[11.5px] leading-relaxed text-fg-subtle">
          Nothing yet. Tick-box a line in the note and press <strong className="font-medium text-fg-muted">Make a to-do</strong>,
          or set a reminder for the whole note below.
        </p>
      )}

      {todos.length > 0 && (
        <ul className="divide-y divide-border">
          {[...open, ...done].map((t) => (
            <li key={t.id} className="group flex items-start gap-2 px-2.5 py-1.5">
              <input
                type="checkbox"
                checked={t.done}
                aria-label={t.done ? `Mark "${t.title}" not done` : `Mark "${t.title}" done`}
                onChange={(e) => {
                  const next = e.target.checked;
                  start(async () => {
                    const res = await toggleNoteTodo(t.id, next, noteId);
                    if (!res.ok) { toast("Could not update that.", { tone: "danger" }); return; }
                    router.refresh();
                  });
                }}
                className="mt-[3px] h-[13px] w-[13px] shrink-0 cursor-pointer accent-[hsl(var(--accent))]"
              />
              <span className="min-w-0 flex-1">
                <span className={cn("block text-[12px] leading-snug", t.done ? "text-fg-subtle line-through" : "text-fg")}>
                  {t.title}
                </span>
                {t.remindAt && !t.done && (
                  <span className={cn("mt-px flex items-center gap-1 text-[10.5px]", isOverdue(t) ? "text-danger" : "text-fg-subtle")}>
                    <Bell size={9} /> {whenLabel(t.remindAt)}
                  </span>
                )}
              </span>
              <button
                type="button"
                aria-label={`Remove "${t.title}"`}
                title="Remove"
                onClick={() => start(async () => {
                  const res = await removeNoteTodo(t.id, noteId);
                  if (!res.ok) { toast("Could not remove that.", { tone: "danger" }); return; }
                  toast("Removed.", { tone: "success" });
                  router.refresh();
                })}
                /* Hidden until the row is hovered or the button itself is focused —
                   a delete on every row is visual noise, but it must still be
                   reachable by keyboard. */
                className="mt-px shrink-0 rounded p-0.5 text-fg-subtle opacity-0 transition-opacity hover:bg-bg-muted hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="border-t border-border p-1.5">
        {adding ? (
          <ReminderForm
            noteId={noteId}
            noteTitle={noteTitle}
            onDone={() => { setAdding(false); router.refresh(); }}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-[11.5px] font-medium text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg"
          >
            <Plus size={12} /> Remind me about this note
          </button>
        )}
      </div>
    </section>
  );
}

/** Three ordinary choices and a date box. A reminder you have to think about is a
 *  reminder you do not set. */
function ReminderForm({
  noteId, noteTitle, onDone, onCancel,
}: {
  noteId: number;
  noteTitle: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [custom, setCustom] = useState("");

  const submit = async (iso: string) => {
    setBusy(true);
    try {
      const res = await remindAboutNote({ noteId, title: noteTitle || "Look at this note", remindAt: iso });
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      toast("Reminder set.", { tone: "success" });
      onDone();
    } finally {
      setBusy(false);
    }
  };

  /** 9am is when the day starts here, and when the morning digest goes out — so a
   *  reminder arrives alongside everything else rather than on its own. */
  const at9 = (daysAhead: number) => {
    const d = new Date();
    d.setDate(d.getDate() + daysAhead);
    d.setHours(9, 0, 0, 0);
    return d.toISOString();
  };
  const nextMonday = () => {
    const d = new Date();
    d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
    d.setHours(9, 0, 0, 0);
    return d.toISOString();
  };

  const chip = "rounded-md border border-border px-1.5 py-1 text-[11px] font-medium text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg disabled:opacity-40";

  return (
    <div className="space-y-1.5 p-0.5">
      <div className="flex flex-wrap gap-1">
        <button type="button" disabled={busy} onClick={() => void submit(at9(1))} className={chip}>Tomorrow</button>
        <button type="button" disabled={busy} onClick={() => void submit(nextMonday())} className={chip}>Monday</button>
        <button type="button" disabled={busy} onClick={() => void submit(at9(7))} className={chip}>In a week</button>
      </div>
      <div className="flex items-center gap-1">
        {/* A real date-time field: a free-text date is a guess, and the action
            rejects anything unparseable or already past. */}
        <input
          type="datetime-local"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          aria-label="Remind me at"
          className="h-7 min-w-0 flex-1 rounded-md border border-border bg-bg px-1.5 text-[11px] text-fg"
        />
        <button
          type="button"
          disabled={busy || !custom}
          onClick={() => void submit(new Date(custom).toISOString())}
          className="h-7 shrink-0 rounded-md bg-accent px-2 text-[11px] font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          Set
        </button>
        <button type="button" onClick={onCancel} className="h-7 shrink-0 rounded-md px-1.5 text-[11px] text-fg-muted hover:text-fg">
          Cancel
        </button>
      </div>
    </div>
  );
}

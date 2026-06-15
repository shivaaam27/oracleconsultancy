"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { TodoCardItem } from "@/lib/todo-reminders";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/cn";
import { ListChecks, Plus, Check, Trash2, Loader2, Bell, Star, CalendarDays } from "lucide-react";

type CreateInput = { title: string; remindAt: string | null };

export type TodoCardActions = {
  createAction: (input: CreateInput) => Promise<{ ok: boolean; error?: string; todo?: TodoCardItem }>;
  toggleAction: (id: number, done: boolean) => Promise<{ ok: boolean; error?: string }>;
  deleteAction: (id: number) => Promise<{ ok: boolean; error?: string }>;
};

/** Local datetime-local value (browser zone) → ISO for the server. */
function toIso(local: string): string | null {
  if (!local) return null;
  const ms = Date.parse(local);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/** Important first, then soonest time. Kept client-local so this component never
 *  imports the server-only todo-reminders module (which pulls in Supabase). */
function sortTodoCard(a: TodoCardItem, b: TodoCardItem): number {
  if (a.important !== b.important) return a.important ? -1 : 1;
  const at = a.remindAt ?? a.dueAt;
  const bt = b.remindAt ?? b.dueAt;
  return (at ? Date.parse(at) : Infinity) - (bt ? Date.parse(bt) : Infinity);
}

const TZ = "Africa/Nairobi";
function whenLabel(iso: string, withTime: boolean): { text: string; overdue: boolean } {
  const t = new Date(iso);
  const now = new Date();
  const overdue = t.getTime() <= now.getTime();
  const dayKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ });
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  let day: string;
  if (dayKey(t) === dayKey(now)) day = "Today";
  else if (dayKey(t) === dayKey(tomorrow)) day = "Tomorrow";
  else day = t.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: TZ });
  if (!withTime) return { text: `Due ${day}`, overdue };
  const time = t.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
  return { text: `${day} · ${time}`, overdue };
}

export function TodoCard({
  items: initial,
  createAction,
  toggleAction,
  deleteAction,
  title = "Your to-dos",
}: TodoCardActions & { items: TodoCardItem[]; title?: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [when, setWhen] = useState(""); // empty = a plain to-do (no ping)
  // Optimistic overlay over the server list: track adds + removals by id so the
  // UI updates instantly AND survives the slow Home refresh (no flash-back).
  const [added, setAdded] = useState<TodoCardItem[]>([]);
  const [removedIds, setRemovedIds] = useState<Set<number>>(new Set());
  useEffect(() => {
    // Server caught up → drop overlay entries it now reflects (keeps them bounded).
    const ids = new Set(initial.map((i) => i.id));
    setAdded((a) => a.filter((x) => !ids.has(x.id)));
    setRemovedIds((s) => new Set([...s].filter((id) => ids.has(id))));
  }, [initial]);

  const visible = useMemo(() => {
    const map = new Map<number, TodoCardItem>();
    for (const it of initial) map.set(it.id, it);
    for (const it of added) map.set(it.id, it);
    for (const id of removedIds) map.delete(id);
    return [...map.values()].sort(sortTodoCard);
  }, [initial, added, removedIds]);

  // busy only spans the awaited action (fast); router.refresh() runs after, in the
  // background, so the heavy Home re-render never leaves the buttons disabled.
  async function add() {
    const t = text.trim();
    if (!t) { toast("Type what you need to do.", { tone: "warn" }); return; }
    const remindAt = when ? toIso(when) : null;
    setBusy(true);
    const res = await createAction({ title: t, remindAt });
    setBusy(false);
    if (!res.ok) { toast(res.error || "Could not add.", { tone: "danger" }); return; }
    setText(""); setWhen("");
    if (res.todo) setAdded((a) => [...a, res.todo!]);
    router.refresh();
  }

  async function complete(id: number) {
    setBusy(true);
    const res = await toggleAction(id, true);
    setBusy(false);
    if (!res.ok) { toast(res.error || "Could not update.", { tone: "danger" }); return; }
    setRemovedIds((s) => new Set(s).add(id)); // list shows open only
    router.refresh();
  }

  async function remove(id: number) {
    setBusy(true);
    const res = await deleteAction(id);
    setBusy(false);
    if (!res.ok) { toast(res.error || "Could not delete.", { tone: "danger" }); return; }
    setRemovedIds((s) => new Set(s).add(id));
    router.refresh();
  }

  return (
    <div className="bg-bg-elev ring-1 ring-border rounded-2xl elevated p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center justify-center h-6 w-6 rounded-md bg-accent-soft text-accent shrink-0"><ListChecks size={13} /></span>
        <h3 className="text-sm font-semibold">{title}</h3>
        {visible.length > 0 && <span className="ml-auto text-[11px] text-fg-subtle tabular">{visible.length} open</span>}
      </div>

      {/* Quick add — title + optional time. Set a time and it pings you. */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }}
          placeholder="Add a to-do…"
          className="flex-1 min-w-[10rem] text-sm rounded-lg border border-border bg-bg-subtle/60 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent/50"
        />
        <input
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          title="Optional — set a time to get a reminder ping"
          className="text-xs rounded-lg border border-border bg-bg-subtle/60 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent/50"
        />
        <button
          type="button"
          onClick={add}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-accent text-accent-fg hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Add
        </button>
      </div>

      {visible.length === 0 ? (
        <p className="text-xs text-fg-muted">Nothing on your list. Add one above — set a time and it'll ping you.</p>
      ) : (
        <ul className="divide-y divide-border/60">
          {visible.map((r) => {
            const stamp = r.remindAt ? whenLabel(r.remindAt, true) : r.dueAt ? whenLabel(r.dueAt, false) : null;
            const context = [r.companyName, r.personName].filter(Boolean).join(" · ");
            return (
              <li key={r.id} className="flex items-start gap-2.5 py-2">
                <button
                  type="button"
                  onClick={() => complete(r.id)}
                  disabled={busy}
                  aria-label="Mark done"
                  className="mt-0.5 h-4 w-4 rounded-[5px] border border-border-strong hover:border-accent hover:bg-accent/10 transition-colors grid place-items-center text-transparent hover:text-accent shrink-0"
                >
                  <Check size={11} />
                </button>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    {r.important && <Star size={11} className="text-warn fill-warn shrink-0" />}
                    <span className="text-sm truncate">{r.title}</span>
                  </span>
                  <span className="flex items-center gap-2 mt-0.5">
                    {stamp && (
                      <span className={cn("inline-flex items-center gap-1 text-[11px] tabular", stamp.overdue ? "text-danger" : "text-fg-subtle")}>
                        {r.remindAt ? <Bell size={10} /> : <CalendarDays size={10} />}
                        {stamp.overdue && r.remindAt ? `⚠ ${stamp.text}` : stamp.text}
                      </span>
                    )}
                    {context && <span className="text-[11px] text-fg-subtle truncate">{context}</span>}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => remove(r.id)}
                  disabled={busy}
                  aria-label="Delete"
                  className="text-fg-subtle hover:text-danger transition-colors shrink-0 mt-0.5"
                >
                  <Trash2 size={13} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

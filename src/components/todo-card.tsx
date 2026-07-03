"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { TodoCardItem } from "@/lib/todo-reminders";
import { useToast } from "@/components/toast";
import { CaretInput } from "@/components/ui";
import { DateTimeField } from "@/components/date-time-field";
import { cn } from "@/lib/cn";
import { ListChecks, Plus, Check, Trash2, Loader2, Bell, Star, CalendarDays, X, Pencil } from "lucide-react";

type CreateInput = { title: string; remindAt: string | null };
type UpdateInput = { id: number; title?: string; remindAt?: string | null };

export type TodoCardActions = {
  createAction: (input: CreateInput) => Promise<{ ok: boolean; error?: string; todo?: TodoCardItem }>;
  toggleAction: (id: number, done: boolean) => Promise<{ ok: boolean; error?: string }>;
  deleteAction: (id: number) => Promise<{ ok: boolean; error?: string }>;
  updateAction?: (input: UpdateInput) => Promise<{ ok: boolean; error?: string }>;
};

/** A picker value ("yyyy-mm-ddThh:mm", browser zone) → ISO for the server. */
function toIso(local: string): string | null {
  if (!local) return null;
  const ms = Date.parse(local);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/** ISO (server) → the picker's local "yyyy-mm-ddThh:mm" (for seeding an edit). */
function isoToLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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

// Unified control styling shared by the add + edit rows.
const BTN_PRIMARY = "inline-flex items-center gap-1.5 rounded-xl bg-accent px-3.5 py-2 text-xs font-medium text-accent-fg transition-[opacity,transform] hover:opacity-90 active:scale-95 disabled:opacity-50";
const BTN_GHOST = "inline-flex items-center gap-1.5 rounded-xl bg-bg-subtle px-3 py-2 text-xs font-medium text-fg-muted ring-1 ring-border transition-colors hover:text-fg hover:bg-bg-muted";

export function TodoCard({
  items: initial,
  createAction,
  toggleAction,
  deleteAction,
  updateAction,
  title = "To-Do List",
}: TodoCardActions & { items: TodoCardItem[]; title?: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [when, setWhen] = useState(""); // "yyyy-mm-ddThh:mm" — empty = a plain to-do
  const [showWhen, setShowWhen] = useState(false);
  // Optimistic overlay: instant adds/removals/edits over the (slow-to-refresh) list.
  const [added, setAdded] = useState<TodoCardItem[]>([]);
  const [removedIds, setRemovedIds] = useState<Set<number>>(new Set());
  const [overrides, setOverrides] = useState<Map<number, { title: string; remindAt: string | null }>>(new Map());
  // Inline edit state.
  const [editId, setEditId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [editWhen, setEditWhen] = useState("");

  useEffect(() => {
    const byId = new Map(initial.map((i) => [i.id, i]));
    setAdded((a) => a.filter((x) => !byId.has(x.id)));
    setRemovedIds((s) => new Set([...s].filter((id) => byId.has(id))));
    // Drop an override once the server row already reflects it.
    setOverrides((m) => {
      const next = new Map(m);
      for (const [id, ov] of m) {
        const srv = byId.get(id);
        if (srv && srv.title === ov.title && (srv.remindAt ?? null) === ov.remindAt) next.delete(id);
      }
      return next;
    });
  }, [initial]);

  const visible = useMemo(() => {
    const map = new Map<number, TodoCardItem>();
    for (const it of initial) map.set(it.id, it);
    for (const it of added) map.set(it.id, it);
    for (const id of removedIds) map.delete(id);
    for (const [id, ov] of overrides) {
      const cur = map.get(id);
      if (cur) map.set(id, { ...cur, title: ov.title, remindAt: ov.remindAt });
    }
    return [...map.values()].sort(sortTodoCard);
  }, [initial, added, removedIds, overrides]);

  async function add() {
    const t = text.trim();
    if (!t) { toast("Type what you need to do.", { tone: "warn" }); return; }
    const remindAt = when ? toIso(when) : null;
    setBusy(true);
    const res = await createAction({ title: t, remindAt });
    setBusy(false);
    if (!res.ok) { toast(res.error || "Could not add.", { tone: "danger" }); return; }
    setText(""); setWhen(""); setShowWhen(false);
    if (res.todo) setAdded((a) => [...a, res.todo!]);
    if (remindAt) toast("Reminder set — we'll ping you.", { tone: "success" });
    router.refresh();
  }

  async function complete(id: number) {
    setBusy(true);
    const res = await toggleAction(id, true);
    setBusy(false);
    if (!res.ok) { toast(res.error || "Could not update.", { tone: "danger" }); return; }
    setRemovedIds((s) => new Set(s).add(id));
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

  function startEdit(r: TodoCardItem) {
    setEditId(r.id);
    setEditText(r.title);
    setEditWhen(isoToLocal(r.remindAt));
  }
  function cancelEdit() { setEditId(null); setEditText(""); setEditWhen(""); }

  async function saveEdit(id: number) {
    if (!updateAction) return;
    const t = editText.trim();
    if (!t) { toast("Type what you need to do.", { tone: "warn" }); return; }
    const remindAt = editWhen ? toIso(editWhen) : null;
    setBusy(true);
    const res = await updateAction({ id, title: t, remindAt });
    setBusy(false);
    if (!res.ok) { toast(res.error || "Could not save.", { tone: "danger" }); return; }
    setOverrides((m) => new Map(m).set(id, { title: t, remindAt }));
    cancelEdit();
    router.refresh();
  }

  return (
    <div className="bg-bg-elev ring-1 ring-border rounded-2xl elevated p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center justify-center h-6 w-6 rounded-md bg-accent-soft text-accent shrink-0"><ListChecks size={13} /></span>
        <h3 className="text-sm font-semibold">{title}</h3>
        {visible.length > 0 && <span className="ml-auto text-[11px] text-fg-subtle tabular">{visible.length} open</span>}
      </div>

      {/* Quick add — title, then an optional reminder (Aurora date + time; no seconds). */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-1 min-w-[10rem] items-center rounded-xl px-3.5 py-2 ring-1 ring-border transition-shadow focus-within:ring-2 focus-within:ring-accent/40">
            <CaretInput
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") add(); }}
              placeholder="Add a to-do…"
              className="text-sm"
            />
          </div>
          {!showWhen && !when && (
            <button type="button" onClick={() => setShowWhen(true)} className={BTN_GHOST}>
              <Bell size={13} className="text-accent" /> Add reminder
            </button>
          )}
          <button type="button" onClick={add} disabled={busy} className={BTN_PRIMARY}>
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Add
          </button>
        </div>
        {(showWhen || when) && (
          <div className="flex items-center gap-2 rounded-xl bg-bg-subtle/40 p-2 ring-1 ring-border">
            <Bell size={13} className="ml-1 shrink-0 text-accent" />
            <div className="min-w-0 flex-1"><DateTimeField name="todo-remind" allDay={false} value={when} onChange={setWhen} /></div>
            <button type="button" onClick={() => { setWhen(""); setShowWhen(false); }} aria-label="Remove reminder" className="shrink-0 rounded-lg p-1.5 text-fg-subtle transition-colors hover:text-danger">
              <X size={14} />
            </button>
          </div>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="text-xs text-fg-muted">Nothing on your list. Add one above — set a time and it&apos;ll ping you.</p>
      ) : (
        <ul className="divide-y divide-border/60">
          {visible.map((r) => {
            if (editId === r.id) {
              return (
                <li key={r.id} className="flex flex-col gap-2 py-2.5">
                  <div className="flex items-center rounded-xl px-3.5 py-2 ring-1 ring-border focus-within:ring-2 focus-within:ring-accent/40">
                    <CaretInput value={editText} onChange={(e) => setEditText(e.target.value)} placeholder="To-do…" className="text-sm" />
                  </div>
                  <div className="flex items-center gap-2 rounded-xl bg-bg-subtle/40 p-2 ring-1 ring-border">
                    <Bell size={13} className="ml-1 shrink-0 text-accent" />
                    <div className="min-w-0 flex-1"><DateTimeField name="todo-edit-remind" allDay={false} value={editWhen} onChange={setEditWhen} /></div>
                    {editWhen && (
                      <button type="button" onClick={() => setEditWhen("")} aria-label="Clear reminder" className="shrink-0 rounded-lg p-1.5 text-fg-subtle transition-colors hover:text-danger"><X size={14} /></button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => saveEdit(r.id)} disabled={busy} className={BTN_PRIMARY}>
                      {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save
                    </button>
                    <button type="button" onClick={cancelEdit} className={BTN_GHOST}>Cancel</button>
                  </div>
                </li>
              );
            }
            const stamp = r.remindAt ? whenLabel(r.remindAt, true) : r.dueAt ? whenLabel(r.dueAt, false) : null;
            const context = [r.companyName, r.personName].filter(Boolean).join(" · ");
            return (
              <li key={r.id} className="group flex items-start gap-2.5 py-2">
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
                {updateAction && (
                  <button
                    type="button"
                    onClick={() => startEdit(r)}
                    disabled={busy}
                    aria-label="Edit"
                    className="text-fg-subtle hover:text-accent transition-colors shrink-0 mt-0.5"
                  >
                    <Pencil size={13} />
                  </button>
                )}
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

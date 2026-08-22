"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { TodoCardItem } from "@/lib/todo-reminders";
import { useToast } from "@/components/toast";
import { CaretInput } from "@/components/ui";
import { DatePopover } from "@/components/date-popover";
import { dateOf, timeOf, composeDT, FIELD_TRIGGER } from "@/components/date-time-field";
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

/** Today as "yyyy-mm-dd" (local) — the default date when a time is picked first. */
function todayKey(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Reminder date + FLEXIBLE time (native time input = any minute, no 15-min slots,
 *  no seconds). Value is "yyyy-mm-ddThh:mm"; onChange emits the same. */
function ReminderFields({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <div className="min-w-0 flex-1">
        <DatePopover block triggerClassName={FIELD_TRIGGER} value={dateOf(value) || null} onChange={(d) => onChange(composeDT(d, timeOf(value) || "09:00", false))} />
      </div>
      <input
        type="time"
        value={timeOf(value)}
        onChange={(e) => onChange(composeDT(dateOf(value) || todayKey(), e.target.value || "09:00", false))}
        aria-label="Reminder time"
        className={cn(FIELD_TRIGGER, "sm:w-[7.5rem]")}
      />
    </div>
  );
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
  fill = false,
}: TodoCardActions & { items: TodoCardItem[]; title?: string; fill?: boolean }) {
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
    <div className={cn("flex flex-col gap-3 rounded-2xl bg-bg-elev p-4 ring-1 ring-border elevated", fill && "h-full min-h-0")}>
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center justify-center h-6 w-6 rounded-md bg-accent-soft text-accent shrink-0"><ListChecks size={13} /></span>
        <h3 className="text-sm font-semibold">{title}</h3>
        {visible.length > 0 && <span className="ml-auto text-xs text-fg-subtle tabular">{visible.length} open</span>}
      </div>

      {/* Quick add — the to-do field, a bell that opens the reminder popover, and
          Add: three controls of equal height. The reminder (date + flexible time)
          opens as a small popover rather than crowding the row. */}
      <div className="relative flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-10 min-w-0 flex-1 items-center rounded-xl px-3.5 ring-1 ring-border transition-shadow focus-within:ring-2 focus-within:ring-accent/40">
            <CaretInput
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") add(); }}
              placeholder="Add a to-do…"
              className="text-sm"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowWhen((v) => !v)}
            aria-label="Add a reminder"
            title="Add a reminder"
            className={cn(
              "grid h-10 w-10 shrink-0 place-items-center rounded-xl ring-1 transition-colors",
              when ? "bg-accent-soft text-accent ring-accent/30" : "bg-bg-subtle text-fg-muted ring-border hover:text-fg",
            )}
          >
            <Bell size={16} />
          </button>
          <button
            type="button"
            onClick={add}
            disabled={busy}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-medium text-accent-fg transition-[opacity,transform] hover:opacity-90 active:scale-95 disabled:opacity-50"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={15} />} Add
          </button>
        </div>

        {/* When a reminder is set but the popover is closed, show it as a chip. */}
        {when && !showWhen && (
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent">
            <Bell size={11} /> {whenLabel(when, true).text}
            <button type="button" onClick={() => setWhen("")} aria-label="Clear reminder" className="ml-0.5 text-accent/70 transition-colors hover:text-danger"><X size={11} /></button>
          </span>
        )}

        {/* Reminder popover — date + flexible time. Closes via Done / Clear / the
            bell toggle (no click-outside backdrop, so the calendar popover inside
            can be used without dismissing this panel). */}
        {showWhen && (
          <div className="absolute inset-x-0 top-full z-30 mt-2 rounded-2xl bg-bg-elev p-3 shadow-lg ring-1 ring-border">
            <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-fg-muted"><Bell size={12} className="text-accent" /> Remind me on</p>
            <ReminderFields value={when} onChange={setWhen} />
            <div className="mt-2.5 flex items-center gap-2">
              <button type="button" onClick={() => setShowWhen(false)} className="flex-1 rounded-xl bg-accent py-2 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90">Done</button>
              {when && <button type="button" onClick={() => { setWhen(""); setShowWhen(false); }} className="rounded-xl bg-bg-subtle px-3 py-2 text-sm text-fg-muted ring-1 ring-border transition-colors hover:text-fg">Clear</button>}
            </div>
          </div>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="text-xs text-fg-muted">Nothing on your list. Add one above — set a time and it&apos;ll ping you.</p>
      ) : (
        <ul className={cn(
          "divide-y divide-border/60",
          // Scroll the list once it grows: fill = match the right-column height
          // (Needs you); otherwise cap at ~5 rows. Both get the fade + slim bar.
          fill
            ? "slim-scroll scroll-fade-y min-h-0 flex-1 overflow-y-auto overscroll-contain px-1"
            : visible.length > 5 && "slim-scroll scroll-fade-y max-h-[15.5rem] overflow-y-auto overscroll-contain px-1",
        )}>
          {visible.map((r) => {
            if (editId === r.id) {
              return (
                <li key={r.id} className="flex flex-col gap-2 py-2.5">
                  <div className="flex items-center rounded-xl px-3.5 py-2 ring-1 ring-border focus-within:ring-2 focus-within:ring-accent/40">
                    <CaretInput value={editText} onChange={(e) => setEditText(e.target.value)} placeholder="To-do…" className="text-sm" />
                  </div>
                  <div className="rounded-xl bg-bg-subtle/40 p-2 ring-1 ring-border">
                    <p className="mb-1.5 ml-1 flex items-center gap-1.5 text-xs font-medium text-fg-muted"><Bell size={11} className="text-accent" /> Reminder</p>
                    <ReminderFields value={editWhen} onChange={setEditWhen} />
                    {editWhen && (
                      <button type="button" onClick={() => setEditWhen("")} className="mt-1.5 ml-1 inline-flex items-center gap-1 text-xs text-fg-subtle transition-colors hover:text-danger"><X size={11} /> Clear reminder</button>
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
                      <span className={cn("inline-flex items-center gap-1 text-xs tabular", stamp.overdue ? "text-danger" : "text-fg-subtle")}>
                        {r.remindAt ? <Bell size={10} /> : <CalendarDays size={10} />}
                        {stamp.overdue && r.remindAt ? `⚠ ${stamp.text}` : stamp.text}
                      </span>
                    )}
                    {context && <span className="text-xs text-fg-subtle truncate">{context}</span>}
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

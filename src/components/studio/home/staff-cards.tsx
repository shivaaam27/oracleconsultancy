"use client";

/**
 * The staff member's own cards on Studio Home (26 Sept 2026, mockup S_Home):
 *  - Today — the daily check-in (Present · Remote · Half-day · Sick) with the
 *    week under it. It was a pop-up on landing plus a strip at the foot of
 *    Profile; now it is simply on Home, where the day starts.
 *  - My to-do list — the personal list, ticked the same way as subtasks.
 *  - The live notice's Acknowledge / Got it.
 * Every write is an existing portal action, which re-checks who is signed in.
 */
import { useEffect, useId, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { portalMarkAttendance, portalCreateTodo, portalToggleTodoDone, portalDeleteTodo, portalUpdateTodo } from "@/app/portal/actions";
import { portalAcknowledgeAction, portalMarkSeenAction } from "@/app/announcements/actions";
import { ListShell } from "@/components/studio/subtasks";
import { Fold } from "@/components/studio/home/studio-home";
import { useToast } from "@/components/toast";
import type { TodoCardItem } from "@/lib/todo-reminders";
import { cn } from "@/lib/cn";

const SELF = ["Present", "Remote", "Half-day", "Sick"] as const;
export type StaffWeekDay = { date: string; label: string; status: string | null; isToday: boolean };
export type StaffCheckin = { status: string | null; editable: boolean; lockReason: string | null; dateLabel: string; week: StaffWeekDay[] };

const MARK: Record<string, { sign: string; color: string }> = {
  Present: { sign: "✓", color: "#0E8A55" },
  Remote: { sign: "R", color: "#2490EF" },
  "Half-day": { sign: "½", color: "#B7700A" },
  Sick: { sign: "S", color: "#C2327F" },
  Absent: { sign: "✕", color: "#C2327F" },
  "On leave": { sign: "L", color: "#7C5CD6" },
  Holiday: { sign: "H", color: "#7C5CD6" },
};

const HEADLINE: Record<string, string> = {
  Present: "You're in today",
  Remote: "Working remotely today",
  "Half-day": "A half day today",
  Sick: "Off sick today — rest up",
};

function useCheckin(initial: string | null) {
  const router = useRouter();
  const { toast } = useToast();
  const [status, setStatus] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [, start] = useTransition();
  useEffect(() => setStatus(initial), [initial]);
  const mark = (s: string) => {
    if (s === status || busy) return;
    const prev = status;
    setStatus(s);
    setBusy(s);
    start(async () => {
      const res = await portalMarkAttendance(s);
      setBusy(null);
      if (!res.ok) { setStatus(prev); toast(res.error, { tone: "warn" }); return; }
      toast(s === "Present" ? "Checked in — have a good day." : `Marked ${s.toLowerCase()} for today.`, { tone: "success" });
      router.refresh();
    });
  };
  return { status, busy, mark };
}

function CheckinBody({ c, dense }: { c: StaffCheckin; dense?: boolean }) {
  const { status, busy, mark } = useCheckin(c.status);
  // So far this week: the days up to today that were working days.
  const upTo = c.week.slice(0, c.week.findIndex((d) => d.isToday) + 1 || c.week.length);
  const worked = upTo.filter((d) => d.status === "Present" || d.status === "Remote" || d.status === "Half-day").length;
  const workdays = upTo.filter((d) => d.status !== "Holiday" && d.status !== "On leave").length;
  return (
    <>
      {!dense && <div className="text-[20px] font-medium leading-tight tracking-[-0.02em]">{status ? HEADLINE[status] ?? `Marked ${status.toLowerCase()} today` : "How are you working today?"}</div>}
      {c.editable ? (
        <div className="grid grid-cols-2 gap-2">
          {SELF.map((s) => (
            <button key={s} type="button" aria-pressed={status === s} disabled={busy !== null} onClick={() => mark(s)}
              className={cn("flex h-10 items-center justify-center gap-1.5 rounded-xl border text-[13px] font-medium transition-colors disabled:cursor-default",
                status === s ? "border-[var(--st-ink)] bg-[var(--st-ink)] text-[var(--st-surface)]" : "border-[var(--st-line)] hover:bg-[var(--st-page)]")}>
              {busy === s ? <Loader2 size={13} className="animate-spin" /> : null}{s}
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded-xl bg-[var(--st-page)] px-3 py-2.5 text-[13px] text-[var(--st-sub)]">{c.lockReason ?? "Today can't be marked."}</div>
      )}
      <div className="grid grid-cols-6 gap-1.5" aria-label="This week">
        {c.week.map((d) => {
          const m = d.status ? MARK[d.status] : null;
          return (
            <div key={d.date} title={d.status ?? "Not marked"} className={cn("flex flex-col items-center gap-0.5 rounded-[10px] py-1.5", d.isToday ? "bg-[var(--st-page)] ring-1 ring-[var(--st-line)]" : "")}>
              <span className="text-[11px] text-[var(--st-muted)]">{d.label}</span>
              <span className="text-[13px] font-semibold leading-none" style={{ color: m?.color ?? "var(--st-muted)" }}>{m?.sign ?? "·"}</span>
            </div>
          );
        })}
      </div>
      {!dense && <div className="min-h-1 flex-1" />}
      <div className="text-xs text-[var(--st-muted)]">{worked} of {workdays} {workdays === 1 ? "day" : "days"} so far this week · your manager can adjust a day</div>
    </>
  );
}

/** Top-right on a desk: Today. */
export function StaffCheckinCard({ c }: { c: StaffCheckin }) {
  return (
    <section data-tour="attendance-checkin" className="hidden min-h-0 min-w-0 flex-col gap-3 overflow-hidden rounded-[18px] bg-[var(--st-surface)] p-5 md:flex">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[15px] font-medium">Today</span>
        <span className="text-xs text-[var(--st-muted)]">{c.dateLabel}</span>
      </div>
      <CheckinBody c={c} />
    </section>
  );
}

/** On a phone: the same, as a fold — open until they have checked in. */
export function StaffCheckinFold({ c }: { c: StaffCheckin }) {
  const [open, setOpen] = useState(!c.status && c.editable);
  return (
    <Fold id="checkin" kicker={c.dateLabel} title="Today" sub={c.status ? HEADLINE[c.status] ?? c.status : c.editable ? "Not checked in yet" : c.lockReason ?? ""} open={open} onToggle={() => setOpen((o) => !o)}>
      <div className="flex flex-col gap-3"><CheckinBody c={c} dense /></div>
    </Fold>
  );
}

/* ── To-do list ─────────────────────────────────────────────────────────── */

const TZ = "Africa/Nairobi";
function whenLabel(iso: string): { text: string; late: boolean } {
  const d = new Date(iso);
  const now = new Date();
  const key = (x: Date) => x.toLocaleDateString("en-CA", { timeZone: TZ });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
  const tomorrow = new Date(now.getTime() + 86_400_000);
  const day = key(d) === key(now) ? "Today" : key(d) === key(tomorrow) ? "Tomorrow" : d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: TZ });
  return { text: `${day} ${time}`, late: d.getTime() < now.getTime() };
}

function TodoList({ items, setItems, scroll }: { items: TodoCardItem[]; setItems: React.Dispatch<React.SetStateAction<TodoCardItem[]>>; scroll?: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();
  const [remind, setRemind] = useState<string | null>(null);
  const inputId = `todo-add-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  // The footer's "+" (New to-do) lands here with ?todo=1: focus the field.
  useEffect(() => {
    if (params.get("todo") !== "1") return;
    const el = document.getElementById(inputId) as HTMLInputElement | null;
    if (el && el.offsetParent !== null) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.focus();
      window.history.replaceState(null, "", "/portal");
    }
  }, [params, inputId]);

  const fail = (msg?: string) => toast(msg ?? "That didn't save — try again.", { tone: "warn" });
  const withKeys = items.map((t) => ({ ...t, key: t.id }));
  return (
    <div className={cn("flex flex-col gap-2", scroll && "min-h-0 flex-1")}>
      <ListShell
        items={withKeys}
        tone="page"
        title={false}
        noun="to-do"
        scroll={scroll}
        inputId={inputId}
        placeholder={["Add a to-do — Enter adds it", "Add another to-do"]}
        empty={scroll ? "Nothing on your list. Type below — a time makes it a reminder." : undefined}
        meta={(t) => (t.remindAt && !t.done ? whenLabel(t.remindAt) : null)}
        addAccessory={
          <button type="button" onClick={(e) => { e.preventDefault(); setRemind((r) => (r === null ? "" : null)); }}
            aria-label={remind === null ? "Set a reminder time" : "No reminder"} title={remind === null ? "Set a reminder time" : "No reminder"}
            className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-[8px] transition-colors hover:bg-[var(--st-page)]", remind !== null ? "text-[var(--st-ink)]" : "text-[var(--st-muted)]")}>
            {remind === null ? <Bell size={14} /> : <BellOff size={14} />}
          </button>
        }
        onAdd={(title) => {
          const at = remind ? new Date(remind).toISOString() : null;
          const temp = -Date.now();
          setItems((l) => [...l, { id: temp, title, done: false, important: false, remindAt: at, dueAt: null, companyName: null, personName: null }]);
          setRemind(null);
          portalCreateTodo({ title, remindAt: at }).then((r) => {
            if (!r.ok || !r.todo) { setItems((l) => l.filter((x) => x.id !== temp)); fail(r.error); return; }
            setItems((l) => l.map((x) => (x.id === temp ? r.todo! : x)));
            router.refresh();
          }).catch(() => { setItems((l) => l.filter((x) => x.id !== temp)); fail(); });
        }}
        onTick={(t, done) => {
          setItems((l) => l.map((x) => (x.id === t.id ? { ...x, done } : x)));
          if (t.id > 0) portalToggleTodoDone(t.id, done).then((r) => { if (!r.ok) { setItems((l) => l.map((x) => (x.id === t.id ? { ...x, done: !done } : x))); fail(r.error); } });
        }}
        onRename={(t, title) => {
          setItems((l) => l.map((x) => (x.id === t.id ? { ...x, title } : x)));
          if (t.id > 0) portalUpdateTodo({ id: t.id, title }).then((r) => { if (!r.ok) fail(r.error); });
        }}
        onDelete={(t) => {
          const before = items;
          setItems((l) => l.filter((x) => x.id !== t.id));
          if (t.id > 0) portalDeleteTodo(t.id).then((r) => { if (!r.ok) { setItems(before); fail(r.error); } });
        }}
      />
      {remind !== null && (
        <label className="flex shrink-0 items-center gap-2 px-1 text-xs text-[var(--st-sub)]">
          Remind me at
          <input type="datetime-local" value={remind} onChange={(e) => setRemind(e.target.value)}
            className="h-8 rounded-[8px] border border-[var(--st-line)] bg-[var(--st-surface)] px-2 text-xs text-[var(--st-ink)]" />
        </label>
      )}
    </div>
  );
}

function useTodos(initial: TodoCardItem[]) {
  const [items, setItems] = useState(initial);
  // A fresh server list (after a refresh) replaces the local one.
  const sig = initial.map((t) => `${t.id}:${t.done ? 1 : 0}:${t.title}:${t.remindAt ?? ""}`).join("|");
  useEffect(() => setItems(initial), [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  return [items, setItems] as const;
}

/** Bottom-right on a desk: My to-do list. */
export function StaffTodoCard({ items: initial }: { items: TodoCardItem[] }) {
  const [items, setItems] = useTodos(initial);
  const open = items.filter((t) => !t.done).length;
  return (
    <section className="hidden min-h-0 min-w-0 flex-col gap-3 rounded-[18px] bg-[var(--st-surface)] p-5 md:flex md:min-h-[340px] lg:min-h-0">
      <div className="min-w-0">
        <div className="text-xs text-[var(--st-muted)]">To-do</div>
        <h2 className="m-0 mt-0.5 flex items-baseline gap-2 text-[20px] font-medium tracking-[-0.015em] sm:text-[22px]">
          My to-do list{open > 0 && <span className="text-[13px] font-normal text-[var(--st-muted)] tabular-nums">{open} open</span>}
        </h2>
        <div className="mt-0.5 truncate text-[13px] text-[var(--st-muted)]">Just for you · set a time and it reminds you</div>
      </div>
      <TodoList items={items} setItems={setItems} scroll />
    </section>
  );
}

export function StaffTodoFold({ items: initial }: { items: TodoCardItem[] }) {
  const [items, setItems] = useTodos(initial);
  const params = useSearchParams();
  const [open, setOpen] = useState(params.get("todo") === "1" || initial.some((t) => !t.done));
  useEffect(() => { if (params.get("todo") === "1") setOpen(true); }, [params]);
  const n = items.filter((t) => !t.done).length;
  return (
    <Fold id="todo" kicker="To-do" title="My to-do list" sub={n ? `${n} open` : "Nothing on it"} count={n} open={open} onToggle={() => setOpen((o) => !o)}>
      <TodoList items={items} setItems={setItems} />
    </Fold>
  );
}

/* ── The live notice's button ───────────────────────────────────────────── */

export function AnnouncementAck({ id, requireAck }: { id: number; requireAck: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" disabled={busy}
      onClick={async () => {
        setBusy(true);
        await (requireAck ? portalAcknowledgeAction(id) : portalMarkSeenAction(id)).catch(() => null);
        router.refresh();
      }}
      className="shrink-0 rounded-lg px-1.5 py-0.5 text-xs font-medium text-white underline underline-offset-2 hover:bg-white/10 disabled:opacity-60">
      {busy ? <Loader2 size={12} className="animate-spin" /> : requireAck ? "Acknowledge" : "Got it"}
    </button>
  );
}

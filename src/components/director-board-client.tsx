"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Bolt, CalendarPlus, MessageSquarePlus, ArrowUp, Sparkles, Wand2, CornerDownLeft,
  Building2, ChevronRight, Check, Loader2, Send, ExternalLink, ArrowRight, Orbit as OrbitIcon,
  Flame, Plane, Target, ShieldCheck, X,
} from "lucide-react";
import { Panel } from "@/components/surface-kit";
import { DirectorEventForm } from "@/components/director-event-form";
import { DirectorMessage } from "@/components/director-message";
import {
  portalDirectorCreateTask, portalDirectorEditTask, portalDirectorRemindTask,
} from "@/app/portal/actions";
import { useToast } from "@/components/toast";

/* ------------------------------------------------------------------ *
 * Director board — the command-centre client surface. Land, see, act.
 * Real data in (no mocks): the orbit score, KPIs, the AI suggestion and
 * the attention stack are all derived server-side from getBrief and
 * passed in. Mutations re-verify the director role server-side.
 * ------------------------------------------------------------------ */

export type BoardPerson = { id: number; name: string; companyId: number | null };
export type BoardCompany = { id: number; name: string };
export type WatchItem = {
  taskId: number;
  code: string;
  actionItem: string;
  companyName: string;
  overdue: boolean;
  priority: string;
  dueLabel: string | null;
  deadlineInput: string | null; // yyyy-mm-dd for the date input
  accountableId: number | null;
  accountableName: string | null;
};

type Props = {
  firstName: string;
  liveStamp: string;
  needsYou: number;
  dueToday: number;
  groupScore: number;
  onTrack: number;
  watchCount: number;
  riskCount: number;
  overdueCount: number;
  onLeaveToday: number;
  people: BoardPerson[];
  companies: BoardCompany[];
  watch: WatchItem[];
  suggestion: { code: string; actionItem: string; companyName: string } | null;
};

const STATUSES = ["Not Started", "In Progress", "Under Review", "Blocked", "Waiting External", "Escalated", "Completed", "Closed"];
const PRIORITIES = ["Critical", "High", "Medium", "Low"];

function prefersReduced(): boolean {
  if (typeof document === "undefined") return false;
  if (document.documentElement.dataset.motion === "reduced") return true;
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** Eased count-up for a number; respects reduced motion (jumps to the value). */
function useCountUp(target: number, run: boolean): number {
  const [n, setN] = useState(run ? target : 0);
  useEffect(() => {
    if (!run) { setN(target); return; }
    if (prefersReduced()) { setN(target); return; }
    let raf = 0;
    const t0 = performance.now();
    const dur = 1100;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / dur);
      setN(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, run]);
  return n;
}

export function DirectorBoardClient(p: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const capRef = useRef<HTMLInputElement>(null);

  function focusComposer() {
    capRef.current?.focus();
    capRef.current?.scrollIntoView({ behavior: prefersReduced() ? "auto" : "smooth", block: "center" });
  }

  return (
    <div className="flex flex-col gap-5">
      <BriefLine first={p.firstName} liveStamp={p.liveStamp} needsYou={p.needsYou} dueToday={p.dueToday} />
      <CommandBar people={p.people} companies={p.companies} suggestion={p.suggestion} capRef={capRef} />
      <OrbitVitals score={p.groupScore} onTrack={p.onTrack} watch={p.watchCount} risk={p.riskCount} run={mounted} />
      <KpiTiles overdue={p.overdueCount} onLeave={p.onLeaveToday} run={mounted} onFocus={focusComposer} />
      <AttentionStack watch={p.watch} people={p.people} />
      <button
        type="button"
        onClick={focusComposer}
        className="mx-auto mt-1 inline-flex items-center gap-1.5 rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-accent-fg shadow-lg shadow-accent/20 transition-transform active:scale-95 sm:hidden"
      >
        <Bolt size={15} /> Quick capture
      </button>
    </div>
  );
}

/* ---- the plain-language morning brief ---- */
function BriefLine({ first, liveStamp, needsYou, dueToday }: { first: string; liveStamp: string; needsYou: number; dueToday: number }) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-fg-subtle">Command centre</p>
        <h1 className="mt-0.5 text-2xl font-semibold tracking-tight">Morning, {first}</h1>
      </div>
      <div className="flex items-center gap-2.5 rounded-2xl bg-bg-elev px-3.5 py-2.5 text-sm text-fg-muted ring-1 ring-border">
        <span className="relative inline-flex h-2 w-2 shrink-0 items-center justify-center">
          <span className="absolute inset-0 rounded-full bg-success opacity-40 motion-safe:animate-ping" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
        </span>
        <p>
          Across <b className="font-medium text-fg">7 companies</b> ·{" "}
          <b className="font-medium text-fg">{needsYou}</b> need{needsYou === 1 ? "s" : ""} you ·{" "}
          <b className="font-medium text-fg">{dueToday}</b> due today
        </p>
        <span className="ml-auto hidden shrink-0 text-[11px] text-fg-subtle sm:block">{liveStamp}</span>
      </div>
    </div>
  );
}

/* ---- the command bar: Task (inline) · Event · Message ---- */
const MODES = [
  { key: "Task", icon: Bolt, label: "Task" },
  { key: "Event", icon: CalendarPlus, label: "Event" },
  { key: "Message", icon: MessageSquarePlus, label: "Message" },
] as const;
type Mode = (typeof MODES)[number]["key"];

const inputCls = "w-full rounded-xl bg-bg-subtle ring-1 ring-border px-3 py-2.5 text-sm placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-accent/40";

function CommandBar({
  people, companies, suggestion, capRef,
}: {
  people: BoardPerson[]; companies: BoardCompany[];
  suggestion: Props["suggestion"]; capRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [mode, setMode] = useState<Mode>("Task");
  const idx = MODES.findIndex((m) => m.key === mode);

  return (
    <div className="rounded-3xl bg-bg-elev p-2.5 ring-1 ring-border">
      <div className="relative grid grid-cols-3 gap-0 rounded-2xl bg-bg-subtle p-1">
        <span
          aria-hidden
          className="absolute inset-y-1 left-1 rounded-xl bg-bg-elev shadow-sm ring-1 ring-border transition-transform duration-300"
          style={{ width: "calc((100% - 0.5rem) / 3)", transform: `translateX(${idx * 100}%)` }}
        />
        {MODES.map((m) => {
          const Icon = m.icon;
          const active = m.key === mode;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => setMode(m.key)}
              className={`relative z-10 inline-flex items-center justify-center gap-1.5 rounded-xl py-2 text-[13px] transition-colors ${active ? "font-medium text-fg" : "text-fg-muted"}`}
            >
              <Icon size={15} /> {m.label}
            </button>
          );
        })}
      </div>

      <div className="mt-2.5">
        {mode === "Task" && <TaskComposer people={people} companies={companies} suggestion={suggestion} capRef={capRef} />}
        {mode === "Event" && (
          <div className="px-1 py-1">
            <DirectorEventForm people={people} companies={companies} />
          </div>
        )}
        {mode === "Message" && (
          <div className="flex flex-col gap-2 px-1 py-1">
            <DirectorMessage people={people} reminders={[]} />
          </div>
        )}
      </div>
    </div>
  );
}

function TaskComposer({
  people, companies, suggestion, capRef,
}: {
  people: BoardPerson[]; companies: BoardCompany[];
  suggestion: Props["suggestion"]; capRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [state, action, pending] = useActionState(portalDirectorCreateTask, null);
  const [companyId, setCompanyId] = useState("");
  const [open, setOpen] = useState(false); // show the detail chips row

  const scoped = companyId ? people.filter((pp) => String(pp.companyId) === companyId) : people;
  const peopleForPicker = scoped.length ? scoped : people;

  return (
    <form action={action} className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2 rounded-2xl bg-bg-subtle px-3 py-1.5 ring-1 ring-border focus-within:ring-2 focus-within:ring-accent/40">
        <Sparkles size={16} className="shrink-0 text-accent" />
        <input
          ref={capRef}
          name="actionItem"
          required
          placeholder="Assign a task in seconds…"
          onFocus={() => setOpen(true)}
          className="min-w-0 flex-1 bg-transparent py-1.5 text-sm placeholder:text-fg-muted focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending}
          aria-label="Assign task"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? <Loader2 size={16} className="animate-spin" /> : <ArrowUp size={18} />}
        </button>
      </div>

      <div className={`grid grid-cols-2 gap-2 ${open ? "" : "hidden"}`}>
        <select name="companyId" required value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={inputCls}>
          <option value="" disabled>Company…</option>
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select name="accountableId" required defaultValue="" className={inputCls}>
          <option value="" disabled>Responsible…</option>
          {peopleForPicker.map((pp) => <option key={pp.id} value={pp.id}>{pp.name}</option>)}
        </select>
        <select name="priority" defaultValue="Medium" className={inputCls}>
          {PRIORITIES.map((pr) => <option key={pr} value={pr}>{pr}</option>)}
        </select>
        <input name="deadline" type="date" className={inputCls} />
      </div>

      {state?.error && <p className="px-1 text-xs text-danger">{state.error}</p>}

      {suggestion && (
        <button
          type="button"
          onClick={() => {
            if (capRef.current) {
              capRef.current.value = suggestion.actionItem;
              capRef.current.focus();
              setOpen(true);
            }
          }}
          className="flex items-center gap-2 rounded-xl border border-dashed border-border bg-bg-subtle/60 px-3 py-2 text-left text-xs text-fg-muted transition-colors hover:bg-bg-subtle"
        >
          <Wand2 size={14} className="shrink-0 text-info" />
          <span className="min-w-0 flex-1 truncate">
            {suggestion.actionItem} <span className="text-fg-subtle">· {suggestion.companyName}</span>
          </span>
          <CornerDownLeft size={13} className="shrink-0 text-fg-subtle" />
        </button>
      )}
    </form>
  );
}

/* ---- portfolio health orbit ---- */
function OrbitVitals({ score, onTrack, watch, risk, run }: { score: number; onTrack: number; watch: number; risk: number; run: boolean }) {
  const shown = useCountUp(score, run);
  const C = 2 * Math.PI * 54; // r=54
  const tone = score >= 80 ? "hsl(var(--success))" : score >= 55 ? "hsl(var(--warn))" : "hsl(var(--danger))";
  const offset = run && !prefersReduced() ? C - (C * score) / 100 : C - (C * score) / 100;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.08em] text-fg-muted">
        <OrbitIcon size={13} /> Portfolio health
        <span className="ml-auto text-[11px] normal-case tracking-normal text-fg-subtle">{score}% group score</span>
      </div>
      <Panel className="flex items-center gap-4 p-4">
        <div className="relative h-[118px] w-[118px] shrink-0">
          <svg viewBox="0 0 132 132" className="h-full w-full -rotate-90">
            <circle cx="66" cy="66" r="54" fill="none" stroke="hsl(var(--border))" strokeWidth="9" />
            <circle
              cx="66" cy="66" r="54" fill="none" stroke={tone} strokeWidth="9" strokeLinecap="round"
              strokeDasharray={C} strokeDashoffset={offset}
              style={{ transition: prefersReduced() ? "none" : "stroke-dashoffset 1.2s cubic-bezier(.3,.8,.3,1)" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[30px] font-semibold leading-none tracking-tight tabular">{shown}</span>
            <span className="mt-1 text-[10px] text-fg-subtle">group score</span>
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-2.5">
          <Legend dot="bg-success" label={`${onTrack} on track`} />
          <Legend dot="bg-warn" label={`${watch} to watch`} />
          <Legend dot="bg-danger" label={`${risk} at risk`} />
          <Link href="/portal/board" className="mt-0.5 inline-flex w-fit items-center gap-1.5 rounded-lg bg-bg-subtle px-3 py-1.5 text-[11px] text-accent ring-1 ring-border transition-colors hover:bg-bg-muted">
            View all 7 <ArrowRight size={12} />
          </Link>
        </div>
      </Panel>
    </div>
  );
}
function Legend({ dot, label }: { dot: string; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-fg-muted">
      <span className={`h-2.5 w-2.5 rounded-full ${dot}`} /> {label}
    </div>
  );
}

/* ---- live KPI tiles ---- */
function KpiTiles({ overdue, onLeave, run, onFocus }: { overdue: number; onLeave: number; run: boolean; onFocus: () => void }) {
  const od = useCountUp(overdue, run);
  const ol = useCountUp(onLeave, run);
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <button type="button" onClick={onFocus} className="flex items-center gap-3 rounded-2xl bg-bg-elev p-3 text-left ring-1 ring-border transition-shadow hover:ring-danger/40">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-danger-soft/60 text-danger"><Flame size={18} /></span>
        <span>
          <span className="block text-xl font-semibold leading-none tabular text-danger">{od}</span>
          <span className="mt-1 block text-[11px] text-fg-muted">Overdue tasks</span>
        </span>
      </button>
      <div className="flex items-center gap-3 rounded-2xl bg-bg-elev p-3 ring-1 ring-border">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft/70 text-accent"><Plane size={18} /></span>
        <span>
          <span className="block text-xl font-semibold leading-none tabular">{ol}</span>
          <span className="mt-1 block text-[11px] text-fg-muted">On leave today</span>
        </span>
      </div>
    </div>
  );
}

/* ---- the attention stack: swipe to remind, tap to edit inline ---- */
function AttentionStack({ watch, people }: { watch: WatchItem[]; people: BoardPerson[] }) {
  if (watch.length === 0) {
    return (
      <div className="flex flex-col gap-2.5">
        <Label />
        <Panel className="flex items-center gap-3 p-5 text-sm text-fg-muted">
          <Check size={16} className="text-success" /> Nothing needs you right now. The portfolio is calm.
        </Panel>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2.5">
      <Label hint="swipe a card to remind · tap to edit" />
      <div className="flex flex-col gap-2.5">
        {watch.map((w) => <AttentionCard key={w.taskId} w={w} people={people} />)}
      </div>
    </div>
  );
}
function Label({ hint }: { hint?: string }) {
  return (
    <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.08em] text-fg-muted">
      <Target size={13} /> Needs you
      {hint && <span className="ml-auto text-[10px] normal-case tracking-normal text-fg-subtle">{hint}</span>}
    </div>
  );
}

function AttentionCard({ w, people }: { w: WatchItem; people: BoardPerson[] }) {
  const { toast } = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [swiped, setSwiped] = useState(false);
  const [busy, startTransition] = useTransition();
  const [link, setLink] = useState<string | null>(null);

  const [status, setStatus] = useState(""); // "" = leave unchanged
  const [priority, setPriority] = useState(w.priority);
  const [deadline, setDeadline] = useState(w.deadlineInput ?? "");
  const [owner, setOwner] = useState(w.accountableId ? String(w.accountableId) : "");

  const startX = useRef(0);
  function onTouchStart(e: React.TouchEvent) { startX.current = e.touches[0].clientX; }
  function onTouchMove(e: React.TouchEvent) {
    const dx = e.touches[0].clientX - startX.current;
    if (dx < -30) setSwiped(true);
    else if (dx > 30) setSwiped(false);
  }

  function remind() {
    startTransition(async () => {
      const res = await portalDirectorRemindTask(w.taskId);
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      setLink(res.link);
      toast(`Reminder for ${res.name.split(" ")[0]} saved to Outbox.`, { tone: "success" });
    });
  }

  function save() {
    startTransition(async () => {
      const res = await portalDirectorEditTask({
        taskId: w.taskId,
        status: status || undefined,
        priority: priority !== w.priority ? priority : undefined,
        deadline: deadline !== (w.deadlineInput ?? "") ? deadline : undefined,
        accountableId: owner && owner !== String(w.accountableId ?? "") ? Number(owner) : undefined,
      });
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      toast("Task updated.", { tone: "success" });
      setOpen(false);
      router.refresh();
    });
  }

  const pill = w.overdue
    ? { cls: "bg-danger-soft/60 text-danger", label: `Overdue${w.dueLabel ? ` · ${w.dueLabel}` : ""}` }
    : { cls: "bg-warn-soft/60 text-warn", label: w.dueLabel ?? w.priority };
  const stripe = w.overdue ? "bg-danger" : "bg-warn";

  return (
    <div className="relative overflow-hidden rounded-2xl">
      {/* swipe-revealed action */}
      <button
        type="button"
        onClick={remind}
        disabled={busy}
        className="absolute inset-y-0 right-0 flex w-[86px] flex-col items-center justify-center gap-1 bg-success-soft/70 text-xs font-medium text-success"
      >
        {busy ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />} Remind
      </button>

      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        className="relative rounded-2xl bg-bg-elev ring-1 ring-border transition-transform duration-300"
        style={{ transform: swiped ? "translateX(-86px)" : "translateX(0)" }}
      >
        <button type="button" onClick={() => { setOpen((o) => !o); setSwiped(false); }} className="flex w-full items-stretch gap-3 text-left">
          <span className={`w-1 shrink-0 rounded-l-2xl ${stripe}`} />
          <span className="min-w-0 flex-1 py-3">
            <span className="mb-1 flex items-center gap-2">
              <span className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${pill.cls}`}>{pill.label}</span>
              <span className="text-[11px] text-fg-subtle">{w.companyName}</span>
            </span>
            <span className="block truncate text-sm font-medium">{w.actionItem}</span>
            <span className="mt-0.5 block text-[11px] text-fg-subtle">{w.accountableName ?? "Unassigned"} · {w.code}</span>
          </span>
          <ChevronRight size={17} className={`mr-3 shrink-0 self-center text-fg-subtle transition-transform ${open ? "rotate-90" : ""}`} />
        </button>

        {open && (
          <div className="border-t border-border bg-bg-subtle/50 p-3">
            <div className="grid grid-cols-2 gap-2.5">
              <label className="flex flex-col gap-1 text-[11px] text-fg-muted">Status
                <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
                  <option value="">{w.priority ? "Unchanged" : "Set status"}</option>
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[11px] text-fg-muted">Priority
                <select value={priority} onChange={(e) => setPriority(e.target.value)} className={inputCls}>
                  {PRIORITIES.map((pr) => <option key={pr} value={pr}>{pr}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[11px] text-fg-muted">Due
                <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={inputCls} />
              </label>
              <label className="flex flex-col gap-1 text-[11px] text-fg-muted">Owner
                <select value={owner} onChange={(e) => setOwner(e.target.value)} className={inputCls}>
                  <option value="">Unchanged</option>
                  {people.map((pp) => <option key={pp.id} value={pp.id}>{pp.name}</option>)}
                </select>
              </label>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button type="button" onClick={save} disabled={busy} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-accent py-2.5 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-50">
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={15} />} Save changes
              </button>
              <button type="button" onClick={remind} disabled={busy} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-success-soft/60 px-3 py-2.5 text-sm font-medium text-success ring-1 ring-success/25">
                <Send size={14} /> Remind
              </button>
            </div>
            {link && (
              <a href={link} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-xs text-accent hover:underline">
                <ExternalLink size={13} /> Send the reminder now
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

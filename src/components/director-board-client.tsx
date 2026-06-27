"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronRight, Check, Loader2, Send, ExternalLink,
  Flame, Plane, Target, CalendarClock, Building2, ShieldCheck, Inbox, Video,
} from "lucide-react";
import { Panel, SectionLabel, TONE, type Tone } from "@/components/surface-kit";
import { getGivenName } from "@/lib/names";
import { FluidSelect, type FluidOption } from "@/components/fluid-select";
import { PeoplePicker } from "@/components/people-picker";
import { SmartCaptureBar } from "@/components/smart-capture-bar";
import { portalEditTask, portalRemindTask, portalSetTaskLeads } from "@/app/portal/actions";
import { useSwipeRow } from "@/lib/use-swipe-row";
import { useToast } from "@/components/toast";

/* ------------------------------------------------------------------ *
 * Director board — the command-centre client surface. Land, see, act.
 * Real data in (no mocks): the health ring, KPIs, company-health rows,
 * the AI suggestion and the attention stack are all derived server-side
 * from getBrief and passed in. Mutations re-verify role + task scope
 * server-side. Fluid on mobile (single calm scroll) and on the web
 * (a centred two-column command-wall).
 * ------------------------------------------------------------------ */

export type BoardPerson = { id: number; name: string; companyId: number | null; companyIds?: number[] };
export type BoardCompany = { id: number; name: string };
export type BoardEvent = { id: number; title: string; startAt: string; allDay: boolean; companyName: string | null; meetLink: string | null; location: string | null };
export type CompanyHealth = { id: number; name: string; risk: string; score: number | null; detail: string };
export type PendingRequest = { id: number; code: string; title: string; from: string; category: string | null; ageDays: number };
export type WatchItem = {
  taskId: number;
  code: string;
  actionItem: string;
  companyId: number;
  companyName: string;
  overdue: boolean;
  priority: string;
  dueLabel: string | null;
  deadlineInput: string | null;
  accountableId: number | null;
  accountableName: string | null;
  statusLabel?: string;
  note?: string | null;
};

type Props = {
  firstName: string;
  initials: string;
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
  companyHealth: CompanyHealth[];
  watch: WatchItem[];
  pendingRequests: PendingRequest[];
  upcomingEvents: BoardEvent[];
  suggestions: { code: string; actionItem: string; companyName: string }[];
};

const STATUSES = ["Not Started", "In Progress", "Under Review", "Blocked", "Waiting External", "Escalated", "Completed", "Closed"];
const PRIORITIES = ["Critical", "High", "Medium", "Low"];
const PRIORITY_DOT: Record<string, string> = { Critical: "hsl(var(--danger))", High: "hsl(var(--warn))", Medium: "hsl(var(--accent))", Low: "hsl(var(--fg-subtle))" };
const priorityOptions: FluidOption[] = PRIORITIES.map((p) => ({ value: p, label: p, dot: PRIORITY_DOT[p] }));

function riskTone(r: string): Tone {
  if (/on track|healthy|good/i.test(r)) return "success";
  if (/risk|high/i.test(r)) return "danger";
  return "warn";
}
function riskShort(r: string): string {
  const t = riskTone(r);
  return t === "success" ? "On track" : t === "danger" ? "Risk" : "Watch";
}

function prefersReduced(): boolean {
  if (typeof document === "undefined") return false;
  if (document.documentElement.dataset.motion === "reduced") return true;
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

function useCountUp(target: number, run: boolean): number {
  const [n, setN] = useState(run ? target : 0);
  useEffect(() => {
    if (!run || prefersReduced()) { setN(target); return; }
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

  // Company filter: "all" (portfolio) or a single company id (as string).
  const [companyFilter, setCompanyFilter] = useState<string>("all");
  const selectedCompany = companyFilter === "all" ? null : Number(companyFilter);
  const selectedName = selectedCompany != null ? p.companies.find((c) => c.id === selectedCompany)?.name ?? null : null;
  const companyOptions: FluidOption[] = [
    { value: "all", label: "All companies" },
    ...p.companies.map((c) => ({ value: String(c.id), label: c.name })),
  ];

  const watch = selectedCompany != null ? p.watch.filter((w) => w.companyId === selectedCompany) : p.watch;
  const companyHealth = selectedCompany != null ? p.companyHealth.filter((c) => c.id === selectedCompany) : p.companyHealth;
  const events = selectedName != null ? p.upcomingEvents.filter((e) => e.companyName === selectedName) : p.upcomingEvents;

  return (
    <div className="flex flex-col gap-5">
      <BoardHero first={p.firstName} initials={p.initials} liveStamp={p.liveStamp} needsYou={p.needsYou} dueToday={p.dueToday} />
      <SmartCaptureBar people={p.people} companies={p.companies} suggestions={p.suggestions} />

      {/* Company filter — narrow the whole board to one company, or see them all. */}
      <div className="flex items-center gap-2">
        <Building2 size={14} className="shrink-0 text-fg-subtle" />
        <FluidSelect
          value={companyFilter}
          options={companyOptions}
          onSelect={setCompanyFilter}
          buttonClassName="bare-field inline-flex items-center justify-between gap-2 rounded-full ring-1 ring-border px-3.5 py-1.5 text-sm min-w-[10rem]"
        />
        {selectedCompany != null && (
          <span className="text-[11px] text-fg-subtle">Showing {selectedName}</span>
        )}
      </div>

      {/* Centred command-wall: one calm scroll on mobile, two columns on the web. */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.55fr_1fr] lg:items-start">
        <div className="flex flex-col gap-5">
          <VitalsPanel
            score={p.groupScore} onTrack={p.onTrack} watch={p.watchCount} risk={p.riskCount}
            needsYou={p.needsYou} dueToday={p.dueToday} onLeave={p.onLeaveToday} run={mounted}
          />
          <CompanyHealthList items={companyHealth} />
        </div>
        <div className="flex flex-col gap-5">
          <WaitingOnYou requests={p.pendingRequests} />
          <AttentionStack watch={watch.slice(0, 12)} people={p.people} />
          <WeekAhead events={events} />
        </div>
      </div>
    </div>
  );
}

/* ---- aurora-washed greeting hero ---- */
function BoardHero({ first, initials, liveStamp, needsYou, dueToday }: { first: string; initials: string; liveStamp: string; needsYou: number; dueToday: number }) {
  const [greeting, setGreeting] = useState("Welcome back");
  useEffect(() => {
    const h = new Date().getHours();
    setGreeting(h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening");
  }, []);

  return (
    <section className="relative w-full overflow-hidden rounded-3xl glass elevated p-5 sm:p-6">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="aurora-a absolute -right-20 -top-24 h-72 w-72 rounded-full blur-3xl" style={{ background: "radial-gradient(circle, hsl(var(--accent) / 0.30), transparent 70%)" }} />
        <div className="aurora-b absolute -bottom-28 -left-20 h-64 w-64 rounded-full blur-3xl" style={{ background: "radial-gradient(circle, hsl(var(--success) / 0.16), transparent 72%)" }} />
      </div>
      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-fg-subtle">
            Director board
            <span className="relative inline-flex h-1.5 w-1.5 items-center justify-center">
              <span className="absolute inset-0 rounded-full bg-success opacity-50 motion-safe:animate-ping" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
            </span>
            <span className="normal-case tracking-normal text-success/90">live</span>
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{greeting}, {getGivenName(first)}</h1>
          <p className="mt-1.5 text-sm text-fg-muted">{liveStamp} · across 7 companies</p>
        </div>
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent-soft text-sm font-semibold text-accent ring-1 ring-accent/25">{initials}</span>
      </div>
      <div className="relative mt-4 flex items-center gap-2 rounded-2xl bg-bg-elev/55 px-3.5 py-2.5 text-sm text-fg-muted ring-1 ring-border">
        <Target size={14} className="shrink-0 text-accent" />
        <p>
          <b className="font-semibold text-fg">{needsYou}</b> need{needsYou === 1 ? "s" : ""} you ·{" "}
          <b className="font-semibold text-fg">{dueToday}</b> due today
        </p>
      </div>
    </section>
  );
}

/* A clean field shell shared by the inline editors (no heavy grey fill). */
const fieldShell = "rounded-xl bg-bg-elev ring-1 ring-border";
const dateCls = "w-full rounded-xl bg-bg-elev ring-1 ring-border px-3 py-2.5 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-accent/40";

/* ---- portfolio vitals: health ring + risk pills + KPI tiles ---- */
function Ring({ score, run }: { score: number; run: boolean }) {
  const shown = useCountUp(score, run);
  const C = 2 * Math.PI * 54;
  const tone = score >= 80 ? "hsl(var(--success))" : score >= 55 ? "hsl(var(--warn))" : "hsl(var(--danger))";
  const offset = C - (C * score) / 100;
  return (
    <div className="relative h-[104px] w-[104px] shrink-0">
      <svg viewBox="0 0 132 132" className="h-full w-full -rotate-90">
        <circle cx="66" cy="66" r="54" fill="none" stroke="hsl(var(--border))" strokeWidth="9" />
        <circle
          cx="66" cy="66" r="54" fill="none" stroke={tone} strokeWidth="9" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={offset}
          style={{ transition: prefersReduced() ? "none" : "stroke-dashoffset 1.2s cubic-bezier(.3,.8,.3,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[27px] font-semibold leading-none tracking-tight tabular">{shown}</span>
        <span className="mt-0.5 text-[9px] uppercase tracking-[0.08em] text-fg-subtle">health</span>
      </div>
    </div>
  );
}

function VitalsPanel({
  score, onTrack, watch, risk, needsYou, dueToday, onLeave, run,
}: {
  score: number; onTrack: number; watch: number; risk: number;
  needsYou: number; dueToday: number; onLeave: number; run: boolean;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <SectionLabel icon={<ShieldCheck size={13} />}>
        Portfolio health
      </SectionLabel>
      <Panel className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex items-center gap-4 sm:gap-6">
          <Ring score={score} run={run} />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-fg-muted">Group compliance &amp; risk</p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <RiskPill tone="success" label={`${onTrack} on track`} />
              <RiskPill tone="warn" label={`${watch} watch`} />
              <RiskPill tone="danger" label={`${risk} at risk`} />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          <KpiTile href="/portal/tasks?filter=overdue" tone="danger" icon={<Target size={16} />} value={needsYou} label="Need you" run={run} />
          <KpiTile href="/portal/tasks?filter=soon" tone="warn" icon={<Flame size={16} />} value={dueToday} label="Due today" run={run} />
          <KpiTile href="/portal/team" tone="accent" icon={<Plane size={16} />} value={onLeave} label="On leave" run={run} />
        </div>
      </Panel>
    </div>
  );
}

function RiskPill({ tone, label }: { tone: Tone; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${TONE[tone].bg} ${TONE[tone].text} ring-1 ${TONE[tone].ring}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${TONE[tone].bar}`} />
      {label}
    </span>
  );
}

function KpiTile({ href, tone, icon, value, label, run }: { href: string; tone: Tone; icon: React.ReactNode; value: number; label: string; run: boolean }) {
  const n = useCountUp(value, run);
  return (
    <Link
      href={href}
      className={`flex flex-col gap-1.5 rounded-2xl p-3 ring-1 transition-all active:scale-[0.97] ${TONE[tone].bg} ${TONE[tone].ring} hover:ring-2`}
    >
      <span className={`inline-flex h-7 w-7 items-center justify-center rounded-xl bg-bg-elev/60 ${TONE[tone].text}`}>{icon}</span>
      <span className={`text-2xl font-semibold leading-none tabular ${TONE[tone].text}`}>{n}</span>
      <span className="text-[11px] text-fg-muted">{label}</span>
    </Link>
  );
}

/* ---- per-company health rows ---- */
function CompanyHealthList({ items }: { items: CompanyHealth[] }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-col gap-2.5">
      <SectionLabel icon={<Building2 size={13} />}>
        Company health
      </SectionLabel>
      <div className="flex flex-col gap-2">
        {items.map((c) => <CompanyRow key={c.id} c={c} />)}
      </div>
    </div>
  );
}

function CompanyRow({ c }: { c: CompanyHealth }) {
  const tone = riskTone(c.risk);
  const scoreTint = c.score == null ? "text-fg" : c.score >= 80 ? "text-success" : c.score >= 55 ? "text-warn" : "text-danger";
  return (
    <Link
      href={`/portal/companies/${c.id}`}
      className="group flex items-center gap-3 rounded-2xl bg-bg-elev p-3 ring-1 ring-border transition-all hover:ring-2 hover:ring-accent/30 active:scale-[0.99]"
    >
      <span className={`h-9 w-1 shrink-0 rounded-full ${TONE[tone].bar}`} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{c.name}</p>
        <p className="truncate text-[11px] text-fg-subtle">{c.detail}</p>
      </div>
      <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${TONE[tone].bg} ${TONE[tone].text}`}>{riskShort(c.risk)}</span>
      {c.score != null && <span className={`w-10 shrink-0 text-right text-[15px] font-semibold tabular ${scoreTint}`}>{c.score}%</span>}
      <ChevronRight size={16} className="shrink-0 text-fg-subtle transition-colors group-hover:text-accent" />
    </Link>
  );
}

/* ---- approvals inbox: requests addressed to the director, awaiting action ---- */
function WaitingOnYou({ requests }: { requests: PendingRequest[] }) {
  if (!requests.length) return null;
  return (
    <div className="flex flex-col gap-2.5">
      <SectionLabel
        icon={<Inbox size={13} />}
        action={<Link href="/portal/requests" className="inline-flex items-center gap-0.5 text-[11px] normal-case tracking-normal text-accent hover:underline">All requests <ChevronRight size={12} /></Link>}
      >
        Waiting on you
      </SectionLabel>
      <div className="flex flex-col gap-2">
        {requests.map((r) => (
          <Link
            key={r.id}
            href={`/portal/requests/${r.id}`}
            className="group flex items-center gap-3 rounded-2xl bg-bg-elev p-3 ring-1 ring-border transition-all hover:ring-2 hover:ring-accent/30 active:scale-[0.99]"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-soft/60 text-accent ring-1 ring-accent/20"><Inbox size={15} /></span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{r.title}</p>
              <p className="truncate text-[11px] text-fg-subtle">
                {r.from}{r.category ? ` · ${r.category}` : ""} · {r.ageDays === 0 ? "today" : `${r.ageDays}d ago`}
              </p>
            </div>
            <ChevronRight size={16} className="shrink-0 text-fg-subtle transition-colors group-hover:text-accent" />
          </Link>
        ))}
      </div>
    </div>
  );
}

/* ---- week ahead ---- */
function WeekAhead({ events }: { events: BoardEvent[] }) {
  return (
    <div className="flex flex-col gap-2.5">
      <SectionLabel icon={<CalendarClock size={13} />}>Week ahead</SectionLabel>
      {events.length === 0 ? (
        <Panel className="p-4 text-xs text-fg-muted">No meetings in the next 7 days. Anything scheduled — here or from the command centre — appears here with a Join link.</Panel>
      ) : (
      <Panel className="divide-y divide-border/60 overflow-hidden">
        {events.slice(0, 5).map((e) => {
          const d = new Date(e.startAt);
          const valid = !Number.isNaN(d.getTime());
          const join = e.meetLink || (e.location && /^https?:\/\//i.test(e.location) ? e.location : null);
          return (
            <div key={e.id} className="flex items-center gap-3 p-3">
              <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-accent-soft/60 text-accent">
                <span className="text-[9px] font-medium uppercase leading-none">{valid ? d.toLocaleDateString("en-GB", { month: "short" }) : "—"}</span>
                <span className="text-base font-semibold leading-none tabular">{valid ? d.getDate() : ""}</span>
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{e.title}</p>
                <p className="truncate text-[11px] text-fg-subtle">{fmtEvent(e)}{e.companyName ? ` · ${e.companyName}` : ""}</p>
              </div>
              {join && (
                <a
                  href={join}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-[12px] font-medium text-accent-fg transition-[opacity,transform] hover:opacity-90 active:scale-95"
                >
                  <Video size={13} /> Join
                </a>
              )}
            </div>
          );
        })}
      </Panel>
      )}
    </div>
  );
}
function fmtEvent(e: BoardEvent): string {
  const d = new Date(e.startAt);
  if (Number.isNaN(d.getTime())) return "";
  return e.allDay
    ? "All day"
    : d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
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
      <Label hint />
      <div className="flex flex-col gap-2.5">
        {watch.map((w) => <AttentionCard key={w.taskId} w={w} people={people} />)}
      </div>
    </div>
  );
}
function Label({ hint }: { hint?: boolean }) {
  return (
    <SectionLabel
      icon={<Target size={13} />}
      action={hint ? (
        <span className="text-[10px] normal-case tracking-normal text-fg-subtle">
          {/* "swipe" only makes sense on touch; the web reveals the editor on tap. */}
          <span className="[@media(hover:none)]:inline hidden">swipe to remind · </span>tap to edit
        </span>
      ) : undefined}
    >
      Needs you
    </SectionLabel>
  );
}

export function AttentionCard({ w, people }: { w: WatchItem; people: BoardPerson[] }) {
  const { toast } = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, startTransition] = useTransition();
  const [link, setLink] = useState<string | null>(null);

  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState(w.priority);
  const [deadline, setDeadline] = useState(w.deadlineInput ?? "");

  // Responsible (lead) — one OR more people who own the task. Seeded from the
  // current single lead; routed through portalSetTaskLeads (which promotes them
  // to accountable, demotes the old lead to working, sets owner_id := first).
  const initialLeads = w.accountableId ? [w.accountableId] : [];
  const [leadIds, setLeadIds] = useState<number[]>(initialLeads);
  const leadsChanged =
    leadIds.length !== initialLeads.length || leadIds.some((id) => !initialLeads.includes(id));

  // Candidates scoped to this card's company; fall back to everyone if none fit.
  const companyPeople = people.filter(
    (pp) => pp.companyId === w.companyId || pp.companyIds?.includes(w.companyId),
  );
  const leadCandidates = (companyPeople.length ? companyPeople : people).map((pp) => ({ id: pp.id, name: pp.name }));

  // Swipe-left reveals the Remind tray (86px on the right). Axis-locked so a
  // vertical scroll never opens it.
  const swipe = useSwipeRow({ rightWidth: 86 });

  function remind() {
    startTransition(async () => {
      const res = await portalRemindTask(w.taskId);
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      setLink(res.link);
      toast(`Reminder for ${res.name.split(" ")[0]} saved to Outbox.`, { tone: "success" });
    });
  }

  function save() {
    if (leadsChanged && leadIds.length === 0) return; // at least one lead must remain
    const fieldsChanged =
      !!status ||
      priority !== w.priority ||
      deadline !== (w.deadlineInput ?? "");
    startTransition(async () => {
      if (fieldsChanged) {
        const res = await portalEditTask({
          taskId: w.taskId,
          status: status || undefined,
          priority: priority !== w.priority ? priority : undefined,
          deadline: deadline !== (w.deadlineInput ?? "") ? deadline : undefined,
        });
        if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      }
      if (leadsChanged) {
        const res = await portalSetTaskLeads(w.taskId, leadIds);
        if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      }
      toast("Task updated.", { tone: "success" });
      setOpen(false);
      router.refresh();
    });
  }

  const statusOptions: FluidOption[] = [{ value: "", label: "Unchanged" }, ...STATUSES.map((s) => ({ value: s, label: s }))];

  const pill = w.overdue
    ? { cls: "bg-danger-soft/60 text-danger", label: `Overdue${w.dueLabel ? ` · ${w.dueLabel}` : ""}` }
    : { cls: "bg-warn-soft/60 text-warn", label: w.dueLabel ?? w.priority };
  const stripe = w.overdue ? "bg-danger" : "bg-warn";

  return (
    <div className="relative overflow-hidden rounded-2xl">
      <button
        type="button"
        onClick={remind}
        disabled={busy}
        className="absolute inset-y-0 right-0 flex w-[86px] flex-col items-center justify-center gap-1 bg-success-soft/70 text-xs font-medium text-success"
      >
        {busy ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />} Remind
      </button>

      <div
        {...swipe.bind}
        className="relative touch-pan-y rounded-2xl bg-bg-elev ring-1 ring-border transition-transform duration-300"
        style={{ transform: `translateX(${swipe.offset}px)`, transition: swipe.dragging ? "none" : undefined }}
      >
        <button type="button" onClick={() => { if (swipe.swiped) { swipe.reset(); return; } setOpen((o) => !o); }} className="flex w-full items-stretch gap-3 text-left">
          <span className={`w-1 shrink-0 rounded-l-2xl ${stripe}`} />
          <span className="min-w-0 flex-1 py-3">
            <span className="mb-1 flex flex-wrap items-center gap-1.5">
              <span className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${pill.cls}`}>{pill.label}</span>
              {w.statusLabel && <span className="rounded-md bg-bg-subtle px-2 py-0.5 text-[10px] font-medium text-fg-muted">{w.statusLabel}</span>}
              <span className="text-[11px] text-fg-subtle">{w.companyName}</span>
            </span>
            <span className="block truncate text-sm font-medium">{w.actionItem}</span>
            <span className="mt-0.5 block text-[11px] text-fg-subtle">{w.accountableName ?? "Unassigned"} · {w.code}</span>
            {w.note && <span className="mt-1 block truncate text-[11px] text-fg-muted">{w.note}</span>}
          </span>
          <ChevronRight size={17} className={`mr-3 shrink-0 self-center text-fg-subtle transition-transform ${open ? "rotate-90" : ""}`} />
        </button>

        {open && (
          <div className="border-t border-border bg-bg-subtle/40 p-3">
            <div className="grid grid-cols-2 gap-2.5">
              <label className="flex flex-col gap-1 text-[11px] text-fg-muted">Status
                <FluidSelect value={status} options={statusOptions} onSelect={setStatus} buttonClassName={fieldShell} />
              </label>
              <label className="flex flex-col gap-1 text-[11px] text-fg-muted">Priority
                <FluidSelect value={priority} options={priorityOptions} onSelect={setPriority} buttonClassName={fieldShell} />
              </label>
              <label className="col-span-2 flex flex-col gap-1 text-[11px] text-fg-muted">Due
                <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={dateCls} />
              </label>
            </div>
            {/* Responsible (lead) — one or more people. Promotes to accountable,
                demotes the old lead to working; notifies anyone newly added. */}
            <div className="mt-2.5 flex flex-col gap-1 text-[11px] text-fg-muted">
              Responsible (lead)
              <PeoplePicker
                people={leadCandidates}
                value={leadIds}
                onChange={setLeadIds}
                placeholder="Search people…"
                emptyLabel="Choose who leads this"
              />
              {leadsChanged && leadIds.length === 0 && (
                <span className="text-[11px] text-danger">Choose at least one person.</span>
              )}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button type="button" onClick={save} disabled={busy || (leadsChanged && leadIds.length === 0)} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-accent py-2.5 text-sm font-medium text-accent-fg transition-transform hover:opacity-90 active:scale-[0.98] disabled:opacity-50">
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={15} />} Save changes
              </button>
              <button type="button" onClick={remind} disabled={busy} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-success-soft/60 px-3 py-2.5 text-sm font-medium text-success ring-1 ring-success/25 transition-transform active:scale-95">
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

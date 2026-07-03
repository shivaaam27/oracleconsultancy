"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronRight, Check, Loader2, Send, ExternalLink,
  Target, CalendarClock, ShieldCheck, Video,
} from "lucide-react";
import { Panel, SectionLabel, TONE, type Tone } from "@/components/surface-kit";
import { getGivenName } from "@/lib/names";
import { CompanyAvatar } from "@/components/company-avatar";
import { SmartCaptureBar } from "@/components/smart-capture-bar";
import { portalRemindTask } from "@/app/portal/actions";
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
export type CompanyHealth = { id: number; name: string; risk: string; open: number; inProgress: number; overdue: number; logoUrl: string | null };
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
  upcomingEvents: BoardEvent[];
  suggestions: { code: string; actionItem: string; companyName: string }[];
  /** Eyebrow label above the greeting ("Director board" / "Manager board"). */
  boardLabel?: string;
  /** Capture modes the composer offers — managers get Task-only. */
  composerModes?: ("Task" | "Event" | "Message")[];
};

function riskTone(r: string): Tone {
  if (/on track|healthy|good/i.test(r)) return "success";
  if (/risk|high/i.test(r)) return "danger";
  return "warn";
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

  return (
    <div className="flex flex-col gap-5">
      <BoardHero first={p.firstName} initials={p.initials} liveStamp={p.liveStamp} needsYou={p.needsYou} dueToday={p.dueToday} companyCount={p.companies.length} label={p.boardLabel ?? "Director board"} />
      <SmartCaptureBar people={p.people} companies={p.companies} modes={p.composerModes} />

      {/* Outbox — your team's open work, per person (chase / remind). Contacts live
          on the Directory tab; the standalone Team page was folded into these. */}
      <Link
        href="/portal/outbox"
        className="group flex items-center gap-2.5 rounded-2xl bg-bg-elev px-3.5 py-2.5 text-sm ring-1 ring-border transition-all hover:ring-2 hover:ring-accent/30 active:scale-[0.99]"
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-accent-soft/60 text-accent ring-1 ring-accent/20"><Send size={15} /></span>
        <span className="min-w-0 flex-1 font-medium">Outbox</span>
        <span className="hidden text-[11px] text-fg-subtle sm:inline">Open work, per person</span>
        <ChevronRight size={16} className="shrink-0 text-fg-subtle transition-colors group-hover:text-accent" />
      </Link>

      {/* Next meeting sits up top, right under Outbox — full width. */}
      <WeekAhead events={p.upcomingEvents} />

      {/* Then the two working columns: what needs you (the swipe/tap task cards)
          on the left, and the merged portfolio + company health on the right. One
          calm scroll on mobile, two columns on the web. */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.55fr_1fr] lg:items-start">
        <div className="flex flex-col gap-5">
          <AttentionStack watch={p.watch.slice(0, 12)} />
        </div>
        <div className="flex flex-col gap-5">
          <HealthPanel score={p.groupScore} riskCount={p.riskCount} onLeave={p.onLeaveToday} items={p.companyHealth} run={mounted} />
        </div>
      </div>
    </div>
  );
}

/* ---- aurora-washed greeting hero ---- */
function BoardHero({ first, initials, liveStamp, needsYou, dueToday, companyCount, label }: { first: string; initials: string; liveStamp: string; needsYou: number; dueToday: number; companyCount: number; label: string }) {
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
            {label}
            <span className="relative inline-flex h-1.5 w-1.5 items-center justify-center">
              <span className="absolute inset-0 rounded-full bg-success opacity-50 motion-safe:animate-ping" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
            </span>
            <span className="normal-case tracking-normal text-success/90">live</span>
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{greeting}, {getGivenName(first)}</h1>
          <p className="mt-1.5 text-sm text-fg-muted">{liveStamp} · across {companyCount} {companyCount === 1 ? "company" : "companies"}</p>
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

/* ---- merged portfolio + company health (heat tiles) ----
   The portfolio score + at-risk count sit in the section header; each company is
   a colour-tinted tile (green calm · amber watch · red needs you), worst-first,
   with the overdue count large. Tapping a tile opens that company. */
function HealthPanel({
  score, riskCount, onLeave, items, run,
}: {
  score: number; riskCount: number; onLeave: number; items: CompanyHealth[]; run: boolean;
}) {
  const shown = useCountUp(score, run);
  return (
    <div className="flex flex-col gap-2.5">
      <SectionLabel
        icon={<ShieldCheck size={13} />}
        action={
          <span className="text-[11px] normal-case tracking-normal text-fg-muted">
            <b className="font-semibold text-fg tabular">{shown}</b> healthy
            {riskCount > 0 && <> · <span className="font-medium text-danger">{riskCount} at risk</span></>}
            {onLeave > 0 && <> · <span className="text-fg-subtle">{onLeave} on leave</span></>}
          </span>
        }
      >
        Company health
      </SectionLabel>
      {items.length === 0 ? (
        <Panel className="p-4 text-xs text-fg-muted">No companies in view.</Panel>
      ) : (
        // Housed + scrolls within (like the Needs-you list) so a director with
        // many companies doesn't stretch the board — both columns cap at the same
        // height, sit in a soft panel, and fade at the edges as they scroll.
        <div className="rounded-3xl bg-bg-subtle/40 p-1.5 ring-1 ring-border/70">
          <div className="slim-scroll scroll-fade-y grid max-h-[42rem] grid-cols-2 gap-2 overflow-y-auto overscroll-contain px-1.5 py-1.5">
            {items.map((c) => <HealthTile key={c.id} c={c} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function HealthTile({ c }: { c: CompanyHealth }) {
  const tone = riskTone(c.risk);
  const attention = c.overdue > 0;
  return (
    <Link
      href={`/portal/companies/${c.id}`}
      className={`group relative flex flex-col rounded-2xl p-3 ring-1 transition-all hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99] ${TONE[tone].bg} ${TONE[tone].ring}`}
    >
      <div className="flex items-start justify-between gap-2">
        <CompanyAvatar name={c.name} logoUrl={c.logoUrl} size={28} rounded="rounded-lg" iconSize={13} />
        {attention ? (
          <span className={`text-lg font-bold leading-none tabular ${TONE[tone].text}`}>{c.overdue}</span>
        ) : (
          <Check size={16} className="text-success" strokeWidth={2.5} />
        )}
      </div>
      <p className="mt-2 truncate text-[12.5px] font-semibold">{c.name}</p>
      <p className={`mt-0.5 truncate text-[10.5px] ${attention ? TONE[tone].text : "text-fg-subtle"}`}>
        {attention ? `${c.overdue} overdue · ${c.open} open` : `${c.open} open · on track`}
      </p>
    </Link>
  );
}

/* ---- week ahead ---- */
function WeekAhead({ events }: { events: BoardEvent[] }) {
  return (
    <div className="flex flex-col gap-2.5">
      <SectionLabel
        icon={<CalendarClock size={13} />}
        action={<Link href="/portal/meetings" className="text-[11px] text-accent hover:underline">View all</Link>}
      >
        Next meeting
      </SectionLabel>
      {events.length === 0 ? (
        <Panel className="p-4 text-xs text-fg-muted">Nothing in the next 2 days. Tap View all to see everything coming up — or schedule a meeting.</Panel>
      ) : (
      <Panel className="divide-y divide-border/60 overflow-hidden">
        {events.slice(0, 1).map((e) => {
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

/* ---- the attention stack: tap to open, swipe to remind ---- */
function AttentionStack({ watch }: { watch: WatchItem[] }) {
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
      {/* Housed in a soft panel so the cards read as a contained list (not loose
          floating tiles), with a fade at the top/bottom edges as it scrolls. The
          inner px padding keeps the cards' ring/shadow off the clip edge. */}
      <div className="rounded-3xl bg-bg-subtle/40 p-1.5 ring-1 ring-border/70">
        <div className="slim-scroll scroll-fade-y max-h-[42rem] space-y-2 overflow-y-auto overscroll-contain px-1.5 py-1.5">
          {watch.map((w) => <AttentionCard key={w.taskId} w={w} />)}
        </div>
      </div>
    </div>
  );
}
function Label({ hint }: { hint?: boolean }) {
  return (
    <SectionLabel
      icon={<Target size={13} />}
      action={hint ? (
        <span className="text-[10px] normal-case tracking-normal text-fg-subtle">tap any task to open it</span>
      ) : undefined}
    >
      Needs you
    </SectionLabel>
  );
}

/** Status → dot colour for the small status pill. */
function statusDot(s: string): string {
  if (/blocked|waiting|escalat/i.test(s)) return "bg-danger";
  if (/progress|review/i.test(s)) return "bg-accent";
  if (/complete|closed/i.test(s)) return "bg-success";
  return "bg-fg-subtle";
}

export function AttentionCard({ w }: { w: WatchItem }) {
  const { toast } = useToast();
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [link, setLink] = useState<string | null>(null);

  // Swipe-left reveals the Remind tray (86px on the right). Axis-locked so a
  // vertical scroll never opens it.
  const swipe = useSwipeRow({ rightWidth: 86 });

  function remind() {
    startTransition(async () => {
      const res = await portalRemindTask(w.taskId);
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      setLink(res.link);
      toast(`Reminder ready for ${getGivenName(res.name)} — tap Send on WhatsApp.`, { tone: "success" });
    });
  }

  // A tap opens the task's own page (no inline editing on the board). A swipe
  // gesture must never be read as a tap.
  function openTask() {
    if (swipe.swiped) { swipe.reset(); return; }
    router.push(`/portal/task/${w.code}`);
  }

  // Overdue hero (Option B): the days figure is pre-computed server-side in
  // dueLabel ("20d overdue" / "in 2d" / "due today") — pull the number out.
  const daysMatch = (w.dueLabel ?? "").match(/(\d+)/);
  const days = daysMatch ? daysMatch[1] : null;
  const isToday = /today/i.test(w.dueLabel ?? "");
  const hasFigure = !!days || isToday;
  const figureTone = w.overdue ? "text-danger" : "text-warn";

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

      <button
        type="button"
        {...swipe.bind}
        onClick={openTask}
        className="relative flex w-full touch-pan-y items-center gap-3 rounded-2xl bg-bg-elev px-3 py-2.5 text-left ring-1 ring-border transition-transform duration-300"
        style={{ transform: `translateX(${swipe.offset}px)`, transition: swipe.dragging ? "none" : undefined }}
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="rounded-md bg-bg-subtle px-1.5 py-0.5 text-[10px] font-semibold tabular text-fg-muted">{w.code}</span>
            {w.statusLabel && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-bg-subtle px-2 py-0.5 text-[10px] font-medium text-fg-muted">
                <span className={`h-1.5 w-1.5 rounded-full ${statusDot(w.statusLabel)}`} />{w.statusLabel}
              </span>
            )}
          </span>
          <span className="mt-1 block truncate text-[13px] font-semibold">{w.actionItem}</span>
          <span className="mt-0.5 block truncate text-[11px] text-fg-subtle">{w.companyName} · {w.accountableName ?? "Unassigned"}</span>
        </span>
        {hasFigure ? (
          <span className="flex shrink-0 flex-col items-end leading-none">
            <b className={`text-lg font-bold tabular ${figureTone}`}>{isToday ? "Today" : `${days}d`}</b>
            <s className="mt-0.5 text-[9px] uppercase tracking-[0.06em] text-fg-subtle no-underline">{w.overdue ? "overdue" : isToday ? "due" : "to go"}</s>
          </span>
        ) : (
          <span className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-medium ${w.overdue ? "bg-danger-soft/60 text-danger" : "bg-warn-soft/60 text-warn"}`}>{w.priority}</span>
        )}
      </button>

      {link && (
        <a href={link} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 border-t border-border bg-bg-subtle/40 px-3 py-2 text-xs text-accent hover:underline">
          <ExternalLink size={13} /> Send the reminder now
        </a>
      )}
    </div>
  );
}

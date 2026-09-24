"use client";

/**
 * Studio Home (Phase 3, mockup board Home). Lays out what `StudioHomeServer`
 * worked out — it computes nothing itself.
 *
 *   ┌──────────── hero: a bar per open task ────────────┐┌── Due ──┐
 *   └───────────────────────────────────────────────────┘└─────────┘
 *   ┌─ Tasks ‹ › ─┐ ┌─ People ‹ › ─┐ ┌─ Companies & the day ‹ › ─┐
 *
 * From `lg` it fits the frame with no page scroll (useFitFrame); each card's
 * list scrolls inside itself. Below `lg` everything stacks and the page scrolls.
 * The three bottom cards turn with ‹ ›, the dots, a swipe, or ←/→ when focused.
 */
import { useRef, useState, useTransition, type PointerEvent as RPointerEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, FileText, ListChecks, Loader2, Megaphone, Zap } from "lucide-react";
import { runAutomationsNowAction, sendBriefNowAction } from "@/app/_hub/control-actions";
import { useToast } from "@/components/toast";
import { StudioScope } from "@/components/studio/kit";
import { useFitFrame } from "@/components/studio/use-fit-frame";
import { cn } from "@/lib/cn";

export type HomeItem = { title: string; sub: string; right: string; dot: string; rightColor?: string; href: string };
export type HomeSlide =
  | { kind: "list"; kicker: string; title: string; sub: string; items: HomeItem[]; empty: string; more?: { label: string; href: string } }
  | { kind: "gauge"; kicker: string; title: string; sub: string; big: string; bigSub: string; fill: number; note: string; href: string }
  | { kind: "actions"; kicker: string; title: string; sub: string; approvals: number };

export type StudioHomeData = {
  greeting: string;
  openCount: number;
  announcements: { count: number; first: string } | null;
  late: number;
  soon: number;
  done: number;
  bars: { band: "quiet" | "moving" | "soon" | "late"; h: number; wide: boolean; label: string; href: string }[];
  legend: { label: string; n: number; color: string; href: string }[];
  due: { today: { n: number; sub: string; items: HomeItem[] }; week: { n: number; sub: string; items: HomeItem[] } };
  cards: HomeSlide[][];
};

const BAND: Record<string, string> = { quiet: "#CFE05A", moving: "#19C37D", soon: "#F5A524", late: "#E0479E" };

export function StudioHome({ data }: { data: StudioHomeData }) {
  const grid = useRef<HTMLDivElement>(null);
  useFitFrame(grid, { minimum: 560 });
  const [due, setDue] = useState<"today" | "week">(data.due.today.n > 0 ? "today" : "week");
  const d = data.due[due];

  return (
    <StudioScope>
      <div ref={grid} className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:grid-rows-[minmax(250px,0.8fr)_minmax(0,1fr)]">
        {/* ---------- hero ---------- */}
        <section className="flex min-w-0 flex-col rounded-[18px] bg-[var(--st-card)] px-6 py-5 text-[var(--st-on-card)] lg:col-span-2">
          <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-[var(--st-on-card-muted)]">
                {data.greeting}
                {data.announcements && (
                  <Link href="/announcements" className="inline-flex min-w-0 max-w-[22rem] items-center gap-1.5 rounded-lg bg-[#1F2023] px-2 py-0.5 text-xs text-[#E6E6E3] hover:bg-[#26282C]">
                    <Megaphone size={12} className="shrink-0" />
                    <span className="truncate">Live: {data.announcements.first}</span>
                    {data.announcements.count > 1 && <span className="shrink-0 text-[var(--st-on-card-muted)]">+{data.announcements.count - 1}</span>}
                  </Link>
                )}
              </div>
              <h1 className="m-0 mt-1.5 text-[26px] font-medium leading-tight tracking-[-0.02em] sm:text-[30px]">
                Your {data.openCount} open {data.openCount === 1 ? "task" : "tasks"}, at a glance
              </h1>
            </div>
            <div className="flex shrink-0 gap-6 sm:text-right">
              <HeroNum n={data.late} label="late" color="#F07BBE" href="/?tab=tasks&flag=overdue" />
              <HeroNum n={data.soon} label="due soon" color="#F5B94E" href="/?tab=tasks&flag=due-soon" />
              <HeroNum n={data.done} label="done this month" color="#5BE0A5" href="/?tab=tasks&done=1" />
            </div>
          </div>
          <div className="min-h-4 flex-1" />
          <div className="flex h-[74px] items-end gap-[2px] overflow-hidden sm:gap-[3px]" aria-label="Each bar is one open task, coloured by how it is doing">
            {data.bars.map((b, i) => (
              <Link
                key={i}
                href={b.href}
                title={b.label}
                aria-label={b.label}
                className="st-rise block min-w-[2px] flex-1 rounded-[3px] transition-opacity hover:opacity-70"
                style={{ height: b.h, maxWidth: b.wide ? 14 : 9, background: BAND[b.band], animationDelay: `${Math.min(i * 10, 700)}ms` }}
              />
            ))}
            {data.bars.length === 0 && <div className="text-[13px] text-[var(--st-on-card-muted)]">No open tasks — a clear desk.</div>}
          </div>
          <div className="mt-3.5 flex flex-wrap items-center gap-x-[18px] gap-y-1.5 text-xs text-[#C9CBCF]">
            {data.legend.map((l) => (
              <Link key={l.label} href={l.href} className="flex items-center gap-1.5 hover:text-white">
                <span className="h-2 w-2 rounded-[2px]" style={{ background: l.color }} />{l.label} · {l.n}
              </Link>
            ))}
            <span className="flex-1" />
            <span className="hidden text-[var(--st-muted)] sm:inline">Tap a bar to open that task</span>
          </div>
        </section>

        {/* ---------- due ---------- */}
        <section className="st-tex-rings flex min-w-0 flex-col rounded-[18px] bg-[var(--st-card)] px-6 py-5 text-[var(--st-on-card)]">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[22px] font-medium">{due === "today" ? "Due today" : "Due this week"}</div>
            <div className="flex gap-0.5 rounded-[10px] bg-[#1F2023] p-[3px]">
              {(["today", "week"] as const).map((k) => (
                <button key={k} type="button" aria-pressed={due === k} onClick={() => setDue(k)}
                  className={cn("h-[26px] whitespace-nowrap rounded-[7px] px-2.5 text-xs", due === k ? "bg-[#F2F2F0] font-medium text-[#111214]" : "text-[#A3A6AB] hover:text-white")}>
                  {k === "today" ? "Today" : "This week"}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2.5">
            <span className="text-[88px] leading-[0.95] tracking-[-0.05em] tabular-nums">{d.n}</span>
            <span className="text-sm text-[var(--st-on-card-muted)]">{d.sub}</span>
          </div>
          <div className="min-h-2 flex-1" />
          <div className="st-scroll -mr-2 flex max-h-[128px] flex-col gap-1.5 overflow-y-auto pr-2">
            {d.items.map((it, i) => (
              <Link key={i} href={it.href} className="flex items-center gap-2.5 rounded-[10px] bg-white/[0.06] px-2.5 py-2 text-[13px] transition-colors hover:bg-white/[0.1]">
                <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: it.dot }} />
                <span className="min-w-0 flex-1 truncate">{it.title}</span>
                <span className="shrink-0 text-[11px] text-[var(--st-on-card-muted)]">{it.right}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* ---------- the three turning cards ---------- */}
        {data.cards.map((slides, i) => <TurnCard key={i} slides={slides} />)}
      </div>
    </StudioScope>
  );
}

function HeroNum({ n, label, color, href }: { n: number; label: string; color: string; href: string }) {
  return (
    <Link href={href} className="group">
      <div className="text-[30px] leading-none tracking-[-0.03em] tabular-nums group-hover:opacity-80">{n}</div>
      <div className="mt-1 text-[11px]" style={{ color }}>{label}</div>
    </Link>
  );
}

function TurnCard({ slides }: { slides: HomeSlide[] }) {
  const [i, setI] = useState(0);
  const s = slides[i];
  const go = (dir: number) => setI((x) => (x + dir + slides.length) % slides.length);
  // A swipe turns the card; a small drag is ignored so a scroll or a tap never does.
  const start = useRef<{ x: number; y: number } | null>(null);
  const onDown = (e: RPointerEvent) => { if (e.pointerType !== "mouse") start.current = { x: e.clientX, y: e.clientY }; };
  const onUp = (e: RPointerEvent) => {
    const st = start.current; start.current = null;
    if (!st) return;
    const dx = e.clientX - st.x, dy = e.clientY - st.y;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
  };

  return (
    <section
      tabIndex={0}
      aria-roledescription="carousel"
      aria-label={s.title}
      onKeyDown={(e) => { if (e.key === "ArrowRight") go(1); if (e.key === "ArrowLeft") go(-1); }}
      onPointerDown={onDown}
      onPointerUp={onUp}
      className="flex min-h-[340px] min-w-0 flex-col gap-3 rounded-[18px] bg-[var(--st-surface)] p-5 outline-none focus-visible:ring-2 focus-visible:ring-[var(--st-line)] lg:min-h-0"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-[var(--st-muted)]">{s.kicker}</div>
          <h2 className="m-0 mt-0.5 truncate text-[22px] font-medium tracking-[-0.015em]">{s.title}</h2>
          <div className="mt-0.5 truncate text-[13px] text-[var(--st-muted)]">{s.sub}</div>
        </div>
        <div className="flex shrink-0 gap-1">
          <button type="button" onClick={() => go(-1)} aria-label="Previous" className="flex h-[30px] w-[30px] items-center justify-center rounded-full border border-[var(--st-line)] hover:bg-[var(--st-page)]"><ChevronLeft size={13} /></button>
          <button type="button" onClick={() => go(1)} aria-label="Next" className="flex h-[30px] w-[30px] items-center justify-center rounded-full border border-[var(--st-line)] hover:bg-[var(--st-page)]"><ChevronRight size={13} /></button>
        </div>
      </div>

      <div key={i} className="st-pop flex min-h-0 flex-1 flex-col">
        {s.kind === "list" && <ListSlide s={s} />}
        {s.kind === "gauge" && <GaugeSlide s={s} />}
        {s.kind === "actions" && <ActionsSlide s={s} />}
      </div>

      <div className="flex justify-center gap-1.5" aria-hidden>
        {slides.map((_, k) => (
          <button key={k} type="button" tabIndex={-1} onClick={() => setI(k)}
            className="h-1.5 rounded-full transition-[width,background-color]"
            style={{ width: k === i ? 18 : 6, background: k === i ? "var(--st-ink)" : "var(--st-line)" }} />
        ))}
      </div>
    </section>
  );
}

function ListSlide({ s }: { s: Extract<HomeSlide, { kind: "list" }> }) {
  if (s.items.length === 0) {
    return (
      <div className="st-tex-paper-dots flex flex-1 items-center justify-center rounded-xl border border-dashed border-[var(--st-line)] p-4">
        <span className="rounded-lg bg-[var(--st-surface)] px-3 py-1.5 text-center text-[13px] text-[var(--st-sub)]">{s.empty}</span>
      </div>
    );
  }
  return (
    <>
      <div className="st-scroll -mr-2 flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-2">
        {s.items.map((it, k) => (
          <Link key={k} href={it.href} className="flex shrink-0 items-center gap-2.5 rounded-xl border border-[var(--st-line-soft)] px-3 py-2 transition-colors hover:bg-[var(--st-page)]">
            <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: it.dot }} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px]">{it.title}</span>
              {it.sub && <span className="block truncate text-[11px] text-[var(--st-muted)]">{it.sub}</span>}
            </span>
            <span className="shrink-0 whitespace-nowrap text-[11px]" style={{ color: it.rightColor ?? "var(--st-muted)" }}>{it.right}</span>
          </Link>
        ))}
      </div>
      {s.more && <Link href={s.more.href} className="mt-2 self-start text-xs text-[var(--st-sub)] hover:text-[var(--st-ink)]">{s.more.label} →</Link>}
    </>
  );
}

function GaugeSlide({ s }: { s: Extract<HomeSlide, { kind: "gauge" }> }) {
  // A half circle; the filled part is the share the slide describes.
  const W = 300, R = 128, CX = 150, CY = 140, L = Math.PI * R;
  const path = `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`;
  return (
    <Link href={s.href} className="flex min-h-0 flex-1 flex-col justify-end">
      {/* The gauge takes what room is left and shrinks to it, so the figure
          and the note under it are never cut off on a shorter screen. */}
      <div className="flex min-h-[60px] flex-1 items-end justify-center">
      <svg viewBox={`0 0 ${W} ${CY + 14}`} preserveAspectRatio="xMidYMax meet" className="h-full max-h-[160px] w-full max-w-[300px]" aria-hidden>
        <path d={path} fill="none" stroke="var(--st-track)" strokeWidth={24} strokeLinecap="round" />
        <path d={path} fill="none" stroke="#19C37D" strokeWidth={24} strokeLinecap="round" strokeDasharray={`${L * s.fill} ${L}`} className="st-draw" style={{ ["--st-len" as string]: L * s.fill }} />
      </svg>
      </div>
      <div className="mt-2 flex items-baseline gap-2"><span className="text-[52px] leading-none tracking-[-0.04em]">{s.big}</span><span className="text-[13px] text-[var(--st-muted)]">{s.bigSub}</span></div>
      <div className="mt-1.5 text-xs leading-relaxed text-[var(--st-sub)]">{s.note}</div>
    </Link>
  );
}

function ActionsSlide({ s }: { s: Extract<HomeSlide, { kind: "actions" }> }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  const [, start] = useTransition();
  function fire(key: string, action: () => Promise<{ ok: true; message: string } | { ok: false; error: string }>) {
    setBusy(key);
    start(async () => {
      const res = await action();
      setBusy(null);
      setArmed(false);
      toast(res.ok ? res.message : res.error, { tone: res.ok ? "success" : "warn" });
      router.refresh();
    });
  }
  const row = "flex shrink-0 items-center gap-3 rounded-xl border border-[var(--st-line-soft)] px-3 py-2.5 text-left transition-colors hover:bg-[var(--st-page)] disabled:opacity-60";
  const icon = "flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-[var(--st-page)]";
  return (
    <div className="flex flex-1 flex-col gap-1.5">
      <button type="button" onClick={() => fire("run", runAutomationsNowAction)} disabled={busy !== null} className={row}>
        <span className={icon}>{busy === "run" ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}</span>
        <span className="min-w-0 flex-1"><span className="block text-[13px] font-medium">Run automations now</span><span className="block truncate text-[11px] text-[var(--st-muted)]">Recurring tasks, reminders, renewals</span></span>
        <span className="text-xs font-medium">Run</span>
      </button>
      {/* Sending reaches people outside COS — so it asks once more. */}
      <button type="button" onClick={() => (armed ? fire("brief", sendBriefNowAction) : setArmed(true))} disabled={busy !== null} className={cn(row, armed && "border-[var(--st-ink)]")}>
        <span className={icon}>{busy === "brief" ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}</span>
        <span className="min-w-0 flex-1"><span className="block text-[13px] font-medium">Send the Director Brief</span><span className="block truncate text-[11px] text-[var(--st-muted)]">{armed ? "Tap again to send it now" : "WhatsApp · email · PDF"}</span></span>
        <span className="text-xs font-medium">{armed ? "Send now" : "Send"}</span>
      </button>
      <Link href="/approvals" className={row}>
        <span className={icon}><ListChecks size={14} /></span>
        <span className="min-w-0 flex-1"><span className="block text-[13px] font-medium">Approvals</span><span className="block truncate text-[11px] text-[var(--st-muted)]">{s.approvals ? `${s.approvals} waiting for your yes` : "Nothing waiting for you"}</span></span>
        <span className="text-xs font-medium">Open</span>
      </Link>
      <Link href="/brief" className="mt-1 self-start text-xs text-[var(--st-sub)] hover:text-[var(--st-ink)]">Read the Brief first →</Link>
    </div>
  );
}

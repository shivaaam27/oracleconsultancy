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
import { openReport } from "@/components/studio/report-sheet";
import { useEffect, useRef, useState, useTransition, type PointerEvent as RPointerEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronLeft, ChevronRight, FileText, ListChecks, Loader2, Megaphone, Zap } from "lucide-react";
import { runAutomationsNowAction, sendBriefNowAction, setAutomationPausedAction, setDirectorOutreachPausedAction, setAiEnabledAction, setEmailTestModeAction } from "@/app/_hub/control-actions";
import { useToast } from "@/components/toast";
import { StudioScope } from "@/components/studio/kit";
import { useFitFrame } from "@/components/studio/use-fit-frame";
import { cn } from "@/lib/cn";

export type HomeItem = { title: string; sub: string; right: string; dot: string; rightColor?: string; href: string };
export type HomeSlide =
  | { kind: "list"; kicker: string; title: string; sub: string; items: HomeItem[]; empty: string; more?: { label: string; href: string } }
  | { kind: "gauge"; kicker: string; title: string; sub: string; big: string; bigSub: string; fill: number; note: string; href: string }
  | { kind: "actions"; kicker: string; title: string; sub: string; approvals: number }
  | { kind: "controls"; kicker: string; title: string; sub: string; state: ControlsState };

export type ControlsState = { automationPaused: boolean; outreachPaused: boolean; aiEnabled: boolean; emailConnected: boolean; emailTestMode: boolean };

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

export type StudioHomeLinks = { late: string; soon: string; done: string; announcements: string };
const OWNER_LINKS: StudioHomeLinks = { late: "/?tab=tasks&flag=overdue", soon: "/?tab=tasks&flag=due-soon", done: "/?tab=tasks&done=1", announcements: "/announcements" };

/**
 * A member of STAFF gets this same Home (26 Sept 2026, mockup board S_Home) —
 * the same grid, so the cards are exactly the owner's and directors' sizes.
 * What differs is slotted in: `aside` takes the top-right place (their daily
 * check-in) and the Due card moves down to the bottom row; `after` closes the
 * bottom row (their to-do list); `phone` adds folds on a phone. `heroAction`
 * replaces the Report button, `announcementAction` sits beside the live notice.
 */
export function StudioHome({ data, links = OWNER_LINKS, heroAction, announcementAction, aside, after, phone }: {
  data: StudioHomeData;
  links?: StudioHomeLinks;
  heroAction?: React.ReactNode;
  announcementAction?: React.ReactNode;
  aside?: React.ReactNode;
  after?: React.ReactNode;
  phone?: { before?: React.ReactNode; after?: React.ReactNode };
}) {
  const grid = useRef<HTMLDivElement>(null);
  useFitFrame(grid, { minimum: 560 });

  return (
    <StudioScope>
      <div ref={grid} className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:grid-rows-[minmax(250px,0.8fr)_minmax(0,1fr)]">
        {/* ---------- hero ---------- */}
        <section className="flex min-w-0 flex-col rounded-[18px] bg-[var(--st-card)] px-[18px] py-4 text-[var(--st-on-card)] sm:px-6 sm:py-5 lg:col-span-2">
          <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:gap-4">
            <div className="w-full min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--st-on-card)] sm:text-[13px]">
                {data.greeting}
                {data.announcements && (
                  <span className="inline-flex min-w-0 max-w-full items-center gap-1">
                  <Link href={links.announcements} className="inline-flex min-w-0 max-w-[22rem] items-center gap-1.5 rounded-lg bg-[#1F2023] px-2 py-0.5 text-xs text-[#E6E6E3] hover:bg-[#26282C]">
                    <Megaphone size={12} className="shrink-0" />
                    <span className="truncate">Live: {data.announcements.first}</span>
                    {data.announcements.count > 1 && <span className="shrink-0 text-[var(--st-on-card-muted)]">+{data.announcements.count - 1}</span>}
                  </Link>
                  {announcementAction}
                  </span>
                )}
              </div>
              <h1 className="m-0 mt-2 text-[24px] font-medium leading-[1.1] tracking-[-0.02em] sm:mt-1.5 sm:text-[30px] sm:leading-tight">
                Your {data.openCount} open {data.openCount === 1 ? "task" : "tasks"}, at a glance
              </h1>
            </div>
            <div className="flex shrink-0 gap-[22px] sm:gap-6 sm:text-right">
              <HeroNum n={data.late} label="late" color="#F07BBE" href={links.late} />
              <HeroNum n={data.soon} label="due soon" color="#F5B94E" href={links.soon} />
              <HeroNum n={data.done} label="done this month" color="#5BE0A5" href={links.done} />
            </div>
          </div>
          <div className="min-h-3.5 flex-1 sm:min-h-4" />
          <div className="flex h-[48px] items-end sm:h-[74px] gap-[2px] overflow-hidden sm:gap-[3px]" aria-label="Each bar is one open task, coloured by how it is doing">
            {data.bars.map((b, i) => (
              <Link
                key={i}
                href={b.href}
                title={b.label}
                aria-label={b.label}
                className="st-rise block min-w-[2px] flex-1 rounded-[3px] transition-opacity hover:opacity-70"
                style={{ height: `${Math.min(100, (b.h / 74) * 100)}%`, maxWidth: b.wide ? 14 : 9, background: BAND[b.band], animationDelay: `${Math.min(i * 10, 700)}ms` }}
              />
            ))}
            {data.bars.length === 0 && <div className="text-[13px] text-[var(--st-on-card-muted)]">No open tasks — a clear desk.</div>}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[11px] text-[#C9CBCF] sm:mt-3.5 sm:gap-x-[18px] sm:gap-y-1.5 sm:text-xs">
            {data.legend.map((l) => (
              <Link key={l.label} href={l.href} className="flex items-center gap-1.5 hover:text-white">
                <span className="h-2 w-2 rounded-[2px]" style={{ background: l.color }} />{l.label} · {l.n}
              </Link>
            ))}
            <span className="flex-1" />
            <span className="hidden text-[var(--st-muted)] lg:inline">Tap a bar to open that task</span>
            {/* The Report — what the Director Brief page became: filters, then
                PDF · email · WhatsApp · copy · draft. */}
            {heroAction === undefined ? (
              <button type="button" onClick={() => openReport()} className="inline-flex h-8 items-center gap-1.5 rounded-[9px] bg-[#F2F2F0] px-3 text-xs font-semibold text-[#111214] transition-opacity hover:opacity-90">
                <FileText size={13} />Report
              </button>
            ) : heroAction}
          </div>
        </section>

        {/* ---------- phone: one shape of card, folding (owner, 25 Sept 2026) ---------- */}
        <PhoneFolds data={data} before={phone?.before} after={phone?.after} />

        {aside ?? <DueCard data={data} />}

        {/* ---------- the turning cards ---------- */}
        {aside ? <DueCard data={data} /> : null}
        {data.cards.map((slides, i) => <TurnCard key={i} slides={slides} />)}
        {after}
      </div>
    </StudioScope>
  );
}

function DueCard({ data }: { data: StudioHomeData }) {
  const [due, setDue] = useState<"today" | "week">(data.due.today.n > 0 ? "today" : "week");
  const d = data.due[due];
  return (
        <section className="st-tex-rings hidden min-w-0 flex-col md:flex rounded-[18px] bg-[var(--st-card)] px-[18px] py-4 text-[var(--st-on-card)] sm:px-6 sm:py-5">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[15px] font-medium sm:text-[22px]">{due === "today" ? "Due today" : "Due this week"}</div>
            <div className="flex gap-0.5 rounded-[10px] bg-[#1F2023] p-[3px]">
              {(["today", "week"] as const).map((k) => (
                <button key={k} type="button" aria-pressed={due === k} onClick={() => setDue(k)}
                  className={cn("h-[26px] whitespace-nowrap rounded-[7px] px-2.5 text-xs", due === k ? "bg-[#F2F2F0] font-medium text-[#111214]" : "text-[#D4D6DA] hover:text-white")}>
                  {k === "today" ? "Today" : "This week"}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2.5">
            <span className="text-[48px] leading-[0.9] tracking-[-0.05em] tabular-nums sm:text-[88px] sm:leading-[0.95]">{d.n}</span>
            <span className="text-[13px] text-[var(--st-on-card-muted)] sm:text-sm">{d.sub}</span>
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
      className="hidden min-h-0 min-w-0 flex-col gap-3 rounded-[18px] bg-[var(--st-surface)] p-5 outline-none md:flex md:min-h-[340px] focus-visible:ring-2 focus-visible:ring-[var(--st-line)] lg:min-h-0"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-[var(--st-muted)]">{s.kicker}</div>
          <h2 className="m-0 mt-0.5 truncate text-[20px] font-medium tracking-[-0.015em] sm:text-[22px]">{s.title}</h2>
          <div className="mt-0.5 truncate text-[13px] text-[var(--st-muted)]">{s.sub}</div>
        </div>
        {slides.length > 1 && <div className="flex shrink-0 gap-1">
          <button type="button" onClick={() => go(-1)} aria-label="Previous" className="flex h-[30px] w-[30px] items-center justify-center rounded-full border border-[var(--st-line)] hover:bg-[var(--st-page)]"><ChevronLeft size={13} /></button>
          <button type="button" onClick={() => go(1)} aria-label="Next" className="flex h-[30px] w-[30px] items-center justify-center rounded-full border border-[var(--st-line)] hover:bg-[var(--st-page)]"><ChevronRight size={13} /></button>
        </div>}
      </div>

      <div key={i} className="st-pop flex min-h-0 flex-1 flex-col">
        {s.kind === "list" && <ListSlide s={s} />}
        {s.kind === "gauge" && <GaugeSlide s={s} />}
        {s.kind === "actions" && <ActionsSlide s={s} />}
        {s.kind === "controls" && <ControlsSlide s={s} />}
      </div>

      {slides.length > 1 && <div className="flex justify-center gap-1.5" aria-hidden>
        {slides.map((_, k) => (
          <button key={k} type="button" tabIndex={-1} onClick={() => setI(k)}
            className="h-1.5 rounded-full transition-[width,background-color]"
            style={{ width: k === i ? 18 : 6, background: k === i ? "var(--st-ink)" : "var(--st-line)" }} />
        ))}
      </div>}
    </section>
  );
}

function ListSlide({ s, limit }: { s: Extract<HomeSlide, { kind: "list" }>; limit?: number }) {
  const [all, setAll] = useState(false);
  const items = limit && !all ? s.items.slice(0, limit) : s.items;
  const hidden = s.items.length - items.length;
  if (s.items.length === 0) {
    return (
      <div className="st-tex-paper-dots flex flex-1 items-center justify-center rounded-xl border border-dashed border-[var(--st-line)] p-4">
        <span className="rounded-lg bg-[var(--st-surface)] px-3 py-1.5 text-center text-[13px] text-[var(--st-sub)]">{s.empty}</span>
      </div>
    );
  }
  return (
    <>
      <div className="st-scroll -mr-2 flex min-h-0 flex-1 flex-col overflow-y-auto pr-2 sm:gap-1.5">
        {items.map((it, k) => (
          <Link key={k} href={it.href} className="flex min-h-12 shrink-0 items-center gap-3 border-b border-[var(--st-line-soft)] py-2.5 transition-colors last:border-0 hover:bg-[var(--st-page)] sm:min-h-0 sm:gap-2.5 sm:rounded-xl sm:border sm:px-3 sm:py-2 sm:last:border">
            <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: it.dot }} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium sm:text-[13px] sm:font-normal">{it.title}</span>
              {it.sub && <span className="block truncate text-xs text-[var(--st-muted)] sm:text-[11px]">{it.sub}</span>}
            </span>
            <span className="shrink-0 whitespace-nowrap text-xs sm:text-[11px]" style={{ color: it.rightColor ?? "var(--st-muted)" }}>{it.right}</span>
          </Link>
        ))}
      </div>
      {hidden > 0 && (
        <button type="button" onClick={() => setAll(true)} className="mt-1 flex h-10 items-center justify-center rounded-xl bg-[var(--st-page)] text-[13px] text-[var(--st-sub)]">
          Show {hidden} more
        </button>
      )}
      {s.more && hidden === 0 && <Link href={s.more.href} className="mt-2 self-start text-xs text-[var(--st-sub)] hover:text-[var(--st-ink)]">{s.more.label} →</Link>}
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
    <div className="st-scroll -mr-2 flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-2">
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
      <button type="button" onClick={() => openReport()} className="mt-1 shrink-0 self-start text-xs text-[var(--st-sub)] hover:text-[var(--st-ink)]">Open the report first →</button>
    </div>
  );
}

/** The old Home's "Controls held" panel: the switches that decide what COS
 *  does on its own. Same actions, optimistic, rolled back if the save fails. */
function ControlsSlide({ s }: { s: Extract<HomeSlide, { kind: "controls" }> }) {
  const router = useRouter();
  const { toast } = useToast();
  const [st, setSt] = useState(s.state);
  const [busy, setBusy] = useState<string | null>(null);
  async function flip(key: keyof ControlsState, next: boolean, action: () => Promise<{ ok: true } | { ok: false; error: string }>, said: string) {
    const prev = st;
    setSt({ ...st, [key]: next });
    setBusy(key);
    const res = await action();
    setBusy(null);
    if (!res.ok) { setSt(prev); toast(res.error, { tone: "warn" }); return; }
    toast(said, { tone: "success" });
    router.refresh();
  }
  const rows: { key: keyof ControlsState; title: string; sub: string; on: boolean; onWord: string; offWord: string; run: () => void; hidden?: boolean }[] = [
    { key: "automationPaused", title: "Automations", sub: "Recurring tasks, reminders, renewals", on: !st.automationPaused, onWord: "On", offWord: "Paused",
      run: () => flip("automationPaused", !st.automationPaused, () => setAutomationPausedAction(!st.automationPaused), st.automationPaused ? "Automations resumed." : "Automations paused.") },
    { key: "outreachPaused", title: "Director outreach", sub: "WhatsApp and email to directors", on: !st.outreachPaused, onWord: "On", offWord: "Paused",
      run: () => flip("outreachPaused", !st.outreachPaused, () => setDirectorOutreachPausedAction(!st.outreachPaused), st.outreachPaused ? "Director outreach resumed." : "Director outreach paused.") },
    { key: "aiEnabled", title: "AI", sub: "Reading, drafting, answering", on: st.aiEnabled, onWord: "On", offWord: "Off",
      run: () => flip("aiEnabled", !st.aiEnabled, () => setAiEnabledAction(!st.aiEnabled), st.aiEnabled ? "AI switched off." : "AI switched on.") },
    { key: "emailTestMode", title: "Email", sub: st.emailConnected ? "Live sends, or test mode" : "Not connected — set it up in Settings", on: st.emailConnected && !st.emailTestMode, onWord: "Live", offWord: st.emailConnected ? "Test mode" : "Off",
      run: () => (st.emailConnected ? flip("emailTestMode", !st.emailTestMode, () => setEmailTestModeAction(!st.emailTestMode), st.emailTestMode ? "Email is live." : "Email is in test mode.") : router.push("/settings#email-automation")) },
  ];
  return (
    <div className="st-scroll -mr-2 flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-2">
      {rows.map((r) => (
        <button key={r.key} type="button" role="switch" aria-checked={r.on} disabled={busy !== null} onClick={r.run}
          className="flex shrink-0 items-center gap-3 rounded-xl border border-[var(--st-line-soft)] px-3 py-2 text-left transition-colors hover:bg-[var(--st-page)] disabled:opacity-60">
          <span className="min-w-0 flex-1"><span className="block text-[13px] font-medium">{r.title}</span><span className="block truncate text-[11px] text-[var(--st-muted)]">{r.sub}</span></span>
          <span className={cn("text-xs", r.on ? "text-[var(--st-ok-text)]" : "text-[var(--st-soon-text)]")}>{busy === r.key ? <Loader2 size={12} className="animate-spin" /> : r.on ? r.onWord : r.offWord}</span>
          <span aria-hidden className={cn("relative h-5 w-[34px] shrink-0 rounded-full transition-colors", r.on ? "bg-[var(--st-ink)]" : "bg-[#D6D6D2]")}>
            <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-[left]", r.on ? "left-4" : "left-0.5")} />
          </span>
        </button>
      ))}
      <Link href="/settings" className="mt-1 shrink-0 self-start text-xs text-[var(--st-sub)] hover:text-[var(--st-ink)]">Every setting →</Link>
    </div>
  );
}

/* ── Phone: every section is the same card — a header you tap to fold it, one
   line of summary, a count — so Home is a short page of equal cards rather than
   a long scroll of different ones (owner, 25 Sept 2026). Opened, a list shows
   three rows and "Show N more". What you leave open is remembered on this
   device. ────────────────────────────────────────────────────────────────── */

const FOLD_KEY = "studio.home.folds";

function PhoneFolds({ data, before, after }: { data: StudioHomeData; before?: React.ReactNode; after?: React.ReactNode }) {
  const [open, setOpen] = useState<Record<string, boolean> | null>(null);
  useEffect(() => {
    let saved: Record<string, boolean> = {};
    try { saved = JSON.parse(window.localStorage.getItem(FOLD_KEY) || "{}"); } catch { /* private window */ }
    setOpen(saved);
  }, []);
  const isOpen = (id: string, dflt: boolean) => (open && id in open ? open[id] : dflt);
  const toggle = (id: string, dflt: boolean) => setOpen((o) => {
    const cur = o && id in o ? o[id] : dflt;
    const next = { ...(o ?? {}), [id]: !cur };
    try { window.localStorage.setItem(FOLD_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  });
  const [due, setDue] = useState<"today" | "week">(data.due.today.n > 0 ? "today" : "week");
  const d = data.due[due];
  const dueSlide: Extract<HomeSlide, { kind: "list" }> = {
    kind: "list", kicker: "Diary", title: due === "today" ? "Due today" : "Due this week", sub: d.sub,
    items: d.items, empty: due === "today" ? "Nothing due today" : "Nothing due this week",
  };
  return (
    <div className="flex flex-col gap-2.5 md:hidden">
      {before}
      <Fold id="due" kicker="Diary" title={dueSlide.title} sub={d.sub} count={d.n} open={isOpen("due", true)} onToggle={() => toggle("due", true)}>
        <div className="mb-2 flex gap-0.5 self-start rounded-[10px] bg-[var(--st-page)] p-[3px]">
          {(["today", "week"] as const).map((k) => (
            <button key={k} type="button" aria-pressed={due === k} onClick={() => setDue(k)}
              className={cn("h-8 rounded-[8px] px-3 text-xs", due === k ? "bg-[var(--st-surface)] font-medium shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-[var(--st-sub)]")}>
              {k === "today" ? "Today" : "This week"}
            </button>
          ))}
        </div>
        <ListSlide key={due} s={dueSlide} limit={3} />
      </Fold>
      {data.cards.map((slides, i) => (
        <PhoneTurnFold key={i} id={`card${i}`} slides={slides} open={isOpen(`card${i}`, i === 0)} onToggle={() => toggle(`card${i}`, i === 0)} />
      ))}
      {after}
    </div>
  );
}

function PhoneTurnFold({ id, slides, open, onToggle }: { id: string; slides: HomeSlide[]; open: boolean; onToggle: () => void }) {
  const [i, setI] = useState(0);
  const s = slides[i];
  const go = (dir: number) => setI((x) => (x + dir + slides.length) % slides.length);
  const count = s.kind === "list" ? s.items.length : undefined;
  return (
    <Fold id={id} kicker={s.kicker} title={s.title} sub={s.sub} count={count} open={open} onToggle={onToggle}>
      {slides.length > 1 && (
        <div className="mb-1.5 flex items-center justify-between">
          <div className="flex gap-1.5" aria-hidden>
            {slides.map((_, k) => <span key={k} className="h-1.5 rounded-full" style={{ width: k === i ? 16 : 6, background: k === i ? "var(--st-ink)" : "var(--st-line)" }} />)}
          </div>
          <div className="flex gap-1.5">
            <button type="button" onClick={() => go(-1)} aria-label="Previous" className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--st-line)]"><ChevronLeft size={14} /></button>
            <button type="button" onClick={() => go(1)} aria-label="Next" className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--st-line)]"><ChevronRight size={14} /></button>
          </div>
        </div>
      )}
      <div key={i} className="st-pop flex flex-col">
        {s.kind === "list" && <ListSlide s={s} limit={3} />}
        {s.kind === "gauge" && <div className="flex h-[230px] flex-col"><GaugeSlide s={s} /></div>}
        {s.kind === "actions" && <ActionsSlide s={s} />}
        {s.kind === "controls" && <ControlsSlide s={s} />}
      </div>
    </Fold>
  );
}

export function Fold({ id, kicker, title, sub, count, open, onToggle, children }: {
  id: string; kicker?: string; title: string; sub?: string; count?: number; open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <section className="rounded-[18px] bg-[var(--st-surface)]">
      <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={`fold-${id}`}
        className="flex min-h-[64px] w-full items-center gap-3 px-4 py-3 text-left">
        <span className="min-w-0 flex-1">
          {kicker && <span className="block text-[11px] text-[var(--st-muted)]">{kicker}</span>}
          <span className="block truncate text-[17px] font-medium tracking-[-0.01em]">{title}</span>
          {sub && <span className="block truncate text-xs text-[var(--st-muted)]">{sub}</span>}
        </span>
        {count != null && <span className="shrink-0 rounded-lg bg-[var(--st-page)] px-2 py-0.5 text-[13px] tabular-nums">{count}</span>}
        <ChevronDown size={17} className={cn("shrink-0 text-[var(--st-muted)] transition-transform duration-200", open && "rotate-180")} />
      </button>
      {open && <div id={`fold-${id}`} className="st-pop flex flex-col border-t border-[var(--st-line-soft)] px-4 pb-3 pt-2.5">{children}</div>}
    </section>
  );
}

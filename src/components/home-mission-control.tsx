"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  BriefcaseBusiness,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  FileWarning,
  Landmark,
  Layers,
  LayoutGrid,
  ListChecks,
  Loader2,
  RefreshCw,
  Send,
  Sparkles,
  Target,
  Users,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/cn";
import { spring } from "@/lib/motion";
import { Badge, Button, LinkButton } from "@/components/ui";
import { useToast } from "@/components/toast";
import { AutomationActionButton } from "@/components/automation-action-button";
import { PlanMyDayButton } from "@/components/plan-my-day-button";
import { channelLabel } from "@/lib/outbox-links";
import type { MorningPlanItem } from "@/lib/automation-suggestions";
import { approveReminderAction, approveRenewalAction } from "@/app/automation/actions";
import { Hero, Panel, SectionLabel, TrendChip, TONE, type Tone } from "@/components/surface-kit";
import { InsightPopover, InsightBody } from "@/components/insight-popover";
import { WeatherChip } from "@/components/weather-chip";

const toneClass = TONE;

type InsightRow = { label: string; value: string | number; tone?: Tone };

export type CommandAction = {
  id: string;
  title: string;
  detail: string;
  href: string;
  actionLabel: string;
  tone: Tone;
  count?: number;
  automationAction?: "overdue-reminders" | "document-renewals";
};

export type MetricTrend = { delta: number; goodWhenDown?: boolean } | null;

export type PulseMetric = {
  label: string;
  value: number;
  tone?: Tone;
  trend?: MetricTrend;
  /** One-line description shown in the hover/tap insight. */
  hint?: string;
  /** Previous value + window, for the "vs N days ago" delta line. */
  previous?: number;
  days?: number;
  /** Optional breakdown rows. */
  rows?: InsightRow[];
};

export type QueueGroup = "task" | "document" | "people" | "statutory" | "draft";

export type QueueItem = {
  id: string;
  title: string;
  meta: string;
  href: string;
  tone: Tone;
  group: QueueGroup;
  due?: string | null;
};

export type CompanyGauge = {
  id: number;
  name: string;
  accentColor: string | null;
  score: number;
  status: "Good" | "Watch" | "Risk";
  missing: number;
  expiring: number;
  expired: number;
};

const groupMeta: Record<QueueGroup, { label: string; icon: typeof ClipboardList }> = {
  task: { label: "Tasks", icon: ClipboardList },
  document: { label: "Documents", icon: FileWarning },
  people: { label: "People", icon: Users },
  statutory: { label: "Statutory", icon: Landmark },
  draft: { label: "Drafts", icon: Send },
};

/* ---- animated count-up (reduced-motion safe — finishes instantly) ---- */
function useCountUp(target: number, duration = 900) {
  const [value, setValue] = useState(0);
  const ref = useRef(0);
  useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || target === 0) {
      setValue(target);
      return;
    }
    const from = ref.current;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = Math.round(from + (target - from) * eased);
      setValue(next);
      ref.current = next;
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

function CountUp({ value, className }: { value: number; className?: string }) {
  const v = useCountUp(value);
  return <span className={className}>{v}</span>;
}

function statusTone(status: "Good" | "Watch" | "Risk"): Tone {
  return status === "Risk" ? "danger" : status === "Watch" ? "warn" : "success";
}

/** Build the hover/tap insight body for a single metric card. */
function metricInsight(m: PulseMetric): React.ReactNode {
  const delta = m.trend?.delta;
  const hasDelta = typeof delta === "number" && typeof m.previous === "number";
  const caption = (
    <span className="block space-y-1">
      {m.hint && <span className="block">{m.hint}</span>}
      {hasDelta && (
        <span className="block">
          {delta === 0
            ? "No change"
            : `${delta! > 0 ? "Up" : "Down"} ${Math.abs(delta!)} from ${m.previous}`}
          {m.days ? ` over ${m.days} day${m.days === 1 ? "" : "s"}` : ""}.
        </span>
      )}
    </span>
  );
  return (
    <InsightBody
      title={m.label}
      value={m.value}
      caption={caption}
      rows={m.rows?.map((r) => ({ label: r.label, value: r.value, tone: r.tone ? toneClass[r.tone].text : undefined }))}
    />
  );
}

/* ---- a half-circle (180°) gauge for the headline compliance score ---- */
function ArcGauge({ percent, color, size = 150, stroke = 13 }: { percent: number; color: string; size?: number; stroke?: number }) {
  const animated = useCountUp(percent, 1100);
  const r = (size - stroke) / 2;
  const cy = size / 2;
  const d = `M ${stroke / 2} ${cy} A ${r} ${r} 0 0 1 ${size - stroke / 2} ${cy}`;
  const len = Math.PI * r;
  const offset = len - (animated / 100) * len;
  return (
    <svg width={size} height={cy + stroke / 2} className="overflow-visible">
      <path d={d} fill="none" stroke="hsl(var(--border))" strokeOpacity={0.5} strokeWidth={stroke} strokeLinecap="round" />
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={len}
        strokeDashoffset={offset}
        style={{ transition: "stroke-dashoffset 0.2s linear", filter: `drop-shadow(0 0 6px ${color})` }}
      />
    </svg>
  );
}

function QueueRow({ item, index }: { item: QueueItem; index: number }) {
  const Icon = groupMeta[item.group].icon;
  const stroke = toneClass[item.tone].stroke;
  return (
    <li className="animate-[fadeIn_0.3s_ease-out_both]" style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}>
      <Link
        href={item.href}
        className="group relative flex items-center gap-3 overflow-hidden rounded-2xl py-2.5 pl-4 pr-3 transition-all hover:bg-gradient-to-r hover:from-bg-muted/60 hover:to-transparent hover:ring-1 hover:ring-border/60"
      >
        <span
          aria-hidden
          className="absolute inset-y-2 left-0.5 w-1 rounded-full opacity-80 transition-opacity group-hover:opacity-100"
          style={{ background: stroke, boxShadow: `0 0 10px ${stroke}` }}
        />
        <span
          className={cn(
            "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 transition-transform group-hover:scale-105",
            toneClass[item.tone].bg,
            toneClass[item.tone].ring
          )}
        >
          <Icon size={16} className={toneClass[item.tone].text} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium transition-transform group-hover:translate-x-0.5 group-hover:text-accent">
            {item.title}
          </span>
          <span className="mt-0.5 block truncate text-xs text-fg-muted">{item.meta}</span>
        </span>
        {item.due && (
          <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular ring-1", toneClass[item.tone].bg, toneClass[item.tone].text, toneClass[item.tone].ring)}>
            {item.due}
          </span>
        )}
        <ChevronRight size={16} className="shrink-0 -translate-x-1 text-fg-subtle opacity-0 transition-all group-hover:translate-x-0 group-hover:text-accent group-hover:opacity-100" />
      </Link>
    </li>
  );
}

function CommandIcon({ tone }: { tone: Tone }) {
  const Icon = tone === "danger" ? AlertTriangle : tone === "warn" ? CalendarClock : tone === "success" ? CheckCircle2 : Sparkles;
  return (
    <span className={cn("inline-flex h-9 w-9 items-center justify-center rounded-xl ring-1", toneClass[tone].bg, toneClass[tone].ring)}>
      <Icon size={17} className={toneClass[tone].text} />
    </span>
  );
}

/* ---- Morning Run: per-item, confirm-first agent tray (Phase 4) ---- */

function dueLabel(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Nairobi" });
}

type RowState = { status: "idle" | "working" | "done" | "dismissed"; link?: string | null; channel?: string };

function MorningRunRow({
  item,
  state,
  onApprove,
  onDismiss,
}: {
  item: MorningPlanItem;
  state: RowState;
  onApprove: () => void;
  onDismiss: () => void;
}) {
  const isReminder = item.kind === "reminder";
  const tone: Tone = isReminder ? "danger" : item.status === "Expired" ? "danger" : "warn";
  const Icon = isReminder ? BellRing : RefreshCw;

  const title = isReminder ? `Remind ${item.personName}` : `Renew: ${item.title}`;
  const meta = isReminder
    ? `${item.taskCount} overdue task${item.taskCount === 1 ? "" : "s"} · ${channelLabel(item.channel)}${item.company ? ` · ${item.company}` : ""}`
    : `${item.status}${item.companyName ? ` · ${item.companyName}` : ""}${item.deadline ? ` · expires ${dueLabel(item.deadline)}` : ""}`;

  if (state.status === "done") {
    return (
      <motion.li
        layout
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, x: 24 }}
        transition={spring}
        className="flex items-center gap-3 rounded-2xl bg-success-soft/20 px-3 py-2.5 ring-1 ring-success/20"
      >
        <motion.span
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ ...spring, delay: 0.05 }}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-success-soft/60 text-success ring-1 ring-success/25"
        >
          <Check size={15} />
        </motion.span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{isReminder ? `Draft ready for ${item.personName}` : `Renewal task created`}</span>
          <span className="block truncate text-xs text-fg-muted">{isReminder ? "Saved to Outbox — send when you're ready." : title}</span>
        </span>
        {isReminder && state.link ? (
          <a
            href={state.link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-accent/10 px-2.5 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent/20"
          >
            <Send size={12} /> Send
          </a>
        ) : (
          <Link href={isReminder ? "/outbox" : "/?tab=tasks&view=table"} className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-fg-muted hover:text-accent">
            Open <ArrowRight size={12} />
          </Link>
        )}
      </motion.li>
    );
  }

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={spring}
      className={cn("flex flex-col gap-2 rounded-2xl p-3 ring-1 sm:flex-row sm:items-center", toneClass[tone].bg, toneClass[tone].ring)}
    >
      <span className={cn("inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ring-1", toneClass[tone].bg, toneClass[tone].ring)}>
        <Icon size={15} className={toneClass[tone].text} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title}</span>
        <span className="block truncate text-xs text-fg-muted">{meta}</span>
      </span>
      <div className="flex shrink-0 gap-1.5">
        <Button type="button" size="sm" variant="primary" loading={state.status === "working"} onClick={onApprove}>
          {state.status === "working" ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
          Approve
        </Button>
        <button
          type="button"
          onClick={onDismiss}
          disabled={state.status === "working"}
          aria-label="Dismiss"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-fg-subtle ring-1 ring-border/50 transition-colors hover:bg-bg-muted/50 hover:text-fg disabled:opacity-40"
        >
          <X size={14} />
        </button>
      </div>
    </motion.li>
  );
}

function MorningRun({ items }: { items: MorningPlanItem[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [, startTransition] = useTransition();
  const [states, setStates] = useState<Record<string, RowState>>({});
  // Snapshot approved items so they stay visible (with the inline Send link)
  // even after router.refresh() drops them from the server-built plan.
  const [done, setDone] = useState<Record<string, MorningPlanItem>>({});

  function setRow(id: string, patch: Partial<RowState>) {
    setStates((s) => ({ ...s, [id]: { ...(s[id] ?? { status: "idle" }), ...patch } }));
  }

  function approve(item: MorningPlanItem) {
    setRow(item.id, { status: "working" });
    startTransition(async () => {
      const res =
        item.kind === "reminder"
          ? await approveReminderAction(item.personId)
          : await approveRenewalAction(item.documentId);
      if (!res.ok) {
        toast(res.error, { tone: "warn", duration: 4000 });
        setRow(item.id, { status: "idle" });
        return;
      }
      const link = (res as { link?: string | null }).link ?? null;
      setRow(item.id, { status: "done", link });
      setDone((d) => ({ ...d, [item.id]: item }));
      if (!res.created) {
        toast(res.reason === "already" ? "Already prepared today." : "Nothing left to prepare for this item.", { tone: "default", duration: 3500 });
      } else {
        toast(item.kind === "reminder" ? `Draft ready for ${item.personName}.` : "Renewal task created.", { tone: "success", duration: 4000 });
      }
      router.refresh();
    });
  }

  // Merge server-built items with locally-approved snapshots (which the server
  // no longer returns), so approved rows persist until dismissed.
  const merged = [...items];
  for (const id of Object.keys(done)) {
    if (!merged.some((m) => m.id === id)) merged.push(done[id]);
  }
  const visible = merged.filter((it) => states[it.id]?.status !== "dismissed");
  if (visible.length === 0) return null;

  const pending = visible.filter((it) => (states[it.id]?.status ?? "idle") === "idle").length;

  return (
    <div className="mt-3 border-t border-border/60 pt-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-fg-subtle">
          <Sparkles size={12} className="text-accent" /> Ready to action
        </div>
        {pending > 0 && <span className="text-[11px] text-fg-muted">{pending} to review</span>}
      </div>
      <ul className="space-y-1.5">
        <AnimatePresence initial={false}>
          {visible.map((item) => (
            <MorningRunRow
              key={item.id}
              item={item}
              state={states[item.id] ?? { status: "idle" }}
              onApprove={() => approve(item)}
              onDismiss={() => setRow(item.id, { status: "dismissed" })}
            />
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}

export function HomeMissionControl({
  greeting,
  dateLabel,
  command,
  pulse,
  queue,
  health,
  healthStats,
  healthDelta,
  companyGauges,
  clearedToday,
  weather,
  morningPlan = [],
}: {
  greeting: string;
  dateLabel: string;
  command: CommandAction[];
  pulse: PulseMetric[];
  queue: QueueItem[];
  health: number;
  healthStats: { missing: number; inProgress: number; expiring: number; expired: number };
  healthDelta: number | null;
  companyGauges: CompanyGauge[];
  clearedToday: number;
  weather: { city: string; lat: number; lon: number };
  morningPlan?: MorningPlanItem[];
}) {
  // The Morning Run tray now owns the bulk automation actions, so drop those
  // command cards here to avoid showing both the tray rows and the old button.
  const actionable = command.filter((c) => !c.automationAction);
  const lead = actionable[0];
  const rest = actionable.slice(1, 5);
  const hasPlan = morningPlan.length > 0;
  const healthTone: Tone = health >= 80 ? "success" : health >= 55 ? "warn" : "danger";

  // Worst-first so attention lands where the gaps are.
  const rankedGauges = [...companyGauges].sort((a, b) => a.score - b.score);

  const [showAllCos, setShowAllCos] = useState(false);
  const visibleGauges = showAllCos ? rankedGauges : rankedGauges.slice(0, 5);

  const [filter, setFilter] = useState<QueueGroup | "all">("all");
  const [showAll, setShowAll] = useState(false);

  const groupCounts = queue.reduce(
    (acc, q) => {
      acc[q.group] = (acc[q.group] ?? 0) + 1;
      return acc;
    },
    {} as Record<QueueGroup, number>
  );
  const filtered = filter === "all" ? queue : queue.filter((q) => q.group === filter);
  const shown = showAll ? filtered : filtered.slice(0, 6);

  const segments: Array<{ key: QueueGroup | "all"; label: string; n: number }> = [
    { key: "all", label: "All", n: queue.length },
    ...(Object.keys(groupMeta) as QueueGroup[])
      .filter((g) => (groupCounts[g] ?? 0) > 0)
      .map((g) => ({ key: g, label: groupMeta[g].label, n: groupCounts[g] ?? 0 })),
  ];

  return (
    <div className="max-w-full space-y-4 overflow-hidden">
      {/* ============================== HERO ============================== */}
      <Hero
        title={greeting}
        subtitle={dateLabel}
        accentTone={healthTone}
        actions={
          <>
            <WeatherChip city={weather.city} lat={weather.lat} lon={weather.lon} />
            <LinkButton href="/?capture=open" variant="primary" size="sm">
              <Sparkles size={14} /> Create
            </LinkButton>
            <LinkButton href="/brief" variant="secondary" size="sm">
              <BriefcaseBusiness size={14} /> Director Brief
            </LinkButton>
          </>
        }
      >
        {/* Metric rail — horizontal scroll on mobile, no stacking. Each card
            reveals a detailed insight on hover (desktop) or tap (mobile). */}
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {pulse.map((m) => (
            <InsightPopover
              key={m.label}
              content={metricInsight(m)}
              className="min-w-[92px] flex-1 shrink-0"
            >
              <div className="w-full rounded-2xl bg-bg-elev/70 px-3 py-2.5 text-left ring-1 ring-border/60 backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:ring-accent/30">
                <div className="flex items-baseline justify-between gap-1">
                  <CountUp value={m.value} className={cn("block text-xl font-semibold tabular leading-none", m.tone ? toneClass[m.tone].text : "text-fg")} />
                  {m.trend && <TrendChip delta={m.trend.delta} goodWhenDown={m.trend.goodWhenDown} />}
                </div>
                <span className="mt-1 block truncate text-[11px] leading-tight text-fg-muted">{m.label}</span>
              </div>
            </InsightPopover>
          ))}
        </div>
      </Hero>

      {/* =================== HEALTH + THE ONE THING =================== */}
      <section className="grid gap-4 lg:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]">
        {/* Portfolio health — arc gauge + ranked company league, one glance */}
        <Panel glass className="p-4 sm:p-5">
          <SectionLabel
            icon={<LayoutGrid size={13} />}
            action={
              healthDelta !== null && healthDelta !== 0 ? (
                <span className="inline-flex items-center gap-1 text-[11px] text-fg-muted">
                  <TrendChip delta={healthDelta} suffix="%" /> vs last
                </span>
              ) : undefined
            }
          >
            Portfolio health
          </SectionLabel>

          <div className="mt-3 grid gap-4 sm:grid-cols-[minmax(168px,0.66fr)_minmax(0,1fr)]">
            {/* Headline arc gauge + status pill + consistent stat strip */}
            <div className="flex flex-col rounded-2xl bg-gradient-to-b from-bg-elev/70 to-bg-subtle/30 p-3 ring-1 ring-border/50">
              <InsightPopover
                align="center"
                content={
                  <InsightBody
                    title="Portfolio compliance"
                    value={`${health}%`}
                    caption={
                      healthDelta === null
                        ? "Average compliance across every company and person. A second reading appears tomorrow for trend."
                        : `${healthDelta === 0 ? "No change" : `${healthDelta > 0 ? "Up" : "Down"} ${Math.abs(healthDelta)}%`} since the last reading.`
                    }
                    rows={[
                      { label: "Missing", value: healthStats.missing },
                      { label: "Awaiting verification", value: healthStats.inProgress, tone: "text-info" },
                      { label: "Expiring soon", value: healthStats.expiring, tone: "text-warn" },
                      { label: "Expired", value: healthStats.expired, tone: "text-danger" },
                    ]}
                  />
                }
                className="mx-auto"
              >
                <div className="relative grid cursor-help place-items-center pb-1">
                  <ArcGauge percent={health} color={toneClass[healthTone].stroke} />
                  <div className="absolute bottom-1 flex flex-col items-center">
                    <div className="flex items-baseline">
                      <CountUp value={health} className={cn("text-[28px] font-semibold tabular leading-none", toneClass[healthTone].text)} />
                      <span className={cn("text-base font-semibold", toneClass[healthTone].text)}>%</span>
                    </div>
                  </div>
                </div>
              </InsightPopover>

              <div className="-mt-1 flex justify-center">
                <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1", toneClass[healthTone].bg, toneClass[healthTone].text, toneClass[healthTone].ring)}>
                  <span className={cn("h-1.5 w-1.5 rounded-full", toneClass[healthTone].bar)} />
                  {health >= 80 ? "Healthy" : health >= 55 ? "Watch" : "At risk"}
                </span>
              </div>

              {/* One consistent segmented strip — no mismatched tiles */}
              <div className="mt-3 flex divide-x divide-border/50 overflow-hidden rounded-xl bg-bg-subtle/50 ring-1 ring-border/50">
                {([
                  { label: "Missing", value: healthStats.missing, tone: "muted" as Tone },
                  { label: "Expiring", value: healthStats.expiring, tone: "warn" as Tone },
                  { label: "Expired", value: healthStats.expired, tone: "danger" as Tone },
                ]).map((s) => (
                  <div key={s.label} className="flex-1 px-1 py-2 text-center">
                    <div className={cn("text-lg font-semibold tabular leading-none", s.value ? toneClass[s.tone].text : "text-fg-subtle")}>{s.value}</div>
                    <div className="mt-1 flex items-center justify-center gap-1 text-[10px] leading-tight text-fg-muted">
                      <span className={cn("h-1 w-1 rounded-full", s.value ? toneClass[s.tone].bar : "bg-fg-subtle/40")} />
                      {s.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Ranked company league — each row reveals a breakdown on hover/tap */}
            <div className="min-w-0">
              {rankedGauges.length === 0 ? (
                <p className="grid h-full place-items-center text-xs text-fg-muted">No company compliance data yet.</p>
              ) : (
                <ul className="space-y-0.5">
                  {visibleGauges.map((c) => {
                    const t = statusTone(c.status);
                    const bar = c.accentColor ?? toneClass[t].stroke;
                    return (
                      <li key={c.id}>
                        <InsightPopover
                          align="center"
                          className="w-full"
                          content={
                            <div className="space-y-2.5">
                              <InsightBody
                                title={c.name}
                                value={`${c.score}%`}
                                caption={`${c.status} · compliance score`}
                                rows={[
                                  { label: "Missing", value: c.missing },
                                  { label: "Expiring soon", value: c.expiring, tone: "text-warn" },
                                  { label: "Expired", value: c.expired, tone: "text-danger" },
                                ]}
                              />
                              <Link href={`/documents?company=${c.id}`} className="flex items-center justify-center gap-1 rounded-lg bg-accent/10 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20">
                                Open documents <ArrowRight size={12} />
                              </Link>
                            </div>
                          }
                        >
                          <div
                            className={cn(
                              "group flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 transition-colors hover:bg-bg-muted/45",
                              c.status === "Risk" && "bg-danger-soft/15"
                            )}
                          >
                            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: bar }} />
                            <span className="w-[30%] shrink-0 truncate text-xs font-medium group-hover:text-accent">{c.name}</span>
                            <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-bg-subtle/80 ring-1 ring-border/40">
                              <span
                                className="absolute inset-y-0 left-0 rounded-full"
                                style={{
                                  width: `${Math.max(c.score, 2)}%`,
                                  background: `linear-gradient(90deg, ${bar}55, ${bar})`,
                                  boxShadow: `0 0 8px ${bar}80`,
                                }}
                              />
                            </span>
                            <span className={cn("w-8 shrink-0 text-right text-xs font-semibold tabular", toneClass[t].text)}>{c.score}%</span>
                          </div>
                        </InsightPopover>
                      </li>
                    );
                  })}
                </ul>
              )}
              {rankedGauges.length > 5 && (
                <button
                  type="button"
                  onClick={() => setShowAllCos((v) => !v)}
                  className="mt-1.5 w-full rounded-lg py-1 text-[11px] font-medium text-fg-muted transition-colors hover:bg-bg-muted/40 hover:text-accent"
                >
                  {showAllCos ? "Show fewer" : `Show all ${rankedGauges.length} companies`}
                </button>
              )}
            </div>
          </div>
        </Panel>

        {/* The One Thing */}
        <Panel className="p-4 sm:p-5">
          <SectionLabel
            icon={<Target size={13} />}
            action={
              clearedToday > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-success-soft/60 px-2 py-0.5 text-[11px] font-semibold text-success ring-1 ring-success/20">
                  <CheckCircle2 size={11} /> {clearedToday} cleared today
                </span>
              ) : undefined
            }
          >
            {hasPlan ? "Morning run" : "Today's priority"}
          </SectionLabel>
          {lead ? (
            <div className={cn("mt-3 flex flex-col gap-3 rounded-2xl p-3 ring-1 sm:flex-row sm:items-start", toneClass[lead.tone].bg, toneClass[lead.tone].ring)}>
              <CommandIcon tone={lead.tone} />
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <h2 className="min-w-0 text-lg font-semibold leading-tight">{lead.title}</h2>
                  {typeof lead.count === "number" && (
                    <Badge tone={lead.tone === "danger" ? "danger" : lead.tone === "warn" ? "warn" : "accent"}>{lead.count}</Badge>
                  )}
                </div>
                <p className="mt-1 text-sm text-fg-muted leading-relaxed">{lead.detail}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {lead.automationAction ? (
                    <AutomationActionButton action={lead.automationAction} label={lead.actionLabel} />
                  ) : (
                    <LinkButton href={lead.href} variant="primary" size="sm">
                      {lead.actionLabel} <ArrowRight size={13} />
                    </LinkButton>
                  )}
                  <PlanMyDayButton />
                </div>
              </div>
            </div>
          ) : !hasPlan ? (
            <div className="mt-3 rounded-2xl bg-success-soft/30 px-4 py-6 text-center ring-1 ring-success/20">
              <CheckCircle2 size={24} className="mx-auto text-success" />
              <p className="mt-2 text-sm font-medium">The desk is clear.</p>
              <p className="mt-1 text-xs text-fg-muted">No urgent work is asking for attention right now.</p>
            </div>
          ) : null}

          {/* Morning run — pre-prepared work to approve, one item at a time */}
          {hasPlan && <MorningRun items={morningPlan} />}

          {/* Up next — the following priorities, as quick links */}
          {rest.length > 0 && (
            <div className="mt-3 border-t border-border/60 pt-3">
              <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-fg-subtle">Up next</div>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {rest.map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    className="group relative flex items-center gap-2.5 overflow-hidden rounded-xl bg-bg-subtle/50 py-2 pl-3 pr-2.5 ring-1 ring-border/50 transition-all hover:-translate-y-0.5 hover:ring-accent/25"
                  >
                    <span
                      aria-hidden
                      className="absolute inset-y-1.5 left-0 w-1 rounded-full"
                      style={{ background: toneClass[item.tone].stroke, boxShadow: `0 0 8px ${toneClass[item.tone].stroke}` }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium group-hover:text-accent">{item.title}</span>
                    </span>
                    {typeof item.count === "number" && (
                      <span className={cn("shrink-0 rounded-full px-1.5 text-[11px] font-semibold tabular", toneClass[item.tone].bg, toneClass[item.tone].text)}>{item.count}</span>
                    )}
                    <ChevronRight size={14} className="shrink-0 -translate-x-1 text-fg-subtle opacity-0 transition-all group-hover:translate-x-0 group-hover:text-accent group-hover:opacity-100" />
                  </Link>
                ))}
              </div>
            </div>
          )}
        </Panel>
      </section>

      {/* ===================== FOCUS QUEUE ===================== */}
      <Panel className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-accent-soft/70 text-accent ring-1 ring-accent/20">
              <ListChecks size={16} />
            </span>
            <div>
              <h2 className="text-sm font-semibold leading-tight">Focus queue</h2>
              <p className="text-xs text-fg-muted">Everything asking for attention, in one place.</p>
            </div>
          </div>
          <Link href="/?tab=tasks" className="hidden items-center gap-1 text-xs text-fg-muted hover:text-accent sm:inline-flex">
            All tasks <ArrowRight size={12} />
          </Link>
        </div>

        {/* Segmented filter */}
        {queue.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto border-b border-border/50 px-3 py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {segments.map((s) => {
              const active = filter === s.key;
              const ChipIcon = s.key === "all" ? Layers : groupMeta[s.key].icon;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => {
                    setFilter(s.key);
                    setShowAll(false);
                  }}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-full py-1.5 pl-2 pr-3 text-xs font-medium transition-all active:scale-95",
                    active
                      ? "bg-accent text-accent-fg shadow-sm ring-1 ring-accent/40"
                      : "bg-bg-subtle/60 text-fg-muted ring-1 ring-border/50 hover:-translate-y-px hover:text-fg hover:ring-border"
                  )}
                >
                  <ChipIcon size={13} className={active ? "opacity-90" : "opacity-70"} />
                  {s.label}
                  <span
                    className={cn(
                      "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular",
                      active ? "bg-white/25" : "bg-bg-elev/80 ring-1 ring-border/50"
                    )}
                  >
                    {s.n}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="px-4 py-14 text-center">
            <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-success-soft/50 text-success ring-1 ring-success/20">
              <CheckCircle2 size={24} />
            </span>
            <p className="mt-3 text-sm font-medium">Nothing in this view</p>
            <p className="mt-0.5 text-xs text-fg-muted">Good place to be.</p>
          </div>
        ) : filter === "all" ? (
          // Grouped by area with quiet section headers.
          <div className="px-2 py-2">
            {(Object.keys(groupMeta) as QueueGroup[])
              .map((g) => ({ g, items: shown.filter((it) => it.group === g) }))
              .filter((x) => x.items.length > 0)
              .map(({ g, items }) => {
                const GIcon = groupMeta[g].icon;
                return (
                  <div key={g} className="mb-1 last:mb-0">
                    <div className="flex items-center gap-1.5 px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
                      <GIcon size={11} /> {groupMeta[g].label}
                      <span className="text-fg-subtle/70">· {items.length}</span>
                    </div>
                    <ul>
                      {items.map((item, i) => (
                        <QueueRow key={item.id} item={item} index={i} />
                      ))}
                    </ul>
                  </div>
                );
              })}
          </div>
        ) : (
          <ul className="px-2 py-2">
            {shown.map((item, i) => (
              <QueueRow key={item.id} item={item} index={i} />
            ))}
          </ul>
        )}

        {filtered.length > 6 && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="flex w-full items-center justify-center gap-1.5 border-t border-border/50 py-2.5 text-xs font-medium text-fg-muted transition-colors hover:bg-bg-muted/40 hover:text-accent"
          >
            {showAll ? "Show less" : `Show all ${filtered.length}`}
            <ChevronRight size={13} className={cn("transition-transform", showAll ? "-rotate-90" : "rotate-90")} />
          </button>
        )}
      </Panel>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  FileWarning,
  Landmark,
  LayoutGrid,
  Send,
  Sparkles,
  Target,
  Users,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Badge, LinkButton } from "@/components/ui";
import { AutomationActionButton } from "@/components/automation-action-button";
import { PlanMyDayButton } from "@/components/plan-my-day-button";
import { Hero, Panel, SectionLabel, TrendChip, TONE, type Tone } from "@/components/surface-kit";

const toneClass = TONE;

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

function CommandIcon({ tone }: { tone: Tone }) {
  const Icon = tone === "danger" ? AlertTriangle : tone === "warn" ? CalendarClock : tone === "success" ? CheckCircle2 : Sparkles;
  return (
    <span className={cn("inline-flex h-9 w-9 items-center justify-center rounded-xl ring-1", toneClass[tone].bg, toneClass[tone].ring)}>
      <Icon size={17} className={toneClass[tone].text} />
    </span>
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
}: {
  greeting: string;
  dateLabel: string;
  command: CommandAction[];
  pulse: PulseMetric[];
  queue: QueueItem[];
  health: number;
  healthStats: { missing: number; expiring: number; expired: number };
  healthDelta: number | null;
  companyGauges: CompanyGauge[];
}) {
  const lead = command[0];
  const rest = command.slice(1, 5);
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
            <LinkButton href="/?capture=open" variant="primary" size="sm">
              <Sparkles size={14} /> Create
            </LinkButton>
            <LinkButton href="/brief" variant="secondary" size="sm">
              <BriefcaseBusiness size={14} /> Director Brief
            </LinkButton>
          </>
        }
      >
        {/* Metric rail — horizontal scroll on mobile, no stacking */}
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {pulse.map((m) => (
            <div
              key={m.label}
              className="min-w-[92px] flex-1 shrink-0 rounded-2xl bg-bg-elev/70 px-3 py-2.5 ring-1 ring-border/60 backdrop-blur-sm"
            >
              <div className="flex items-baseline justify-between gap-1">
                <CountUp value={m.value} className={cn("block text-xl font-semibold tabular leading-none", m.tone ? toneClass[m.tone].text : "text-fg")} />
                {m.trend && <TrendChip delta={m.trend.delta} goodWhenDown={m.trend.goodWhenDown} />}
              </div>
              <span className="mt-1 block text-[11px] leading-tight text-fg-muted">{m.label}</span>
            </div>
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

          <div className="mt-3 grid gap-4 sm:grid-cols-[minmax(150px,0.62fr)_minmax(0,1fr)]">
            {/* Headline arc gauge + micro-stats */}
            <div className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-bg-elev/55 px-3 py-3 ring-1 ring-border/50">
              <div className="relative grid place-items-center">
                <ArcGauge percent={health} color={toneClass[healthTone].stroke} />
                <div className="absolute bottom-0 flex flex-col items-center">
                  <div className="flex items-baseline">
                    <CountUp value={health} className={cn("text-3xl font-semibold tabular leading-none", toneClass[healthTone].text)} />
                    <span className={cn("text-lg font-semibold", toneClass[healthTone].text)}>%</span>
                  </div>
                  <span className="mt-0.5 text-[11px] font-medium text-fg-muted">
                    {health >= 80 ? "Healthy" : health >= 55 ? "Watch" : "At risk"}
                  </span>
                </div>
              </div>
              <div className="grid w-full grid-cols-3 gap-1.5">
                {([
                  { label: "Missing", value: healthStats.missing, tone: "muted" as Tone },
                  { label: "Expiring", value: healthStats.expiring, tone: "warn" as Tone },
                  { label: "Expired", value: healthStats.expired, tone: "danger" as Tone },
                ]).map((s) => (
                  <div key={s.label} className="rounded-xl bg-bg-subtle/60 px-1.5 py-1.5 text-center ring-1 ring-border/50">
                    <div className={cn("text-base font-semibold tabular leading-none", s.value ? toneClass[s.tone].text : "text-fg-subtle")}>{s.value}</div>
                    <div className="mt-1 text-[10px] leading-tight text-fg-muted">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Ranked company league */}
            <div className="min-w-0">
              {rankedGauges.length === 0 ? (
                <p className="grid h-full place-items-center text-xs text-fg-muted">No company compliance data yet.</p>
              ) : (
                <ul className="space-y-1">
                  {visibleGauges.map((c) => {
                    const t = statusTone(c.status);
                    const bar = c.accentColor ?? toneClass[t].stroke;
                    return (
                      <li key={c.id}>
                        <Link
                          href={`/documents?company=${c.id}`}
                          className={cn(
                            "group flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition-colors hover:bg-bg-muted/45",
                            c.status === "Risk" && "bg-danger-soft/15"
                          )}
                        >
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: bar }} />
                          <span className="w-[34%] shrink-0 truncate text-xs font-medium group-hover:text-accent">{c.name}</span>
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
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
              {rankedGauges.length > 5 && (
                <button
                  type="button"
                  onClick={() => setShowAllCos((v) => !v)}
                  className="mt-1.5 w-full rounded-lg py-1 text-[11px] font-medium text-fg-muted transition-colors hover:bg-bg-muted/40"
                >
                  {showAllCos ? "Show fewer" : `Show all ${rankedGauges.length} companies`}
                </button>
              )}
            </div>
          </div>
        </Panel>

        {/* The One Thing */}
        <Panel className="p-4 sm:p-5">
          <SectionLabel icon={<Target size={13} />}>Today's priority</SectionLabel>
          {lead ? (
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start">
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
          ) : (
            <div className="mt-3 rounded-2xl bg-bg-subtle/60 px-4 py-6 text-center ring-1 ring-border/60">
              <CheckCircle2 size={24} className="mx-auto text-success" />
              <p className="mt-2 text-sm font-medium">The desk is clear.</p>
              <p className="mt-1 text-xs text-fg-muted">No urgent work is asking for attention right now.</p>
            </div>
          )}

          {/* At-a-glance — the next few commands, compact */}
          {rest.length > 0 && (
            <div className="mt-4 grid gap-2 border-t border-border/60 pt-3 sm:grid-cols-2">
              {rest.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className="group flex items-center gap-2.5 rounded-xl bg-bg-subtle/50 px-2.5 py-2 ring-1 ring-border/50 transition-all hover:ring-accent/25"
                >
                  <span className={cn("h-7 w-1 shrink-0 rounded-full", toneClass[item.tone].bar)} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium group-hover:text-accent">{item.title}</span>
                  </span>
                  {typeof item.count === "number" && (
                    <span className={cn("shrink-0 text-xs font-semibold tabular", toneClass[item.tone].text)}>{item.count}</span>
                  )}
                </Link>
              ))}
            </div>
          )}
        </Panel>
      </section>

      {/* ===================== FOCUS QUEUE ===================== */}
      <Panel className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold">Focus queue</h2>
            <p className="text-xs text-fg-muted">Everything asking for attention, in one place.</p>
          </div>
          <Link href="/?tab=tasks" className="hidden items-center gap-1 text-xs text-fg-muted hover:text-accent sm:inline-flex">
            All tasks <ArrowRight size={12} />
          </Link>
        </div>

        {/* Segmented filter */}
        {queue.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto border-b border-border/50 px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {segments.map((s) => {
              const active = filter === s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => {
                    setFilter(s.key);
                    setShowAll(false);
                  }}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-full py-1 pl-2 pr-2.5 text-xs font-medium transition-all",
                    active ? "bg-accent-soft/70 text-accent ring-1 ring-accent/30" : "bg-bg-subtle/60 text-fg-muted ring-1 ring-border/50 hover:ring-border"
                  )}
                >
                  <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-white/40 px-1 text-[10px] font-semibold tabular dark:bg-black/25">
                    {s.n}
                  </span>
                  {s.label}
                </button>
              );
            })}
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <CheckCircle2 size={26} className="mx-auto text-success" />
            <p className="mt-2 text-sm text-fg-muted">Nothing in this view. Good place to be.</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {shown.map((item) => {
              const Icon = groupMeta[item.group].icon;
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className="group relative flex items-center gap-3 py-3 pl-4 pr-4 transition-colors hover:bg-bg-muted/45"
                >
                  <span className={cn("absolute inset-y-0 left-0 w-[3px]", toneClass[item.tone].bar)} />
                  <span className={cn("inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ring-1", toneClass[item.tone].bg, toneClass[item.tone].ring)}>
                    <Icon size={15} className={toneClass[item.tone].text} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium group-hover:text-accent transition-colors">{item.title}</span>
                    <span className="mt-0.5 block truncate text-xs text-fg-muted">{item.meta}</span>
                  </span>
                  {item.due && <span className={cn("shrink-0 text-[11px] font-medium tabular", toneClass[item.tone].text)}>{item.due}</span>}
                </Link>
              );
            })}
          </div>
        )}

        {filtered.length > 6 && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="flex w-full items-center justify-center gap-1.5 border-t border-border/50 py-2.5 text-xs font-medium text-fg-muted transition-colors hover:bg-bg-muted/40"
          >
            {showAll ? "Show less" : `Show all ${filtered.length}`}
            <ArrowRight size={13} className={cn("transition-transform", showAll ? "-rotate-90" : "rotate-90")} />
          </button>
        )}
      </Panel>
    </div>
  );
}

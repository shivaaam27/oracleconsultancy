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

type Tone = "danger" | "warn" | "accent" | "success" | "muted";

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

export type PulseMetric = {
  label: string;
  value: number;
  tone?: Tone;
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

const toneClass: Record<Tone, { text: string; bg: string; ring: string; bar: string; stroke: string }> = {
  danger: { text: "text-danger", bg: "bg-danger-soft/60", ring: "ring-danger/20", bar: "bg-danger", stroke: "hsl(var(--danger))" },
  warn: { text: "text-warn", bg: "bg-warn-soft/60", ring: "ring-warn/20", bar: "bg-warn", stroke: "hsl(var(--warn))" },
  accent: { text: "text-accent", bg: "bg-accent-soft/70", ring: "ring-accent/20", bar: "bg-accent", stroke: "hsl(var(--accent))" },
  success: { text: "text-success", bg: "bg-success-soft/70", ring: "ring-success/20", bar: "bg-success", stroke: "hsl(var(--success))" },
  muted: { text: "text-fg-muted", bg: "bg-bg-subtle/70", ring: "ring-border/60", bar: "bg-fg-subtle", stroke: "hsl(var(--fg-subtle))" },
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

/* ---- a single SVG progress ring ---- */
function Ring({
  percent,
  size,
  stroke,
  color,
  children,
}: {
  percent: number;
  size: number;
  stroke: number;
  color: string;
  children?: React.ReactNode;
}) {
  const animated = useCountUp(percent, 1100);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (animated / 100) * c;
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--border))" strokeOpacity={0.5} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.2s linear" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
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
  companyGauges,
}: {
  greeting: string;
  dateLabel: string;
  command: CommandAction[];
  pulse: PulseMetric[];
  queue: QueueItem[];
  health: number;
  companyGauges: CompanyGauge[];
}) {
  const lead = command[0];
  const rest = command.slice(1, 5);
  const healthTone: Tone = health >= 80 ? "success" : health >= 55 ? "warn" : "danger";

  const [gaugeView, setGaugeView] = useState<"overall" | "company">("overall");
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
      <section className="relative w-full overflow-hidden rounded-3xl glass elevated p-4 sm:p-6">
        {/* Aurora mesh */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div
            className="aurora-a absolute -right-24 -top-28 h-80 w-80 rounded-full blur-3xl"
            style={{ background: "radial-gradient(circle, hsl(var(--accent) / 0.28), transparent 70%)" }}
          />
          <div
            className="aurora-b absolute -bottom-32 -left-24 h-72 w-72 rounded-full blur-3xl"
            style={{ background: "radial-gradient(circle, hsl(var(--info) / 0.22), transparent 72%)" }}
          />
          <div
            className="aurora-a absolute left-1/3 top-10 h-56 w-56 rounded-full blur-3xl"
            style={{ background: `radial-gradient(circle, hsl(var(--${healthTone === "success" ? "success" : healthTone}) / 0.14), transparent 72%)` }}
          />
        </div>

        <div className="relative flex flex-col gap-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight leading-tight">{greeting}</h1>
              <p className="mt-1 text-sm text-fg-muted">{dateLabel}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <LinkButton href="/?capture=open" variant="primary" size="sm">
                <Sparkles size={14} /> Create
              </LinkButton>
              <LinkButton href="/brief" variant="secondary" size="sm">
                <BriefcaseBusiness size={14} /> Director Brief
              </LinkButton>
            </div>
          </div>

          {/* Metric rail — horizontal scroll on mobile, no stacking */}
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {pulse.map((m) => (
              <div
                key={m.label}
                className="min-w-[88px] flex-1 shrink-0 rounded-2xl bg-bg-elev/70 px-3 py-2.5 ring-1 ring-border/60 backdrop-blur-sm"
              >
                <CountUp value={m.value} className={cn("block text-xl font-semibold tabular leading-none", m.tone ? toneClass[m.tone].text : "text-fg")} />
                <span className="mt-1 block text-[11px] leading-tight text-fg-muted">{m.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* =================== HEALTH + THE ONE THING =================== */}
      <section className="grid gap-4 lg:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]">
        {/* Portfolio health — both gauge variants behind a toggle */}
        <div className="rounded-3xl glass elevated p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.08em] text-fg-muted">
              <LayoutGrid size={13} /> Portfolio health
            </div>
            <div className="inline-flex rounded-full bg-bg-subtle/70 p-0.5 ring-1 ring-border/60">
              {(["overall", "company"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setGaugeView(v)}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[11px] font-medium capitalize transition-colors",
                    gaugeView === v ? "bg-bg-elev text-fg shadow-sm ring-1 ring-border" : "text-fg-muted hover:text-fg"
                  )}
                >
                  {v === "overall" ? "Overall" : "By company"}
                </button>
              ))}
            </div>
          </div>

          {gaugeView === "overall" ? (
            <div className="mt-4 flex items-center gap-5">
              <Ring percent={health} size={120} stroke={11} color={toneClass[healthTone].stroke}>
                <div className="text-center">
                  <CountUp value={health} className={cn("text-2xl font-semibold tabular", toneClass[healthTone].text)} />
                  <span className={cn("text-lg font-semibold tabular", toneClass[healthTone].text)}>%</span>
                </div>
              </Ring>
              <div className="min-w-0 space-y-1.5">
                <p className="text-sm font-medium">
                  {health >= 80 ? "Portfolio is healthy" : health >= 55 ? "Some attention needed" : "Needs urgent attention"}
                </p>
                <p className="text-xs text-fg-muted leading-relaxed">
                  Average compliance across all companies and people. Switch to <span className="font-medium">By company</span> to see where the gaps are.
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
              {companyGauges.length === 0 ? (
                <p className="col-span-full text-xs text-fg-muted">No company compliance data yet.</p>
              ) : (
                companyGauges.map((c) => {
                  const t = statusTone(c.status);
                  return (
                    <Link
                      key={c.id}
                      href={`/documents?company=${c.id}`}
                      className="group flex flex-col items-center gap-1.5 rounded-2xl p-1.5 transition-colors hover:bg-bg-muted/40"
                    >
                      <Ring percent={c.score} size={56} stroke={6} color={c.accentColor ?? toneClass[t].stroke}>
                        <span className={cn("text-[11px] font-semibold tabular", toneClass[t].text)}>{c.score}</span>
                      </Ring>
                      <span className="max-w-full truncate text-[11px] font-medium text-fg-muted group-hover:text-accent">{c.name}</span>
                    </Link>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* The One Thing */}
        <div className="rounded-3xl bg-bg-elev ring-1 ring-border elevated p-4 sm:p-5">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.08em] text-fg-muted">
            <Target size={13} /> Today's priority
          </div>
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
        </div>
      </section>

      {/* ===================== FOCUS QUEUE ===================== */}
      <section className="rounded-3xl bg-bg-elev ring-1 ring-border elevated overflow-hidden">
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
      </section>
    </div>
  );
}

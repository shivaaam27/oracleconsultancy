import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  FileWarning,
  MessageSquareText,
  Send,
  Sparkles,
  Target,
  TimerReset,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Badge, LinkButton } from "@/components/ui";
import { AutomationActionButton } from "@/components/automation-action-button";

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
  value: string | number;
  tone?: Tone;
};

export type FocusItem = {
  id: string;
  title: string;
  meta: string;
  href: string;
  kind: "task" | "todo" | "document" | "draft" | "meeting";
  tone: Tone;
  due?: string | null;
};

export type MovementItem = {
  id: string;
  title: string;
  meta: string;
  href?: string;
  tone: Tone;
};

const toneClass: Record<Tone, { text: string; bg: string; border: string; dot: string }> = {
  danger: { text: "text-danger", bg: "bg-danger-soft/60", border: "ring-danger/20", dot: "bg-danger" },
  warn: { text: "text-warn", bg: "bg-warn-soft/60", border: "ring-warn/20", dot: "bg-warn" },
  accent: { text: "text-accent", bg: "bg-accent-soft/70", border: "ring-accent/20", dot: "bg-accent" },
  success: { text: "text-success", bg: "bg-success-soft/70", border: "ring-success/20", dot: "bg-success" },
  muted: { text: "text-fg-muted", bg: "bg-bg-subtle/70", border: "ring-border/60", dot: "bg-fg-subtle" },
};

const kindIcon = {
  task: ClipboardList,
  todo: CheckCircle2,
  document: FileWarning,
  draft: Send,
  meeting: MessageSquareText,
} as const;

function CommandIcon({ tone }: { tone: Tone }) {
  const Icon = tone === "danger" ? AlertTriangle : tone === "warn" ? CalendarClock : tone === "success" ? CheckCircle2 : Sparkles;
  return (
    <span className={cn("inline-flex h-8 w-8 items-center justify-center rounded-xl ring-1", toneClass[tone].bg, toneClass[tone].border)}>
      <Icon size={16} className={toneClass[tone].text} />
    </span>
  );
}

function EmptyCommand() {
  return (
    <div className="rounded-2xl bg-bg-elev/80 ring-1 ring-border px-4 py-5 text-center">
      <CheckCircle2 size={24} className="mx-auto text-success" />
      <p className="mt-2 text-sm font-medium">The desk is clear.</p>
      <p className="mt-1 text-xs text-fg-muted">No urgent work is asking for attention right now.</p>
    </div>
  );
}

export function HomeIntelligence({
  greeting,
  dateLabel,
  command,
  pulse,
  focus,
  movement,
}: {
  greeting: string;
  dateLabel: string;
  command: CommandAction[];
  pulse: PulseMetric[];
  focus: FocusItem[];
  movement: MovementItem[];
}) {
  const lead = command[0];

  return (
    <div className="max-w-full space-y-4 overflow-hidden">
      <section className="relative w-full max-w-full overflow-hidden rounded-3xl glass elevated p-4 sm:p-5">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full blur-3xl"
          style={{ background: "radial-gradient(circle, hsl(var(--accent) / 0.22), transparent 70%)" }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-28 -left-24 h-64 w-64 rounded-full blur-3xl"
          style={{ background: "radial-gradient(circle, hsl(var(--info) / 0.16), transparent 72%)" }}
        />

        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
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

        <div className="relative mt-5 grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)]">
          <div className="min-w-0 rounded-2xl bg-bg-elev/85 ring-1 ring-border p-3 sm:p-4">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.08em] text-fg-muted">
              <Target size={13} /> Today's command
            </div>
            {lead ? (
              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start">
                <CommandIcon tone={lead.tone} />
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <h2 className="min-w-0 text-lg font-semibold leading-tight">{lead.title}</h2>
                    {typeof lead.count === "number" && <Badge tone={lead.tone === "danger" ? "danger" : lead.tone === "warn" ? "warn" : "accent"}>{lead.count}</Badge>}
                  </div>
                  <p className="mt-1 max-w-[18rem] pr-1 text-sm text-fg-muted leading-relaxed sm:max-w-[34rem]">{lead.detail}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {lead.automationAction ? (
                      <AutomationActionButton action={lead.automationAction} label={lead.actionLabel} />
                    ) : (
                      <LinkButton href={lead.href} variant="primary" size="sm">
                        {lead.actionLabel} <ArrowRight size={13} />
                      </LinkButton>
                    )}
                    <LinkButton href="/ask" variant="secondary" size="sm">
                      <Bot size={13} /> Plan my day
                    </LinkButton>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-3">
                <EmptyCommand />
              </div>
            )}
          </div>

          <div className="min-w-0 rounded-2xl bg-bg-elev/75 ring-1 ring-border p-3 sm:p-4">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.08em] text-fg-muted">
              <TimerReset size={13} /> Portfolio pulse
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {pulse.map((m) => (
                <div key={m.label} className="rounded-xl bg-bg-subtle/65 px-3 py-2 ring-1 ring-border/60">
                  <div className={cn("text-xl font-semibold tabular", m.tone ? toneClass[m.tone].text : "text-fg")}>{m.value}</div>
                  <div className="mt-0.5 text-[11px] text-fg-muted leading-tight">{m.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {command.length > 1 && (
        <section className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {command.slice(1, 5).map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className="group rounded-2xl bg-bg-elev ring-1 ring-border p-3 elevated hover:-translate-y-0.5 hover:ring-accent/25 transition-all"
            >
              <div className="flex items-start gap-3">
                <CommandIcon tone={item.tone} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    {typeof item.count === "number" && <span className={cn("ml-auto text-xs font-semibold tabular", toneClass[item.tone].text)}>{item.count}</span>}
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-fg-muted leading-snug">{item.detail}</p>
                </div>
              </div>
            </Link>
          ))}
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
        <div className="rounded-3xl bg-bg-elev ring-1 ring-border elevated overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">Focus queue</h2>
              <p className="text-xs text-fg-muted">Work through this list first.</p>
            </div>
            <Link href="/?tab=tasks" className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-accent">
              Tasks <ArrowRight size={12} />
            </Link>
          </div>
          {focus.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <CheckCircle2 size={24} className="mx-auto text-success" />
              <p className="mt-2 text-sm text-fg-muted">No priority items in the queue.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {focus.slice(0, 10).map((item) => {
                const Icon = kindIcon[item.kind];
                return (
                  <Link key={item.id} href={item.href} className="group flex items-center gap-3 px-4 py-3 hover:bg-bg-muted/45 transition-colors">
                    <span className={cn("inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ring-1", toneClass[item.tone].bg, toneClass[item.tone].border)}>
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
        </div>

        <div className="rounded-3xl bg-bg-elev ring-1 ring-border elevated overflow-hidden">
          <div className="border-b border-border/70 px-4 py-3">
            <h2 className="text-sm font-semibold">Recent movement</h2>
            <p className="text-xs text-fg-muted">A short trace of what changed.</p>
          </div>
          {movement.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-fg-muted">No recent movement yet.</div>
          ) : (
            <div className="divide-y divide-border/60">
              {movement.slice(0, 7).map((item) => {
                const body = (
                  <span className="flex items-start gap-2 px-4 py-3">
                    <span className={cn("mt-1.5 h-2 w-2 rounded-full shrink-0", toneClass[item.tone].dot)} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm">{item.title}</span>
                      <span className="mt-0.5 block truncate text-xs text-fg-muted">{item.meta}</span>
                    </span>
                  </span>
                );
                return item.href ? (
                  <Link key={item.id} href={item.href} className="block hover:bg-bg-muted/45 transition-colors">
                    {body}
                  </Link>
                ) : (
                  <div key={item.id}>{body}</div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

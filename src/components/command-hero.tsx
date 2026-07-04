"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, ListChecks, Sparkles, Target, Zap } from "lucide-react";
import { cn } from "@/lib/cn";
import { useToast } from "@/components/toast";
import { CockpitLive } from "@/components/cockpit-live";
import { TONE, type Tone } from "@/components/surface-kit";
import { runAutomationsNowAction, sendBriefNowAction } from "@/app/_hub/control-actions";

/* Command Centre hero strip — the owner-grade twin of the portal BoardHero
 * (aurora glass, live dot, avatar, slim one-line stats pill). Health is a plain
 * tinted figure inside the pill (the big ring was retired, owner's call); the
 * quick actions (Run · Brief · Approvals) live here as hero chips instead of
 * inside the Controls card. Part of the Command Centre unification —
 * memory/command_centre_unification.md. */

function ActionChip({
  onClick,
  href,
  icon,
  label,
  badge,
  busy,
}: {
  onClick?: () => void;
  href?: string;
  icon: React.ReactNode;
  label: string;
  badge?: number;
  busy?: boolean;
}) {
  const cls =
    "inline-flex shrink-0 items-center gap-1.5 rounded-full bg-bg-elev/70 px-3 py-1.5 text-xs font-medium text-fg-muted ring-1 ring-border transition-all hover:-translate-y-0.5 hover:text-fg hover:ring-accent/30 disabled:cursor-wait disabled:opacity-60";
  const inner = (
    <>
      {icon}
      <span className="whitespace-nowrap">{label}</span>
      {badge != null && badge > 0 && (
        <span className="inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold tabular text-white">
          {badge}
        </span>
      )}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={cls}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={busy} className={cls}>
      {inner}
    </button>
  );
}

export function CommandHero({
  greeting,
  name,
  subtitle,
  initials,
  open,
  overdue,
  dueToday,
  health,
  healthTone,
  healthSub,
  oriLine,
  pendingApprovals,
}: {
  greeting: string;
  name: string;
  subtitle: string;
  initials: string;
  open: number;
  overdue: number;
  dueToday: number;
  health: number;
  healthTone: Tone;
  healthSub: string;
  oriLine: string;
  pendingApprovals: number;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  function fire(key: string, action: () => Promise<{ ok: true; message: string } | { ok: false; error: string }>) {
    setBusy(key);
    startTransition(async () => {
      const res = await action();
      setBusy(null);
      if (!res.ok) {
        toast(res.error, { tone: "warn", duration: 4000 });
        return;
      }
      toast(res.message, { tone: "success", duration: 4000 });
      router.refresh();
    });
  }

  return (
    <section className="relative w-full overflow-hidden rounded-3xl glass elevated p-5 sm:p-6">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="aurora-a absolute -right-20 -top-24 h-72 w-72 rounded-full blur-3xl" style={{ background: "radial-gradient(circle, hsl(var(--accent) / 0.30), transparent 70%)" }} />
        <div className="aurora-b absolute -bottom-28 -left-20 h-64 w-64 rounded-full blur-3xl" style={{ background: "radial-gradient(circle, hsl(var(--success) / 0.16), transparent 72%)" }} />
      </div>

      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-fg-subtle">Command Centre</p>
            <CockpitLive />
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            {greeting}, {name}
          </h1>
          <p className="mt-1.5 text-sm text-fg-muted">{subtitle}</p>
        </div>
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent-soft text-sm font-semibold text-accent ring-1 ring-accent/25">
          {initials}
        </span>
      </div>

      {/* Quick actions — the engine, one tap from the top of the house. */}
      <div className="relative mt-3.5 flex flex-wrap items-center gap-2">
        <ActionChip
          icon={<Zap size={13} className="text-accent" />}
          label="Run automations"
          busy={busy === "run"}
          onClick={() => fire("run", runAutomationsNowAction)}
        />
        <ActionChip
          icon={<FileText size={13} className="text-accent" />}
          label="Send Brief"
          busy={busy === "brief"}
          onClick={() => fire("brief", sendBriefNowAction)}
        />
        <ActionChip icon={<ListChecks size={13} className="text-accent" />} label="Approvals" badge={pendingApprovals} href="/approvals" />
      </div>

      {/* Slim stats pill — same grammar as the portal heroes. Health is a plain
          tinted figure (tap → Insights); ORI's read sits on its own line. */}
      <div className="relative mt-3 rounded-2xl bg-bg-elev/55 px-3.5 py-2.5 ring-1 ring-border">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-muted">
          <Target size={14} className="shrink-0 text-accent" />
          <p className="min-w-0">
            <b className="font-semibold text-fg tabular">{open}</b> open ·{" "}
            <b className={cn("font-semibold tabular", overdue > 0 ? "text-danger" : "text-fg")}>{overdue}</b> overdue ·{" "}
            <b className={cn("font-semibold tabular", dueToday > 0 ? "text-warn" : "text-fg")}>{dueToday}</b> due today
          </p>
          <Link
            href="/insights"
            className="ml-auto inline-flex shrink-0 items-baseline gap-1.5 transition-colors hover:text-fg"
            title="Portfolio health — open Insights"
          >
            <span className={cn("font-semibold tabular", TONE[healthTone].text)}>{health}%</span>
            <span className="text-xs text-fg-subtle">{healthSub}</span>
          </Link>
        </div>
        <p className="mt-1.5 flex items-start gap-1.5 text-[13px] leading-relaxed text-accent">
          <Sparkles size={13} className="mt-0.5 shrink-0" />
          <span className="min-w-0">{oriLine}</span>
        </p>
      </div>
    </section>
  );
}

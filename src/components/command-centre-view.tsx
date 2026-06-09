"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarClock, Plane, Building2, User as UserIcon, CheckCircle2, Circle,
  Plus, Loader2, ExternalLink, ListChecks,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useToast } from "./toast";
import { FLAG_META, daysLabel, type CcFlag } from "@/lib/command-centre";
import { tickHabitAction, createTaskFromObligationAction } from "@/app/hrms/command-centre/actions";

type Habit = {
  id: number;
  label: string;
  frequency: "daily" | "weekly";
  dueRule: string | null;
  why: string | null;
  lastDone: string | null;
  fresh: boolean;
};
type Deadline = {
  id: number;
  label: string;
  companyId: number | null;
  frequency: string;
  category: string;
  why: string | null;
  dueDate: string | null;
  daysLeft: number | null;
  flag: CcFlag;
  taskable: boolean;
};
type Permit = {
  id: number;
  title: string;
  ownerName: string | null;
  category: string | null;
  expiryDate: string | null;
  daysLeft: number | null;
  flag: CcFlag;
};
type Registration = {
  ownerId: number;
  ownerName: string;
  accent: string | null;
  score: number;
  required: number;
  missing: number;
  expired: number;
  expiring: number;
  gaps: string[];
  flag: CcFlag;
};
type Company = { id: number; name: string; accent: string | null };
type TabKey = "deadlines" | "permits" | "registrations";

function Pill({ flag }: { flag: CcFlag }) {
  const m = FLAG_META[flag];
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1", m.bg, m.text, m.ring)}>
      {m.label}
    </span>
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function CommandCentreView({
  initial = "deadlines",
  habits,
  deadlines,
  permits,
  registrations,
  companies,
}: {
  initial?: TabKey;
  habits: Habit[];
  deadlines: Deadline[];
  permits: Permit[];
  registrations: Registration[];
  companies: Company[];
}) {
  const [tab, setTab] = useState<TabKey>(initial);
  const { toast } = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [, startAction] = useTransition();

  const companyName = (id: number | null) => companies.find((c) => c.id === id)?.name ?? "All entities";
  const companyAccent = (id: number | null) => companies.find((c) => c.id === id)?.accent ?? null;

  const tabs = [
    { key: "deadlines" as const, label: "Deadlines", icon: CalendarClock, count: deadlines.length },
    { key: "permits" as const, label: "Permit Watch", icon: Plane, count: permits.length },
    { key: "registrations" as const, label: "Registrations", icon: Building2, count: registrations.length },
  ];

  function tickHabit(id: number) {
    setBusy(`habit-${id}`);
    startAction(async () => {
      const res = await tickHabitAction(id);
      setBusy(null);
      if (res.ok) router.refresh();
      else toast(res.error, { tone: "warn" });
    });
  }
  function promote(id: number) {
    setBusy(`deadline-${id}`);
    startAction(async () => {
      const res = await createTaskFromObligationAction(id);
      setBusy(null);
      toast(res.ok ? `Task ${res.code} created` : res.error, { tone: res.ok ? "success" : "warn", duration: 4500 });
      if (res.ok) router.refresh();
    });
  }

  const dailyHabits = useMemo(() => habits.filter((h) => h.frequency === "daily"), [habits]);
  const weeklyHabits = useMemo(() => habits.filter((h) => h.frequency === "weekly"), [habits]);

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-xl bg-bg-subtle p-1 ring-1 ring-border/60">
        {tabs.map(({ key, label, icon: Icon, count }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              tab === key ? "bg-bg-elev text-fg shadow-sm" : "text-fg-muted hover:text-fg",
            )}
          >
            <Icon size={14} /> {label}
            <span className="inline-flex h-[18px] min-w-[20px] items-center justify-center rounded-full bg-bg-muted px-1 text-[11px] tabular text-fg-muted">{count}</span>
          </button>
        ))}
      </div>

      {/* ---------------- DEADLINES ---------------- */}
      {tab === "deadlines" && (
        <div className="space-y-4">
          <section className="glass elevated overflow-hidden rounded-3xl">
            <div className="border-b border-border/60 px-4 py-3 text-sm font-semibold flex items-center gap-2">
              <CalendarClock size={16} className="text-accent" /> Dated obligations
            </div>
            <div className="divide-y divide-border/40">
              {deadlines.length === 0 && <Empty label="No upcoming statutory deadlines." />}
              {deadlines.map((d) => (
                <div key={d.id} className="flex items-center gap-3 px-3.5 py-2.5">
                  {companyAccent(d.companyId)
                    ? <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: companyAccent(d.companyId)! }} />
                    : <span className="h-8 w-1.5 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{d.label}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-fg-subtle">
                      <span className="inline-flex items-center gap-1"><Building2 size={11} />{companyName(d.companyId)}</span>
                      <span className="capitalize">{d.frequency}</span>
                      <span>· {d.category}</span>
                      {d.dueDate && <span>· {fmtDate(d.dueDate)}</span>}
                    </div>
                  </div>
                  <span className="shrink-0 text-[11px] tabular text-fg-muted">{daysLabel(d.daysLeft)}</span>
                  <Pill flag={d.flag} />
                  {d.taskable && (
                    <button
                      type="button"
                      disabled={busy === `deadline-${d.id}`}
                      onClick={() => promote(d.id)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-accent/10 px-2.5 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20 disabled:opacity-50"
                      title="Create a task for this obligation"
                    >
                      {busy === `deadline-${d.id}` ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Task
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Habit tick-lists (daily/weekly routines — ticked in place) */}
          {(dailyHabits.length > 0 || weeklyHabits.length > 0) && (
            <section className="glass elevated overflow-hidden rounded-3xl">
              <div className="border-b border-border/60 px-4 py-3 text-sm font-semibold flex items-center gap-2">
                <ListChecks size={16} className="text-accent" /> Routine duties
                <span className="text-[11px] font-normal text-fg-subtle">tick as you go — they don't become tasks</span>
              </div>
              <div className="divide-y divide-border/40">
                {[...dailyHabits, ...weeklyHabits].map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    disabled={busy === `habit-${h.id}`}
                    onClick={() => tickHabit(h.id)}
                    className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-bg-muted/40 disabled:opacity-50"
                  >
                    {busy === `habit-${h.id}`
                      ? <Loader2 size={17} className="shrink-0 animate-spin text-fg-muted" />
                      : h.fresh
                        ? <CheckCircle2 size={17} className="shrink-0 text-success" />
                        : <Circle size={17} className="shrink-0 text-fg-subtle" />}
                    <div className="min-w-0 flex-1">
                      <div className={cn("truncate text-sm", h.fresh ? "text-fg-muted line-through" : "font-medium")}>{h.label}</div>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-fg-subtle">
                        <span className="capitalize">{h.frequency}</span>
                        {h.dueRule && <span>· {h.dueRule}</span>}
                        {h.lastDone && <span>· last {fmtDate(h.lastDone)}</span>}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* ---------------- PERMIT WATCH ---------------- */}
      {tab === "permits" && (
        <section className="glass elevated overflow-hidden rounded-3xl">
          <div className="border-b border-border/60 px-4 py-3 text-sm font-semibold flex items-center gap-2">
            <Plane size={16} className="text-accent" /> Work / residence permits
            <span className="text-[11px] font-normal text-fg-subtle">90 / 60 / 30-day early warning</span>
          </div>
          <div className="divide-y divide-border/40">
            {permits.length === 0 && <Empty label="No permit or immigration documents on file yet." />}
            {permits.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-3.5 py-2.5">
                <span className={cn("inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ring-1", FLAG_META[p.flag].bg, FLAG_META[p.flag].ring)}>
                  <Plane size={15} className={FLAG_META[p.flag].text} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{p.title}</div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-fg-subtle">
                    {p.ownerName && <span className="inline-flex items-center gap-1"><UserIcon size={11} />{p.ownerName}</span>}
                    {p.category && <span>· {p.category}</span>}
                    <span>· expires {fmtDate(p.expiryDate)}</span>
                  </div>
                </div>
                <span className="shrink-0 text-[11px] tabular text-fg-muted">{daysLabel(p.daysLeft)}</span>
                <Pill flag={p.flag} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ---------------- REGISTRATIONS ---------------- */}
      {tab === "registrations" && (
        <section className="glass elevated overflow-hidden rounded-3xl">
          <div className="border-b border-border/60 px-4 py-3 text-sm font-semibold flex items-center gap-2">
            <Building2 size={16} className="text-accent" /> Registrations & renewals
            <span className="text-[11px] font-normal text-fg-subtle">statutory standing per company</span>
          </div>
          <div className="divide-y divide-border/40">
            {registrations.length === 0 && <Empty label="No companies to show." />}
            {registrations.map((r) => (
              <div key={r.ownerId} className="flex items-start gap-3 px-3.5 py-3">
                {r.accent
                  ? <span className="mt-0.5 h-9 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: r.accent }} />
                  : <span className="mt-0.5 h-9 w-1.5 shrink-0" />}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{r.ownerName}</span>
                    <Pill flag={r.flag} />
                  </div>
                  <div className="mt-0.5 text-[11px] text-fg-subtle">
                    {r.score}% · {r.required - r.missing}/{r.required} on file
                    {r.expired ? ` · ${r.expired} expired` : ""}
                    {r.expiring ? ` · ${r.expiring} expiring` : ""}
                  </div>
                  {r.gaps.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {r.gaps.slice(0, 6).map((g) => (
                        <span key={g} className="inline-flex items-center rounded-md bg-bg-muted/70 px-2 py-0.5 text-[11px] text-fg-muted ring-1 ring-border/50">{g}</span>
                      ))}
                    </div>
                  )}
                </div>
                <Link
                  href={`/documents?company=${r.ownerId}`}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-bg-elev px-2.5 py-1.5 text-xs font-medium text-fg ring-1 ring-border transition-colors hover:bg-bg-muted"
                >
                  <ExternalLink size={13} /> Open
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return <div className="px-4 py-6 text-center text-sm text-fg-muted">{label}</div>;
}

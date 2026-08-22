"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarClock, Plane, Building2, User as UserIcon, CheckCircle2, Circle,
  Plus, Loader2, ExternalLink, ListChecks, ChevronDown, MinusCircle, RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useToast } from "./toast";
import { FLAG_META, daysLabel, type CcFlag } from "@/lib/command-centre";
import { Panel, SectionLabel } from "@/components/surface-kit";
import {
  tickHabitAction,
  toggleObligationCompanyAction,
  setObligationApplicableAction,
  createTaskFromObligationAction,
} from "@/app/hrms/command-centre/actions";

type Habit = {
  id: number;
  label: string;
  frequency: "daily" | "weekly";
  dueRule: string | null;
  why: string | null;
  lastDone: string | null;
  fresh: boolean;
};
type CompanyStatus = {
  companyId: number;
  name: string;
  accent: string | null;
  applicable: boolean;
  autoReason: string | null;
  done: boolean;
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
  companies: CompanyStatus[];
  applicableCount: number;
  doneCount: number;
};

const PERIOD_LABEL: Record<string, string> = {
  monthly: "this month",
  quarterly: "this quarter",
  annual: "this year",
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
type Company = { id: number; name: string; accent: string | null };
type TabKey = "deadlines" | "permits";

function Pill({ flag }: { flag: CcFlag }) {
  const m = FLAG_META[flag];
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1", m.bg, m.text, m.ring)}>
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
  companies,
}: {
  initial?: TabKey;
  habits: Habit[];
  deadlines: Deadline[];
  permits: Permit[];
  companies: Company[];
}) {
  const [tab, setTab] = useState<TabKey>(initial);
  const { toast } = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [, startAction] = useTransition();

  const companyName = (id: number | null) => companies.find((c) => c.id === id)?.name ?? "All entities";
  const companyAccent = (id: number | null) => companies.find((c) => c.id === id)?.accent ?? null;

  const tabs = [
    { key: "deadlines" as const, label: "Deadlines", icon: CalendarClock, count: deadlines.length },
    { key: "permits" as const, label: "Permit Watch", icon: Plane, count: permits.length },
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
  function tickCompany(obligationId: number, companyId: number, done: boolean) {
    setBusy(`oc-${obligationId}-${companyId}`);
    startAction(async () => {
      const res = await toggleObligationCompanyAction(obligationId, companyId, done);
      setBusy(null);
      if (res.ok) router.refresh();
      else toast(res.error, { tone: "warn" });
    });
  }
  function setApplicable(obligationId: number, companyId: number, applicable: boolean) {
    setBusy(`oc-${obligationId}-${companyId}`);
    startAction(async () => {
      const res = await setObligationApplicableAction(obligationId, companyId, applicable);
      setBusy(null);
      if (res.ok) router.refresh();
      else toast(res.error, { tone: "warn" });
    });
  }
  function promote(obligationId: number, companyId: number) {
    setBusy(`oc-${obligationId}-${companyId}`);
    startAction(async () => {
      const res = await createTaskFromObligationAction(obligationId, companyId);
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
            <span className="inline-flex h-[18px] min-w-[20px] items-center justify-center rounded-full bg-bg-muted px-1 text-xs tabular text-fg-muted">{count}</span>
          </button>
        ))}
      </div>

      {/* ---------------- DEADLINES ---------------- */}
      {tab === "deadlines" && (
        <div className="space-y-4">
          <Panel glass className="overflow-hidden">
            <div className="border-b border-border/60 px-4 py-3">
              <SectionLabel icon={<CalendarClock size={13} className="text-accent" />}>Dated obligations</SectionLabel>
            </div>
            <div className="divide-y divide-border/40">
              {deadlines.length === 0 && <Empty label="No upcoming statutory deadlines." />}
              {deadlines.map((d) => {
                const open = openId === d.id;
                const allDone = d.applicableCount > 0 && d.doneCount === d.applicableCount;
                const period = PERIOD_LABEL[d.frequency] ?? "this period";
                return (
                  <div key={d.id}>
                    <button
                      type="button"
                      onClick={() => setOpenId(open ? null : d.id)}
                      className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-bg-muted/40"
                    >
                      <span className="h-8 w-1.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{d.label}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-fg-subtle">
                          <span className="capitalize">{d.frequency}</span>
                          <span>· {d.category}</span>
                          {d.dueDate && <span>· {fmtDate(d.dueDate)}</span>}
                        </div>
                      </div>
                      {/* Per-company completion badge — the guarantee you can see. */}
                      <span className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ring-1",
                        allDone ? "bg-success-soft/60 text-success ring-success/20" : "bg-bg-muted/70 text-fg-muted ring-border/50",
                      )}>
                        {d.doneCount}/{d.applicableCount} {period}
                      </span>
                      <span className="hidden sm:inline shrink-0 text-xs tabular text-fg-muted">{daysLabel(d.daysLeft)}</span>
                      <Pill flag={d.flag} />
                      <ChevronDown size={15} className={cn("shrink-0 text-fg-subtle transition-transform", open && "rotate-180")} />
                    </button>

                    {/* Expanded per-company tick grid */}
                    {open && (
                      <div className="bg-bg-subtle/40 px-3.5 pb-3 pt-1">
                        <div className="mb-1.5 px-1 text-xs text-fg-subtle">
                          Tick each company once it&apos;s done {period}. Resets next period.
                        </div>
                        <div className="space-y-1">
                          {d.companies.map((c) => {
                            const cbusy = busy === `oc-${d.id}-${c.companyId}`;
                            if (!c.applicable) {
                              return (
                                <div key={c.companyId} className="flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 opacity-60">
                                  {c.accent ? <span className="h-5 w-1 shrink-0 rounded-full" style={{ backgroundColor: c.accent }} /> : <span className="h-5 w-1 shrink-0" />}
                                  <span className="min-w-0 flex-1 truncate text-sm line-through">{c.name}</span>
                                  <span className="text-xs text-fg-subtle">{c.autoReason ?? "Not applicable"}</span>
                                  {!c.autoReason && (
                                    <button type="button" disabled={cbusy} onClick={() => setApplicable(d.id, c.companyId, true)}
                                      className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-fg-muted ring-1 ring-border transition-colors hover:bg-bg-muted disabled:opacity-50" title="Mark applicable again">
                                      <RotateCcw size={12} /> Restore
                                    </button>
                                  )}
                                </div>
                              );
                            }
                            return (
                              <div key={c.companyId} className="flex items-center gap-2.5 rounded-xl bg-bg-elev/60 px-2.5 py-1.5 ring-1 ring-border/40">
                                {c.accent ? <span className="h-5 w-1 shrink-0 rounded-full" style={{ backgroundColor: c.accent }} /> : <span className="h-5 w-1 shrink-0" />}
                                <button type="button" disabled={cbusy} onClick={() => tickCompany(d.id, c.companyId, !c.done)} className="inline-flex min-w-0 flex-1 items-center gap-2 text-left disabled:opacity-50">
                                  {cbusy ? <Loader2 size={16} className="shrink-0 animate-spin text-fg-muted" />
                                    : c.done ? <CheckCircle2 size={16} className="shrink-0 text-success" />
                                    : <Circle size={16} className="shrink-0 text-fg-subtle" />}
                                  <span className={cn("truncate text-sm", c.done && "text-fg-muted line-through")}>{c.name}</span>
                                </button>
                                {d.taskable && !c.done && (
                                  <button type="button" disabled={cbusy} onClick={() => promote(d.id, c.companyId)}
                                    className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-accent/10 px-2 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent/20 disabled:opacity-50" title="Make a trackable task for this company">
                                    <Plus size={12} /> Task
                                  </button>
                                )}
                                <button type="button" disabled={cbusy} onClick={() => setApplicable(d.id, c.companyId, false)}
                                  className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-fg-subtle ring-1 ring-border/60 transition-colors hover:bg-bg-muted disabled:opacity-50" title="Not applicable to this company">
                                  <MinusCircle size={12} /> N/A
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Panel>

          {/* Habit tick-lists (daily/weekly routines — ticked in place) */}
          {(dailyHabits.length > 0 || weeklyHabits.length > 0) && (
            <Panel className="overflow-hidden">
              <div className="border-b border-border/60 px-4 py-3">
                <SectionLabel icon={<ListChecks size={13} className="text-accent" />}
                  action={<span className="text-xs font-normal normal-case tracking-normal text-fg-subtle">tick as you go — they don&apos;t become tasks</span>}>
                  Routine duties
                </SectionLabel>
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
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-fg-subtle">
                        <span className="capitalize">{h.frequency}</span>
                        {h.dueRule && <span>· {h.dueRule}</span>}
                        {h.lastDone && <span>· last {fmtDate(h.lastDone)}</span>}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </Panel>
          )}
        </div>
      )}

      {/* ---------------- PERMIT WATCH ---------------- */}
      {tab === "permits" && (
        <Panel glass className="overflow-hidden">
          <div className="border-b border-border/60 px-4 py-3">
            <SectionLabel icon={<Plane size={13} className="text-accent" />}
              action={<span className="text-xs font-normal normal-case tracking-normal text-fg-subtle">90 / 60 / 30-day early warning</span>}>
              Work / residence permits
            </SectionLabel>
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
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-fg-subtle">
                    {p.ownerName && <span className="inline-flex items-center gap-1"><UserIcon size={11} />{p.ownerName}</span>}
                    {p.category && <span>· {p.category}</span>}
                    <span>· expires {fmtDate(p.expiryDate)}</span>
                  </div>
                </div>
                <span className="shrink-0 text-xs tabular text-fg-muted">{daysLabel(p.daysLeft)}</span>
                <Pill flag={p.flag} />
              </div>
            ))}
          </div>
        </Panel>
      )}

    </div>
  );
}

function Empty({ label }: { label: string }) {
  return <div className="px-4 py-6 text-center text-sm text-fg-muted">{label}</div>;
}

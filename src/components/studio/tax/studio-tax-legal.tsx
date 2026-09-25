"use client";

/**
 * Tax & Legal in Studio (26 Sept 2026) — recurring statutory obligations.
 * The period's progress and the next deadline on top; then every dated
 * obligation with a tick per company (and "not applicable" / "make a task"),
 * the routine duties you tick as you go, and Permit Watch (work / residence
 * papers on the 90 / 60 / 30-day bands). Same actions as before.
 */
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Check, ChevronDown, ListChecks, Loader2, MinusCircle, Plane, Plus, RotateCcw } from "lucide-react";
import { StudioScope, StudioHeader, StudioCardRow, StudioCard, CardHead, Ring } from "@/components/studio/kit";
import { useToast } from "@/components/toast";
import { tickHabitAction, toggleObligationCompanyAction, setObligationApplicableAction, createTaskFromObligationAction } from "@/app/hrms/command-centre/actions";
import { daysLabel, type CcFlag } from "@/lib/command-centre";
import { cn } from "@/lib/cn";

export type TaxHabit = { id: number; label: string; frequency: "daily" | "weekly"; dueRule: string | null; why: string | null; lastDone: string | null; fresh: boolean };
type CompanyStatus = { companyId: number; name: string; accent: string | null; applicable: boolean; autoReason: string | null; done: boolean };
export type TaxDeadline = {
  id: number; label: string; companyId: number | null; frequency: string; category: string; why: string | null;
  dueDate: string | null; daysLeft: number | null; flag: CcFlag; taskable: boolean;
  companies: CompanyStatus[]; applicableCount: number; doneCount: number;
};
export type TaxPermit = { id: number; title: string; ownerName: string | null; category: string | null; expiryDate: string | null; daysLeft: number | null; flag: CcFlag };

const FLAG: Record<CcFlag, { label: string; dot: string }> = {
  overdue: { label: "Overdue", dot: "var(--st-late)" },
  dueNow: { label: "Due now", dot: "var(--st-late)" },
  soon: { label: "Soon", dot: "#F5A524" },
  later: { label: "Later", dot: "#19C37D" },
  done: { label: "Done", dot: "#B9BBBF" },
  none: { label: "—", dot: "#D4D5D2" },
};
const PERIOD: Record<string, string> = { monthly: "this month", quarterly: "this quarter", annual: "this year" };
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—");

function Flag({ f }: { f: CcFlag }) {
  return <span className="inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-[7px] bg-[var(--st-page)] px-2.5 text-xs"><span className="h-[7px] w-[7px] rounded-full" style={{ background: FLAG[f].dot }} />{FLAG[f].label}</span>;
}

export function StudioTaxLegal({ view, habits, deadlines, permits }: { view: "deadlines" | "permits"; habits: TaxHabit[]; deadlines: TaxDeadline[]; permits: TaxPermit[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState(view);
  const [openId, setOpenId] = useState<number | null>(null);

  const run = (key: string, fn: () => Promise<{ ok: boolean; error?: string; code?: string }>, ok?: (r: { code?: string }) => string) => {
    setBusy(key);
    start(async () => {
      const r = await fn();
      setBusy(null);
      if (!r.ok) { toast(r.error ?? "Could not do that.", { tone: "warn" }); return; }
      if (ok) toast(ok(r), { tone: "success" });
      router.refresh();
    });
  };

  const inWindow = deadlines.filter((d) => d.flag === "overdue" || d.flag === "dueNow" || d.flag === "soon");
  const ticks = inWindow.reduce((s, d) => s + d.applicableCount, 0);
  const done = inWindow.reduce((s, d) => s + d.doneCount, 0);
  const count = (f: CcFlag) => deadlines.filter((d) => d.flag === f).length;
  const next = useMemo(() => [...deadlines].filter((d) => d.daysLeft != null && d.doneCount < d.applicableCount).sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0))[0] ?? null, [deadlines]);
  const permitAlerts = permits.filter((p) => p.flag === "overdue" || p.flag === "dueNow" || p.flag === "soon");

  return (
    <StudioScope className="flex flex-col gap-5">
      <StudioHeader
        title="Tax & Legal"
        right={
          <div className="flex gap-0.5 rounded-[11px] bg-[var(--st-seg)] p-[3px]" role="tablist">
            {([["deadlines", "Deadlines", deadlines.length], ["permits", "Permit watch", permits.length]] as const).map(([k, l, n]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                className={cn("flex h-[30px] items-center gap-1.5 rounded-lg px-3 text-xs transition-colors", tab === k ? "bg-[var(--st-surface)] font-medium shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-[var(--st-sub)] hover:text-[var(--st-ink)]")}>
                {l}<span className="text-[11px] font-normal text-[var(--st-muted)]">{n}</span>
              </button>
            ))}
          </div>
        }
      />

      <StudioCardRow className="lg:h-[210px]">
        <StudioCard className="min-h-[190px]">
          <CardHead label="Due in this window" right={<span>a tick per company, per period</span>} />
          <div className="mt-auto flex items-end gap-6 pt-3">
            <Ring value={ticks ? (done / ticks) * 100 : 0} size={116} stroke={12} color="#19C37D" track="var(--st-card-line)" label={`${done}/${ticks}`} sub="ticked" />
            <div className="grid flex-1 grid-cols-2 gap-4 pb-1 sm:grid-cols-4">
              {([["overdue", "overdue", "#F29CC6"], ["dueNow", "due now", "#F29CC6"], ["soon", "coming up", "#F5B94E"]] as const).map(([f, l, c]) => (
                <div key={f}><div className="text-[30px] leading-none tracking-[-0.03em] tabular-nums">{count(f)}</div><div className="mt-1.5 text-xs" style={{ color: count(f) ? c : "var(--st-on-card-muted)" }}>{l}</div></div>
              ))}
              <div><div className="text-[30px] leading-none tracking-[-0.03em] tabular-nums">{permitAlerts.length}</div><div className={cn("mt-1.5 text-xs", permitAlerts.length ? "text-[#F29CC6]" : "text-[var(--st-on-card-muted)]")}>permit alerts</div></div>
            </div>
          </div>
        </StudioCard>
        <StudioCard texture="contour" className="min-h-[190px]">
          <CardHead label="Next up" right={next?.dueDate ? <span>{fmt(next.dueDate)}</span> : undefined} />
          <div className="mt-auto flex flex-col gap-2 pt-3">
            {next ? (
              <>
                <div className="line-clamp-2 text-[22px] font-medium leading-tight tracking-[-0.015em]">{next.label}</div>
                <div className="text-[13px] text-[var(--st-on-card-muted)]">{daysLabel(next.daysLeft)} · {next.doneCount} of {next.applicableCount} companies ticked {PERIOD[next.frequency] ?? "this period"} · {next.category}</div>
                <div><button type="button" onClick={() => { setTab("deadlines"); setOpenId(next.id); document.getElementById(`ob-${next.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); }}
                  className="inline-flex h-8 items-center gap-1.5 rounded-[9px] bg-[var(--st-on-card)] px-3 text-xs font-semibold text-[#111214]">Tick the companies</button></div>
              </>
            ) : <div className="text-[15px] text-[var(--st-on-card-muted)]">Nothing outstanding — every company is ticked for its current period.</div>}
          </div>
        </StudioCard>
      </StudioCardRow>

      {tab === "deadlines" ? (
        <div className="flex flex-col gap-2 pb-10">
          <div className="flex items-center gap-2 px-1 pt-1 text-[13px] font-semibold"><CalendarClock size={14} />Dated obligations</div>
          {deadlines.length === 0 && <p className="m-0 rounded-[14px] bg-[var(--st-surface)] py-8 text-center text-[13px] text-[var(--st-muted)]">No upcoming statutory deadlines.</p>}
          {deadlines.map((d) => {
            const open = openId === d.id;
            const allDone = d.applicableCount > 0 && d.doneCount === d.applicableCount;
            const period = PERIOD[d.frequency] ?? "this period";
            return (
              <div key={d.id} id={`ob-${d.id}`} className="overflow-hidden rounded-[14px] bg-[var(--st-surface)]">
                <button type="button" aria-expanded={open} onClick={() => setOpenId(open ? null : d.id)}
                  className="grid w-full grid-cols-[minmax(0,1fr)_auto_18px] items-center gap-x-4 px-5 py-3 text-left transition-colors hover:bg-[var(--st-page)] sm:grid-cols-[minmax(0,1fr)_130px_90px_100px_18px]">
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-medium">{d.label}</span>
                    <span className="mt-0.5 block truncate text-xs capitalize text-[var(--st-muted)]">{d.frequency} · {d.category}{d.dueDate ? ` · ${fmt(d.dueDate)}` : ""}</span>
                  </span>
                  <span className={cn("inline-flex h-6 items-center justify-center rounded-[7px] px-2.5 text-xs tabular-nums", allDone ? "bg-[var(--st-ok-wash)] text-[var(--st-ok-text)]" : "bg-[var(--st-page)]")}>{d.doneCount}/{d.applicableCount} {period}</span>
                  <span className="hidden text-xs tabular-nums text-[var(--st-sub)] sm:block">{daysLabel(d.daysLeft)}</span>
                  <span className="hidden sm:block"><Flag f={d.flag} /></span>
                  <ChevronDown size={15} className={cn("text-[var(--st-muted)] transition-transform", open && "rotate-180")} />
                </button>
                {open && (
                  <div className="border-t border-[var(--st-line-soft)] bg-[var(--st-page)]/50 px-5 pb-4 pt-2.5">
                    <div className="mb-2 text-xs text-[var(--st-muted)]">Tick each company once it’s done {period}. It resets next period.{d.why ? ` ${d.why}` : ""}</div>
                    <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
                      {d.companies.map((c) => {
                        const k = `oc-${d.id}-${c.companyId}`;
                        const b = busy === k;
                        if (!c.applicable) return (
                          <div key={c.companyId} className="flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-[13px] opacity-60">
                            <span className="h-4 w-1 rounded-full" style={{ background: c.accent ?? "transparent" }} />
                            <span className="min-w-0 flex-1 truncate line-through">{c.name}</span>
                            <span className="text-xs text-[var(--st-muted)]">{c.autoReason ?? "Not applicable"}</span>
                            {!c.autoReason && <button type="button" disabled={b} onClick={() => run(k, () => setObligationApplicableAction(d.id, c.companyId, true))} className="inline-flex h-7 items-center gap-1 rounded-lg border border-[var(--st-line)] px-2 text-xs hover:bg-[var(--st-surface)]"><RotateCcw size={12} />Restore</button>}
                          </div>
                        );
                        return (
                          <div key={c.companyId} className="flex items-center gap-2.5 rounded-[10px] bg-[var(--st-surface)] px-3 py-2 text-[13px]">
                            <span className="h-4 w-1 rounded-full" style={{ background: c.accent ?? "transparent" }} />
                            <button type="button" disabled={b} onClick={() => run(k, () => toggleObligationCompanyAction(d.id, c.companyId, !c.done))} className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:opacity-50">
                              <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-[6px] border-[1.5px]", c.done ? "border-[#19C37D] bg-[#19C37D] text-white" : "border-[#CFCFCA]")}>{b ? <Loader2 size={11} className="animate-spin" /> : c.done && <Check size={12} strokeWidth={3} />}</span>
                              <span className={cn("truncate", c.done && "text-[var(--st-muted)] line-through")}>{c.name}</span>
                            </button>
                            {d.taskable && !c.done && <button type="button" disabled={b} onClick={() => run(k, () => createTaskFromObligationAction(d.id, c.companyId), (r) => `Task ${r.code ?? ""} created.`)} title="Make it a task" className="inline-flex h-7 items-center gap-1 rounded-lg border border-[var(--st-line)] px-2 text-xs hover:bg-[var(--st-page)]"><Plus size={12} />Task</button>}
                            <button type="button" disabled={b} onClick={() => run(k, () => setObligationApplicableAction(d.id, c.companyId, false))} title="Not applicable to this company" className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-xs text-[var(--st-muted)] hover:bg-[var(--st-page)]"><MinusCircle size={12} />N/A</button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {habits.length > 0 && (
            <>
              <div className="flex items-center gap-2 px-1 pt-4 text-[13px] font-semibold"><ListChecks size={14} />Routine duties<span className="text-xs font-normal text-[var(--st-muted)]">tick as you go — they don’t become tasks</span></div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {[...habits.filter((h) => h.frequency === "daily"), ...habits.filter((h) => h.frequency === "weekly")].map((h) => {
                  const b = busy === `habit-${h.id}`;
                  return (
                    <button key={h.id} type="button" disabled={b} onClick={() => run(`habit-${h.id}`, () => tickHabitAction(h.id))}
                      className="flex items-center gap-3 rounded-[14px] bg-[var(--st-surface)] px-4 py-3 text-left transition-colors hover:bg-[var(--st-page)] disabled:opacity-60">
                      <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-[10px] border-[1.5px]", h.fresh ? "border-[#19C37D] bg-[#19C37D] text-white" : "border-[#CFCFCA]")}>{b ? <Loader2 size={14} className="animate-spin" /> : h.fresh && <Check size={15} strokeWidth={3} />}</span>
                      <span className="min-w-0">
                        <span className={cn("block truncate text-[14px]", h.fresh ? "text-[var(--st-muted)] line-through" : "font-medium")}>{h.label}</span>
                        <span className="block truncate text-xs capitalize text-[var(--st-muted)]">{h.frequency}{h.dueRule ? ` · ${h.dueRule}` : ""}{h.lastDone ? ` · last ${fmt(h.lastDone)}` : ""}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2 pb-10">
          <div className="flex items-center gap-2 px-1 pt-1 text-[13px] font-semibold"><Plane size={14} />Work and residence papers<span className="text-xs font-normal text-[var(--st-muted)]">90 / 60 / 30-day early warning</span></div>
          {permits.length === 0 && <p className="m-0 rounded-[14px] bg-[var(--st-surface)] py-8 text-center text-[13px] text-[var(--st-muted)]">No permit, passport or immigration papers on file yet — file them in Files against the person.</p>}
          {permits.map((p) => (
            <a key={p.id} href={`/files?open=${p.id}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 rounded-[14px] bg-[var(--st-surface)] px-5 py-3 transition-colors hover:bg-[var(--st-page)] sm:grid-cols-[minmax(0,1fr)_150px_90px_100px]">
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-medium">{p.title}</span>
                <span className="mt-0.5 block truncate text-xs text-[var(--st-muted)]">{[p.ownerName, p.category].filter(Boolean).join(" · ")}</span>
              </span>
              <span className="hidden text-[13px] sm:block">expires {fmt(p.expiryDate)}</span>
              <span className="hidden text-xs tabular-nums text-[var(--st-sub)] sm:block">{daysLabel(p.daysLeft)}</span>
              <Flag f={p.flag} />
            </a>
          ))}
        </div>
      )}
    </StudioScope>
  );
}

export function StudioTaxPaused() {
  return (
    <StudioScope className="flex flex-col gap-5">
      <StudioHeader title="Tax & Legal" />
      <StudioCard texture="contour" className="min-h-[200px]">
        <CardHead label="Paused" />
        <div className="mt-auto max-w-[560px] pt-4">
          <div className="text-[24px] font-medium tracking-[-0.015em]">This area is paused.</div>
          <p className="m-0 mt-2 text-[13px] leading-relaxed text-[var(--st-on-card-muted)]">No tax or legal tasks are being created and nothing here shows elsewhere in the system. Turn it back on in Settings → Tax &amp; Legal; it resumes fresh from that day, with no backlog of what fell due while paused.</p>
          <a href="/settings#tax-legal" className="mt-4 inline-flex h-8 items-center rounded-[9px] bg-[var(--st-on-card)] px-3 text-xs font-semibold text-[#111214]">Open Settings</a>
        </div>
      </StudioCard>
    </StudioScope>
  );
}

"use client";

/**
 * Approvals in Studio (26 Sept 2026) — what the system proposes and what it did
 * on its own. Before this the page showed the same automation events twice (the
 * cockpit AND the old automation feed read the same table); now one list:
 * Waiting (approve / dismiss) and Done on its own (undo), with the full
 * logbook in a sheet and "Run the checks now".
 */
import { useEffect, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, History, Loader2, RefreshCw, RotateCcw, X } from "lucide-react";
import { StudioScope, StudioHeader, StudioCardRow, StudioCard, CardHead, BigNumber, stBtn } from "@/components/studio/kit";
import { StudioSheet } from "@/components/studio/sheet";
import { useToast } from "@/components/toast";
import { approveCockpitItem, dismissCockpitItem, undoCockpitItem } from "@/app/approvals/actions";
import { runTimeAutomationsNow, listAutomationHistory, type AutomationHistoryItem } from "@/app/automations/actions";
import { cockpitKindLabel, type CockpitItem } from "@/lib/cockpit-shared";
import { cn } from "@/lib/cn";

const STALE_DAYS = 3;
const waiting = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
function ago(iso: string | null): string {
  if (!iso) return "";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Nairobi" });
}
const KIND_FILTERS: [string, string][] = [["all", "Everything"], ["task-create", "Renewals"], ["task-complete", "Tasks"], ["onboarding-tick", "Onboarding"], ["compliance-verify", "Compliance"]];
const STATUS_FILTERS: [string, string][] = [["all", "Any outcome"], ["applied", "Done"], ["suggested", "Waiting"], ["dismissed", "Dismissed"], ["undone", "Undone"]];
const STATUS_DOT: Record<string, string> = { applied: "var(--st-ok)", suggested: "var(--st-blue)", dismissed: "#B9BBBF", undone: "#B9BBBF" };

export function StudioApprovals({ approvals, activity, needsYou, needsYouParts }: {
  approvals: CockpitItem[]; activity: CockpitItem[]; needsYou: number; needsYouParts: string[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [lane, setLane] = useState<"waiting" | "done">(approvals.length ? "waiting" : "done");
  const [histOpen, setHistOpen] = useState(false);
  const [checking, startCheck] = useTransition();

  const act = (key: string, fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) => {
    setBusy(key);
    start(async () => {
      const r = await fn();
      setBusy(null);
      if (!r.ok) { toast(r.error ?? "Could not do that.", { tone: "warn" }); return; }
      toast(ok, { tone: "success" }); router.refresh();
    });
  };
  const runChecks = () => startCheck(async () => {
    const r = await runTimeAutomationsNow().catch(() => ({ ok: false, renewals: 0, probations: 0, obligations: 0 }));
    const n = r.renewals + r.probations + r.obligations;
    toast(r.ok ? (n ? `${n} new — ${r.renewals} renewals, ${r.probations} probation reviews, ${r.obligations} obligations.` : "Checked — nothing new.") : "The checks could not run.", { tone: r.ok ? "success" : "warn" });
    router.refresh();
  });

  const oldest = approvals.length ? Math.max(...approvals.map((a) => waiting(a.createdAt))) : 0;
  const rows = lane === "waiting" ? approvals : activity;

  return (
    <StudioScope className="flex flex-col gap-5">
      <StudioHeader
        title="Approvals"
        right={
          <>
            <div className="flex gap-0.5 rounded-[11px] bg-[var(--st-seg)] p-[3px]" role="tablist">
              {([["waiting", "Waiting", approvals.length], ["done", "Done on its own", activity.length]] as const).map(([k, l, n]) => (
                <button key={k} type="button" role="tab" aria-selected={lane === k} onClick={() => setLane(k)}
                  className={cn("flex h-[30px] items-center gap-1.5 rounded-lg px-3 text-xs transition-colors", lane === k ? "bg-[var(--st-surface)] font-medium shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-[var(--st-sub)] hover:text-[var(--st-ink)]")}>
                  {l}<span className="text-[11px] font-normal text-[var(--st-muted)]">{n}</span>
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setHistOpen(true)} className={cn(stBtn.ghost, "max-sm:hidden")}><History size={14} />Logbook</button>
            <button type="button" disabled={checking} onClick={runChecks} className={stBtn.dark}>{checking ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}<span className="max-sm:hidden">Run the checks now</span><span className="sm:hidden">Check</span></button>
          </>
        }
      />

      <StudioCardRow className="lg:h-[210px]">
        <StudioCard className="min-h-[190px]">
          <CardHead label="Waiting for you" right={<span>{approvals.length ? (oldest ? `oldest ${oldest} day${oldest === 1 ? "" : "s"}` : "all from today") : "nothing waiting"}</span>} />
          <div className="mt-auto flex items-end gap-6 pt-3">
            <BigNumber value={approvals.length} unit={approvals.length === 1 ? "proposal" : "proposals"} />
            <span className="flex-1" />
            <Link href="/?tab=tasks&flag=overdue" title={needsYouParts.join(" · ") || "Nothing urgent"} className="rounded-xl border border-[var(--st-card-line)] bg-[var(--st-card-2)] px-4 py-3 hover:bg-[var(--st-card-3)]">
              <div className={cn("text-[30px] leading-none tracking-[-0.03em] tabular-nums", needsYou && "text-[#F29CC6]")}>{needsYou}</div>
              <div className="mt-1.5 text-xs text-[var(--st-on-card-muted)]">need you today</div>
            </Link>
          </div>
        </StudioCard>
        <StudioCard texture="rings" className="min-h-[190px]">
          <CardHead label="Done on its own" right={<span>each one can be undone</span>} />
          <div className="mt-auto flex flex-col gap-2 pt-3">
            {activity[0] ? (
              <>
                <div className="line-clamp-2 text-[18px] leading-snug tracking-[-0.01em]">{activity[0].summary}</div>
                <div className="flex items-center gap-2 text-xs text-[var(--st-on-card-muted)]">
                  <span>{cockpitKindLabel(activity[0])} · {ago(activity[0].createdAt)}{activity.length > 1 ? ` · and ${activity.length - 1} more` : ""}</span>
                  <span className="flex-1" />
                  {activity[0].canUndo && <button type="button" disabled={pending} onClick={() => act(activity[0].key, () => undoCockpitItem(activity[0].key), "Undone.")} className={stBtn.onCardGhost}><RotateCcw size={12} />Undo</button>}
                </div>
              </>
            ) : <div className="text-[15px] text-[var(--st-on-card-muted)]">Nothing has been applied automatically yet.</div>}
          </div>
        </StudioCard>
      </StudioCardRow>

      <div className="flex flex-col gap-2 pb-10">
        {rows.length === 0 && (
          <div className="st-tex-paper-dots flex min-h-[180px] items-center justify-center rounded-[20px] border border-dashed border-[var(--st-line)]">
            <span className="rounded-xl bg-[var(--st-page)] px-4 py-2.5 text-[13px] text-[var(--st-sub)]">{lane === "waiting" ? "Nothing waiting — you’re all caught up." : "Nothing applied automatically yet."}</span>
          </div>
        )}
        {rows.map((s) => {
          const isBusy = pending && busy === s.key;
          const days = waiting(s.createdAt);
          return (
            <div key={s.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 rounded-[14px] bg-[var(--st-surface)] px-5 py-3.5 sm:grid-cols-[110px_minmax(0,1fr)_auto]">
              <span className="max-sm:hidden"><Chip>{cockpitKindLabel(s)}</Chip></span>
              <span className="min-w-0">
                <span className="block text-[14px] font-medium leading-snug">{s.summary}</span>
                <span className="mt-0.5 block text-xs text-[var(--st-muted)]">
                  <span className="sm:hidden">{cockpitKindLabel(s)} · </span>
                  {s.detail ? `${lane === "done" ? "Why: " : ""}${s.detail} · ` : ""}{ago(s.createdAt)}
                  {lane === "waiting" && days >= STALE_DAYS && <span className="text-[var(--st-late-text)]"> · waiting {days} days</span>}
                </span>
              </span>
              <span className="flex items-center gap-1.5 max-sm:col-span-2">
                {lane === "waiting" ? (
                  <>
                    <button type="button" disabled={isBusy} onClick={() => act(s.key, () => approveCockpitItem(s.key), "Approved.")} className="inline-flex h-8 items-center gap-1.5 rounded-[9px] bg-[var(--st-ink)] px-3 text-xs font-semibold text-[var(--st-page)] disabled:opacity-50">{isBusy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}Approve</button>
                    <button type="button" disabled={isBusy} onClick={() => act(s.key, () => dismissCockpitItem(s.key), "Dismissed.")} className="inline-flex h-8 items-center gap-1.5 rounded-[9px] border border-[var(--st-line)] px-3 text-xs hover:bg-[var(--st-page)] disabled:opacity-50"><X size={13} />Dismiss</button>
                  </>
                ) : s.canUndo ? (
                  <button type="button" disabled={isBusy} onClick={() => act(s.key, () => undoCockpitItem(s.key), "Undone.")} className="inline-flex h-8 items-center gap-1.5 rounded-[9px] border border-[var(--st-line)] px-3 text-xs hover:bg-[var(--st-page)] disabled:opacity-50">{isBusy ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}Undo</button>
                ) : null}
              </span>
            </div>
          );
        })}
      </div>

      <Logbook open={histOpen} onClose={() => setHistOpen(false)} />
    </StudioScope>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return <span className="inline-flex h-6 items-center rounded-[7px] bg-[var(--st-page)] px-2.5 text-xs">{children}</span>;
}

function Logbook({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [kind, setKind] = useState("all");
  const [status, setStatus] = useState("all");
  const [rows, setRows] = useState<AutomationHistoryItem[] | null>(null);
  const [loading, start] = useTransition();
  useEffect(() => {
    if (!open) return;
    start(async () => setRows(await listAutomationHistory({ kind, status }).catch(() => [])));
  }, [open, kind, status]);
  const pick = (cls: string, on: boolean) => cn("h-7 rounded-[8px] border px-2.5 text-xs transition-colors", on ? "border-[var(--sh-fg)] bg-[var(--sh-fg)] text-[var(--sh-bg)]" : "border-[var(--sh-chip-line)] hover:bg-[var(--sh-hover)]", cls);
  return (
    <StudioSheet open={open} onClose={onClose} width={640} icon={<History size={15} />} title="Logbook — everything the system proposed or did">
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap gap-1.5">{KIND_FILTERS.map(([k, l]) => <button key={k} type="button" onClick={() => setKind(k)} className={pick("", kind === k)}>{l}</button>)}</div>
        <div className="flex flex-wrap gap-1.5">{STATUS_FILTERS.map(([k, l]) => <button key={k} type="button" onClick={() => setStatus(k)} className={pick("", status === k)}>{l}</button>)}</div>
        <div className="mt-1 flex flex-col">
          {rows == null || loading ? <p className="m-0 py-6 text-center text-xs text-[var(--sh-muted)]"><Loader2 size={13} className="inline animate-spin" /> Loading…</p>
            : rows.length === 0 ? <p className="m-0 py-6 text-center text-[13px] text-[var(--sh-muted)]">Nothing matches.</p>
            : rows.map((r) => (
              <div key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-[var(--sh-line)] py-2.5 text-[13px] last:border-0">
                <span className="min-w-0"><span className="block leading-snug">{r.summary}</span><span className="block text-xs text-[var(--sh-muted)]">{r.owner ? `${r.owner} · ` : ""}{ago(r.createdAt)}{r.actedAt ? ` · acted ${ago(r.actedAt)}` : ""}</span></span>
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs"><span className="h-[7px] w-[7px] rounded-full" style={{ background: STATUS_DOT[r.status] ?? "#B9BBBF" }} />{r.status === "applied" ? "Done" : r.status === "suggested" ? "Waiting" : r.status[0].toUpperCase() + r.status.slice(1)}</span>
              </div>
            ))}
        </div>
      </div>
    </StudioSheet>
  );
}

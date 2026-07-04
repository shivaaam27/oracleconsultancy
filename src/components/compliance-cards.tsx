"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ShieldOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { CompanyAvatar } from "@/components/company-avatar";
import { useToast } from "@/components/toast";
import type { ComplianceScore, ShelfCompliance } from "@/lib/compliance";
import { setCompanyComplianceTrackedAction } from "@/app/documents/compliance-actions";

type Company = { id: number; name: string; accentColor?: string | null; logoUrl?: string | null };

// Short pip labels in DOC_SHELVES order.
const SHELF_SHORT: Record<string, string> = {
  "Legal & Registration": "Legal",
  "Licences & Permits": "Licence",
  Tax: "Tax",
  "Banking & Finance": "Bank",
  "People & HR": "HR",
  Immigration: "Immig",
  "Contracts & Leases": "Contract",
  "Operations & Branding": "Ops",
};

function Ring({ value }: { value: number }) {
  const size = 40, stroke = 5, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(100, value)) / 100);
  const tone = value < 60 ? "text-danger" : value < 90 ? "text-warn" : "text-success";
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={tone}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-border/40" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={off} transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="transition-[stroke-dashoffset] duration-700 ease-out" />
      </svg>
      <span className={cn("absolute text-[10px] font-semibold tabular", tone)}>{value}</span>
    </span>
  );
}

function Pip({ s }: { s: ShelfCompliance }) {
  const label = SHELF_SHORT[s.shelf] ?? s.shelf;
  const cls = s.status === "complete" ? "bg-success-soft text-success"
    : s.status === "missing" ? "bg-danger-soft text-danger"
    : s.status === "expiring" ? "bg-warn-soft text-warn"
    : "bg-bg-muted text-fg-subtle";
  const glyph = s.status === "complete" ? <Check size={12} strokeWidth={3} />
    : s.status === "missing" ? s.missing
    : s.status === "expiring" ? "!" : "–";
  return (
    <span className="flex flex-col items-center gap-1" title={`${s.shelf} — ${s.status === "na" ? "not needed" : s.status}`}>
      <span className={cn("grid h-6 w-6 place-items-center rounded-md text-[11px] font-bold tabular", cls)}>{glyph}</span>
      <span className="text-[8px] text-fg-subtle">{label}</span>
    </span>
  );
}

function Toggle({ on, busy, onToggle }: { on: boolean; busy: boolean; onToggle: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={busy}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggle(); }}
      className="inline-flex items-center gap-1.5 text-[11px] text-fg-muted">
      <span className={cn("relative inline-block h-[18px] w-8 rounded-full ring-1 ring-border transition-colors", on ? "bg-accent" : "bg-bg-muted")}>
        {busy
          ? <Loader2 size={11} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 animate-spin text-white" />
          : <span className={cn("absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white transition-all", on ? "left-[16px]" : "left-[2px]")} />}
      </span>
      {on ? "Tracked" : "Not tracked"}
    </button>
  );
}

export function ComplianceCards({
  companyScores,
  companies,
  untracked,
}: {
  companyScores: ComplianceScore[];
  companies: Company[];
  untracked: Array<{ id: number; name: string; docCount: number }>;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [, start] = useTransition();
  const [showUntracked, setShowUntracked] = useState(false);

  const accentOf = (id: number) => companies.find((c) => c.id === id)?.accentColor ?? null;
  const logoOf = (id: number) => companies.find((c) => c.id === id)?.logoUrl ?? null;
  const cards = useMemo(
    () => companyScores.slice().sort((a, b) => a.score - b.score || b.expired - a.expired || b.missing - a.missing),
    [companyScores],
  );

  function setTracked(companyId: number, tracked: boolean) {
    setBusyId(companyId);
    start(async () => {
      const res = await setCompanyComplianceTrackedAction(companyId, tracked);
      setBusyId(null);
      if (res.ok) { toast(tracked ? "Now tracking compliance" : "Compliance tracking off", { tone: "success" }); router.refresh(); }
      else toast(res.error ?? "Couldn't update", { tone: "warn" });
    });
  }

  return (
    <section className="space-y-3">
      {/* Scroll housing — ~4 companies visible (worst-first), the rest scroll. */}
      <div className="scroll-fade-y slim-scroll max-h-[23rem] overflow-y-auto overscroll-contain pr-0.5">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {cards.map((s) => {
            const gaps = s.missing + s.expired;
            return (
              <Link key={s.ownerId} href={`/companies/${s.ownerId}`}
                className={cn("flex flex-col gap-2.5 rounded-2xl border bg-bg-elev/40 p-3.5 transition-colors hover:border-accent/40",
                  s.status === "Risk" ? "border-danger/25" : "border-border/60")}>
                <div className="flex items-start gap-2.5">
                  <CompanyAvatar name={s.ownerName} accent={accentOf(s.ownerId)} logoUrl={logoOf(s.ownerId)} size={34} rounded="rounded-lg" iconSize={15} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{s.ownerName}</div>
                    <div className="text-[11px] text-fg-subtle">{s.monitoredDocuments} doc{s.monitoredDocuments === 1 ? "" : "s"}</div>
                  </div>
                  {/* Missing count — where the ring was. */}
                  <div className="shrink-0 text-right leading-none">
                    {gaps > 0 ? (
                      <><div className="text-lg font-semibold tabular text-danger">{gaps}</div><div className="mt-0.5 text-[10px] text-danger">missing</div></>
                    ) : s.expiring > 0 ? (
                      <><div className="text-lg font-semibold tabular text-warn">{s.expiring}</div><div className="mt-0.5 text-[10px] text-warn">expiring</div></>
                    ) : (
                      <><Check size={18} strokeWidth={3} className="text-success" /><div className="mt-0.5 text-[10px] text-success">on file</div></>
                    )}
                  </div>
                </div>
                {s.shelves && (
                  <div className="flex flex-wrap gap-1.5">{s.shelves.map((sh) => <Pip key={sh.shelf} s={sh} />)}</div>
                )}
                <div className="flex justify-end border-t border-border/40 pt-2">
                  <Toggle on busy={busyId === s.ownerId} onToggle={() => setTracked(s.ownerId, false)} />
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {untracked.length > 0 && (
        <div className="rounded-2xl border border-border/60 bg-bg-subtle/40">
          <button type="button" onClick={() => setShowUntracked((v) => !v)}
            className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-xs font-medium text-fg-muted">
            <ShieldOff size={14} className="text-fg-subtle" />
            {untracked.length} not tracked for compliance
            <ChevronDown size={14} className={cn("ml-auto transition-transform", showUntracked && "rotate-180")} />
          </button>
          {showUntracked && (
            <div className="divide-y divide-border/40 border-t border-border/50">
              {untracked.map((u) => (
                <div key={u.id} className="flex items-center gap-2.5 px-3.5 py-2">
                  <CompanyAvatar name={u.name} accent={accentOf(u.id)} logoUrl={logoOf(u.id)} size={26} rounded="rounded-lg" iconSize={12} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium">{u.name}</div>
                    <div className="text-[11px] text-fg-subtle">Holding files only · {u.docCount} doc{u.docCount === 1 ? "" : "s"}</div>
                  </div>
                  <Toggle on={false} busy={busyId === u.id} onToggle={() => setTracked(u.id, true)} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

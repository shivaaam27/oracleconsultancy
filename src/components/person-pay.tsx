"use client";

import { useState } from "react";
import { Wallet, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { SectionCard } from "./drawer-kit";
import { estimateFinalPay, WAGE_BASIS_LABEL, type WageBasis } from "@/lib/pay";

const tzs = (n: number) => `TZS ${Math.round(n).toLocaleString("en-GB")}`;

/** Wage + an ELR final-pay estimate for the person drawer (Details tab). */
export function PersonPay({
  wageAmount,
  wageBasis,
  startDate,
  annualLeaveRemaining,
}: {
  wageAmount: number | null;
  wageBasis: string | null;
  startDate: string | null;
  annualLeaveRemaining: number | null;
}) {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState(true);

  if (!wageAmount || wageAmount <= 0) return null;
  const basisLabel = WAGE_BASIS_LABEL[(wageBasis as WageBasis) ?? "monthly"] ?? "";

  const est = estimateFinalPay({
    wageAmount,
    wageBasis,
    startDate: startDate ? new Date(startDate) : null,
    annualLeaveRemaining,
    noticeInLieu: notice,
  });

  return (
    <SectionCard className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wider text-fg-muted inline-flex items-center gap-1.5"><Wallet size={12} /> Compensation</span>
        <span className="ml-auto text-sm font-semibold tabular">{tzs(wageAmount)} <span className="text-[11px] font-normal text-fg-muted">{basisLabel}</span></span>
      </div>

      <button type="button" onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 rounded-lg bg-bg-subtle/50 px-3 py-2 text-[11px] font-medium text-fg-muted hover:bg-bg-muted/60 transition-colors">
        Final-pay estimate (if leaving today)
        <ChevronDown size={13} className={cn("ml-auto transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="space-y-1.5 text-[13px]">
          <Row label={`Severance · 7 days × ${est.severanceYears} yr${est.severanceYears === 1 ? "" : "s"}`} value={tzs(est.severance)} />
          <label className="flex items-center justify-between gap-2 cursor-pointer">
            <span className="inline-flex items-center gap-1.5 text-fg-muted">
              <input type="checkbox" checked={notice} onChange={(e) => setNotice(e.target.checked)} className="accent-accent" />
              Notice in lieu · 28 days
            </span>
            <span className="tabular">{tzs(est.noticeInLieu)}</span>
          </label>
          <Row label={`Accrued leave · ${Math.max(0, annualLeaveRemaining ?? 0)} day${(annualLeaveRemaining ?? 0) === 1 ? "" : "s"}`} value={tzs(est.leavePayout)} />
          <div className="flex items-center justify-between border-t border-border/60 pt-1.5 font-semibold">
            <span>Estimated total</span>
            <span className="tabular">{tzs(est.total)}</span>
          </div>
          <p className="text-[10px] text-fg-subtle pt-0.5">
            Estimate only (ELR Act 2004: severance ≥7 days/yr, notice 28 days, daily wage = monthly ÷ 26). Confirm exact figures with your accountant.
          </p>
        </div>
      )}
    </SectionCard>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-fg-muted">{label}</span>
      <span className="tabular">{value}</span>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Landmark, PenLine, ScrollText, ShieldAlert } from "lucide-react";
import { loadCompanyGovernance } from "@/app/governance/actions";
import type { CompanyGovernance } from "@/lib/governance-shared";

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
const num = (n: number | null) => (n == null ? "—" : n.toLocaleString("en-GB"));

/**
 * Board-level governance for one company: cap table, signatory matrix and the
 * resolutions log. Deliberately a reference view (no daily-noise) — it sits on
 * the company profile and feeds the monthly board pack.
 */
export function GovernancePanel({ companyId }: { companyId: number }) {
  const [gov, setGov] = useState<CompanyGovernance | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let live = true;
    loadCompanyGovernance(companyId).then((g) => { if (live) { setGov(g); setLoaded(true); } });
    return () => { live = false; };
  }, [companyId]);

  if (!loaded) return null;
  const g = gov!;
  const hasAny = g.capTable.holders.length > 0 || g.signatories.length > 0 || g.resolutions.length > 0;
  if (!hasAny) return null;

  return (
    <section className="glass elevated rounded-2xl p-4 space-y-4">
      <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold">
        <Landmark size={15} className="text-accent" /> Governance
        <span className="ml-2 text-[10px] font-normal uppercase tracking-wider text-fg-subtle inline-flex items-center gap-1">
          <ShieldAlert size={11} /> board reference
        </span>
      </h2>

      {/* Cap table */}
      {g.capTable.holders.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-fg-muted">
            Cap table
            <span className="ml-auto text-[10px] normal-case text-fg-subtle">
              issued {num(g.capTable.issued)}{g.capTable.authorised ? ` / ${num(g.capTable.authorised)} authorised` : ""}
            </span>
          </div>
          <div className="space-y-1.5">
            {g.capTable.holders.map((h, i) => (
              <div key={i} className="space-y-0.5">
                <div className="flex items-center justify-between gap-2 text-[13px]">
                  <span className="truncate">{h.holder}{h.holderType === "Corporate" ? " (corporate)" : ""}</span>
                  <span className="tabular text-fg-muted shrink-0">{h.pct != null ? `${h.pct}%` : ""}{h.shares != null ? ` · ${num(h.shares)}` : ""}</span>
                </div>
                {h.pct != null && (
                  <div className="h-1.5 rounded-full bg-bg-subtle overflow-hidden">
                    <div className="h-full rounded-full bg-accent/70" style={{ width: `${Math.min(100, h.pct)}%` }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Signatories */}
      {g.signatories.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[11px] font-medium uppercase tracking-wider text-fg-muted inline-flex items-center gap-1.5"><PenLine size={12} /> Signatories</div>
          <div className="flex flex-wrap gap-1.5">
            {g.signatories.map((s) => (
              <span key={s.id} className="inline-flex items-center gap-1 rounded-full bg-bg-subtle px-2 py-0.5 text-[12px]">
                {s.name}{s.scope ? <span className="text-fg-subtle text-[10px]">· {s.scope}</span> : null}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Resolutions */}
      {g.resolutions.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[11px] font-medium uppercase tracking-wider text-fg-muted inline-flex items-center gap-1.5"><ScrollText size={12} /> Resolutions</div>
          <ul className="space-y-1">
            {g.resolutions.map((r) => (
              <li key={r.id} className="flex items-start gap-2 text-[12px]">
                <span className="tabular text-fg-subtle w-20 shrink-0">{fmtDate(r.date)}</span>
                <span className="min-w-0">
                  <span className="text-fg">{r.summary}</span>
                  {r.type ? <span className="text-fg-subtle"> · {r.type}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

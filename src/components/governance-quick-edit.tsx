"use client";

import { useState, useTransition } from "react";
import { Plus, Check, Gavel, AlertTriangle, X } from "lucide-react";
import { addRiskAction, setRiskStatusAction, decideDecisionAction } from "@/app/governance/actions";

type PendingDecision = { id: number; code: string; title: string };
type OpenRisk = { id: number; code: string; title: string; status: string };
const input = "rounded-md border border-border bg-bg px-2 py-1 text-[12px] outline-none focus:border-accent/60";

/**
 * Print-hidden editor for the board pack's portfolio governance: add a risk,
 * close an open risk, and mark a pending decision decided — so the board pack
 * (and its monthly PDF) stays live without the seed script.
 */
export function GovernanceQuickEdit({ pendingDecisions, openRisks }: { pendingDecisions: PendingDecision[]; openRisks: OpenRisk[] }) {
  const [open, setOpen] = useState(false);
  const [addingRisk, setAddingRisk] = useState(false);
  const [, start] = useTransition();
  const [code, setCode] = useState(""); const [title, setTitle] = useState("");
  const [likelihood, setLikelihood] = useState(""); const [impact, setImpact] = useState("");
  const [decideId, setDecideId] = useState<number | null>(null); const [decisionText, setDecisionText] = useState("");

  return (
    <div className="print-hidden glass rounded-2xl p-3 space-y-2">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 text-sm font-medium text-fg-muted">
        <Gavel size={15} className="text-accent" /> Edit governance (risks &amp; decisions)
        <span className="ml-auto text-[11px]">{open ? "Close" : "Open"}</span>
      </button>

      {open && (
        <div className="space-y-3 pt-1">
          {/* Decisions */}
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-fg-subtle mb-1">Pending decisions</p>
            {pendingDecisions.length === 0 ? <p className="text-[12px] text-fg-subtle">None pending.</p> : (
              <ul className="space-y-1">
                {pendingDecisions.map((d) => (
                  <li key={d.id} className="flex items-center gap-2 text-[12px]">
                    <span className="min-w-0 flex-1 truncate">{d.code} · {d.title}</span>
                    {decideId === d.id ? (
                      <span className="inline-flex items-center gap-1">
                        <input autoFocus className={input + " w-40"} placeholder="Decision…" value={decisionText} onChange={(e) => setDecisionText(e.target.value)} />
                        <button type="button" onClick={() => start(async () => { await decideDecisionAction(d.id, decisionText); setDecideId(null); setDecisionText(""); })} className="rounded-md bg-accent px-2 py-1 text-[11px] text-accent-fg"><Check size={11} /></button>
                        <button type="button" onClick={() => setDecideId(null)} className="text-fg-subtle"><X size={12} /></button>
                      </span>
                    ) : (
                      <button type="button" onClick={() => setDecideId(d.id)} className="rounded-md bg-bg-subtle px-2 py-0.5 text-[11px] text-fg-muted hover:bg-bg-muted">Mark decided</button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Risks */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <p className="text-[11px] font-medium uppercase tracking-wider text-fg-subtle">Open risks</p>
              <button type="button" onClick={() => setAddingRisk((a) => !a)} className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-fg-subtle hover:bg-bg-muted">{addingRisk ? <X size={11} /> : <Plus size={11} />} {addingRisk ? "Close" : "Add risk"}</button>
            </div>
            {addingRisk && (
              <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-bg-subtle/40 p-2 mb-1">
                <input className={input + " w-24"} placeholder="Code (R-…)" value={code} onChange={(e) => setCode(e.target.value)} />
                <input className={input + " flex-1 min-w-[10rem]"} placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
                <input className={input + " w-14"} placeholder="L 1-3" value={likelihood} onChange={(e) => setLikelihood(e.target.value)} />
                <input className={input + " w-14"} placeholder="I 1-3" value={impact} onChange={(e) => setImpact(e.target.value)} />
                <button type="button" onClick={() => start(async () => { const r = await addRiskAction({ code, title, category: null, likelihood: likelihood ? Number(likelihood) : null, impact: impact ? Number(impact) : null, owner: null, mitigation: null }); if (r.ok) { setCode(""); setTitle(""); setLikelihood(""); setImpact(""); setAddingRisk(false); } else alert(r.error); })} className="rounded-md bg-accent px-2 py-1 text-[11px] text-accent-fg"><AlertTriangle size={11} /> Add</button>
              </div>
            )}
            {openRisks.length === 0 ? <p className="text-[12px] text-fg-subtle">No open risks.</p> : (
              <ul className="space-y-1">
                {openRisks.map((r) => (
                  <li key={r.id} className="flex items-center gap-2 text-[12px]">
                    <span className="min-w-0 flex-1 truncate">{r.code} · {r.title}</span>
                    <button type="button" onClick={() => start(async () => { await setRiskStatusAction(r.id, "Closed"); })} className="rounded-md bg-bg-subtle px-2 py-0.5 text-[11px] text-fg-muted hover:bg-bg-muted">Close</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

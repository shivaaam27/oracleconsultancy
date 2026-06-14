"use client";

import { useEffect, useState, useTransition } from "react";
import { Landmark, PenLine, ScrollText, ShieldAlert, Plus, X } from "lucide-react";
import {
  loadCompanyGovernance,
  addCapHolderAction, deleteCapHolderAction,
  addSignatoryAction, deleteSignatoryAction,
  addResolutionAction, deleteResolutionAction,
} from "@/app/governance/actions";
import type { CompanyGovernance } from "@/lib/governance-shared";

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
const num = (n: number | null) => (n == null ? "—" : n.toLocaleString("en-GB"));
const input = "rounded-md border border-border bg-bg px-2 py-1 text-[12px] outline-none focus:border-accent/60";

/**
 * Board-level governance for one company: cap table, signatory matrix and the
 * resolutions log — now editable in-app (add/remove), so the board pack stays
 * live and new companies (e.g. V1 Intertrade) can be filled in without the seed.
 */
export function GovernancePanel({ companyId }: { companyId: number }) {
  const [gov, setGov] = useState<CompanyGovernance | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [adding, setAdding] = useState<"" | "cap" | "sig" | "res">("");
  const [, start] = useTransition();

  async function refresh() {
    const g = await loadCompanyGovernance(companyId);
    setGov(g); setLoaded(true);
  }
  useEffect(() => { void refresh(); /* eslint-disable-next-line */ }, [companyId]);

  if (!loaded || !gov) return null;
  const g = gov;
  const empty = g.capTable.holders.length === 0 && g.signatories.length === 0 && g.resolutions.length === 0;

  function mutate(fn: () => Promise<unknown>) { start(async () => { await fn(); await refresh(); }); }

  return (
    <section className="glass elevated rounded-2xl p-4 space-y-4">
      <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold">
        <Landmark size={15} className="text-accent" /> Governance
        <span className="ml-2 text-[10px] font-normal uppercase tracking-wider text-fg-subtle inline-flex items-center gap-1">
          <ShieldAlert size={11} /> board reference
        </span>
      </h2>

      {/* Cap table */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-fg-muted">
          Cap table
          <span className="ml-auto text-[10px] normal-case text-fg-subtle">
            {g.capTable.issued != null ? `issued ${num(g.capTable.issued)}` : ""}{g.capTable.authorised ? ` / ${num(g.capTable.authorised)} authorised` : ""}
          </span>
          <AddToggle on={adding === "cap"} onClick={() => setAdding(adding === "cap" ? "" : "cap")} />
        </div>
        {g.capTable.holders.map((h, i) => (
          <div key={i} className="group flex items-center gap-2 text-[13px]">
            <span className="truncate">{h.holder}{h.holderType === "Corporate" ? " (corporate)" : ""}</span>
            <span className="ml-auto tabular text-fg-muted shrink-0">{h.pct != null ? `${h.pct}%` : ""}{h.shares != null ? ` · ${num(h.shares)}` : ""}</span>
            <DeleteBtn onClick={() => mutate(() => deleteCapHolderAction(h.id, companyId))} />
          </div>
        ))}
        {adding === "cap" && <CapForm companyId={companyId} onDone={() => { setAdding(""); }} onSaved={refresh} />}
      </div>

      {/* Signatories */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-fg-muted">
          <PenLine size={12} /> Signatories
          <AddToggle on={adding === "sig"} onClick={() => setAdding(adding === "sig" ? "" : "sig")} className="ml-auto" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {g.signatories.map((sg) => (
            <span key={sg.id} className="group inline-flex items-center gap-1 rounded-full bg-bg-subtle px-2 py-0.5 text-[12px]">
              {sg.name}{sg.scope ? <span className="text-fg-subtle text-[10px]">· {sg.scope}</span> : null}
              <button type="button" onClick={() => mutate(() => deleteSignatoryAction(sg.id, companyId))} className="text-fg-subtle hover:text-danger opacity-0 group-hover:opacity-100"><X size={10} /></button>
            </span>
          ))}
        </div>
        {adding === "sig" && <SigForm companyId={companyId} onDone={() => setAdding("")} onSaved={refresh} />}
      </div>

      {/* Resolutions */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-fg-muted">
          <ScrollText size={12} /> Resolutions
          <AddToggle on={adding === "res"} onClick={() => setAdding(adding === "res" ? "" : "res")} className="ml-auto" />
        </div>
        <ul className="space-y-1">
          {g.resolutions.map((r) => (
            <li key={r.id} className="group flex items-start gap-2 text-[12px]">
              <span className="tabular text-fg-subtle w-20 shrink-0">{fmtDate(r.date)}</span>
              <span className="min-w-0 flex-1"><span className="text-fg">{r.summary}</span>{r.type ? <span className="text-fg-subtle"> · {r.type}</span> : null}</span>
              <button type="button" onClick={() => mutate(() => deleteResolutionAction(r.id, companyId))} className="text-fg-subtle hover:text-danger opacity-0 group-hover:opacity-100"><X size={11} /></button>
            </li>
          ))}
        </ul>
        {adding === "res" && <ResForm companyId={companyId} onDone={() => setAdding("")} onSaved={refresh} />}
      </div>

      {empty && adding === "" && <p className="text-[12px] text-fg-subtle">No governance recorded yet — use the + buttons to add the cap table, signatories and resolutions.</p>}
    </section>
  );
}

function AddToggle({ on, onClick, className }: { on: boolean; onClick: () => void; className?: string }) {
  return <button type="button" onClick={onClick} className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-fg-subtle hover:bg-bg-muted ${className ?? ""}`}>{on ? <X size={11} /> : <Plus size={11} />} {on ? "Close" : "Add"}</button>;
}
function DeleteBtn({ onClick, hidden }: { onClick: () => void; hidden?: boolean }) {
  if (hidden) return null;
  return <button type="button" onClick={onClick} className="text-fg-subtle hover:text-danger opacity-0 group-hover:opacity-100"><X size={11} /></button>;
}

function CapForm({ companyId, onDone, onSaved }: { companyId: number; onDone: () => void; onSaved: () => void }) {
  const [holder, setHolder] = useState(""); const [pct, setPct] = useState(""); const [shares, setShares] = useState("");
  const [, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-bg-subtle/40 p-2">
      <input className={input + " flex-1 min-w-[8rem]"} placeholder="Holder" value={holder} onChange={(e) => setHolder(e.target.value)} />
      <input className={input + " w-16"} placeholder="%" value={pct} onChange={(e) => setPct(e.target.value)} />
      <input className={input + " w-20"} placeholder="shares" value={shares} onChange={(e) => setShares(e.target.value)} />
      <button type="button" onClick={() => start(async () => { await addCapHolderAction(companyId, holder, shares ? Number(shares) : null, pct ? Number(pct) : null, null); onDone(); onSaved(); })}
        className="rounded-md bg-accent px-2 py-1 text-[11px] text-accent-fg">Add</button>
    </div>
  );
}
function SigForm({ companyId, onDone, onSaved }: { companyId: number; onDone: () => void; onSaved: () => void }) {
  const [name, setName] = useState(""); const [scope, setScope] = useState("");
  const [, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-bg-subtle/40 p-2">
      <input className={input + " flex-1 min-w-[8rem]"} placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
      <input className={input + " w-24"} placeholder="scope (Bank…)" value={scope} onChange={(e) => setScope(e.target.value)} />
      <button type="button" onClick={() => start(async () => { await addSignatoryAction(companyId, name, scope); onDone(); onSaved(); })} className="rounded-md bg-accent px-2 py-1 text-[11px] text-accent-fg">Add</button>
    </div>
  );
}
function ResForm({ companyId, onDone, onSaved }: { companyId: number; onDone: () => void; onSaved: () => void }) {
  const [summary, setSummary] = useState(""); const [date, setDate] = useState(""); const [type, setType] = useState("");
  const [, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-bg-subtle/40 p-2">
      <input type="date" className={input + " w-32"} value={date} onChange={(e) => setDate(e.target.value)} />
      <input className={input + " w-28"} placeholder="type" value={type} onChange={(e) => setType(e.target.value)} />
      <input className={input + " flex-1 min-w-[10rem]"} placeholder="Summary" value={summary} onChange={(e) => setSummary(e.target.value)} />
      <button type="button" onClick={() => start(async () => { await addResolutionAction(companyId, date || null, type, summary); onDone(); onSaved(); })} className="rounded-md bg-accent px-2 py-1 text-[11px] text-accent-fg">Add</button>
    </div>
  );
}

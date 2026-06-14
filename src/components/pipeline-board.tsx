"use client";

import { useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, Plus, Archive, Loader2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { PIPELINE_STAGES, STAGE_TONE, type PipelineItem, type PipelineStage } from "@/lib/pipeline-shared";
import { createPipelineItemAction, movePipelineStageAction, archivePipelineItemAction, linkPipelineDocumentAction } from "@/app/hrms/pipeline/actions";
import { DocLinkControl, type LinkDoc } from "./doc-link-control";

const COL_TONE: Record<string, string> = {
  muted: "border-border/60", accent: "border-accent/40", warn: "border-warn/50", success: "border-success/50",
};
const DOT: Record<string, string> = { muted: "bg-fg-subtle", accent: "bg-accent", warn: "bg-warn", success: "bg-success" };

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : null);

/**
 * In-flight bureaucracy kanban — permits/visas/licences moving through the
 * government stages. Move a card with the ← / → controls; add new cases; archive
 * finished ones.
 */
export function PipelineBoard({ items, companies, documents = [] }: { items: PipelineItem[]; companies: Array<{ id: number; name: string }>; documents?: LinkDoc[] }) {
  const [adding, setAdding] = useState(false);
  const [, start] = useTransition();
  const [busy, setBusy] = useState<number | null>(null);

  function move(id: number, dir: -1 | 1, stage: PipelineStage) {
    const idx = PIPELINE_STAGES.indexOf(stage) + dir;
    if (idx < 0 || idx >= PIPELINE_STAGES.length) return;
    setBusy(id);
    start(async () => { await movePipelineStageAction(id, PIPELINE_STAGES[idx]); setBusy(null); });
  }
  function archive(id: number) {
    if (!confirm("Archive this case? (Use when it's fully issued/closed.)")) return;
    setBusy(id);
    start(async () => { await archivePipelineItemAction(id); setBusy(null); });
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button type="button" onClick={() => setAdding((a) => !a)}
          className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg hover:opacity-90">
          <Plus size={14} /> New case
        </button>
      </div>

      {adding && <AddForm companies={companies} onDone={() => setAdding(false)} />}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {PIPELINE_STAGES.map((stage) => {
          const col = items.filter((i) => i.stage === stage);
          const tone = STAGE_TONE[stage];
          return (
            <div key={stage} className={cn("rounded-2xl border bg-bg-subtle/30 p-2.5", COL_TONE[tone])}>
              <div className="mb-2 flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-fg-muted">
                <span className={cn("h-1.5 w-1.5 rounded-full", DOT[tone])} /> {stage}
                <span className="ml-auto tabular text-fg-subtle">{col.length}</span>
              </div>
              <div className="space-y-2">
                {col.map((i) => (
                  <div key={i.id} className="rounded-xl bg-bg-elev ring-1 ring-border/60 p-2.5">
                    <div className="flex items-start gap-1.5">
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-medium truncate">{i.subject}</span>
                        <span className="block text-[11px] text-fg-muted truncate">{i.type}{i.companyName ? ` · ${i.companyName}` : ""}</span>
                      </span>
                      <button type="button" onClick={() => archive(i.id)} disabled={busy === i.id} title="Archive"
                        className="rounded-md p-1 text-fg-subtle hover:bg-bg-muted hover:text-danger">
                        {busy === i.id ? <Loader2 size={12} className="animate-spin" /> : <Archive size={12} />}
                      </button>
                    </div>
                    {(i.controlNo || i.amount) && (
                      <div className="mt-1 text-[11px] text-fg-muted">{[i.controlNo && `Ctrl ${i.controlNo}`, i.amount].filter(Boolean).join(" · ")}</div>
                    )}
                    {i.nextAction && <div className="mt-1 text-[11px] text-fg-subtle">→ {i.nextAction}</div>}
                    <div className="mt-1.5 flex items-center gap-1">
                      <button type="button" disabled={PIPELINE_STAGES.indexOf(stage) === 0 || busy === i.id} onClick={() => move(i.id, -1, stage)}
                        className="rounded-md p-1 text-fg-subtle hover:bg-bg-muted disabled:opacity-30"><ChevronLeft size={14} /></button>
                      <button type="button" disabled={PIPELINE_STAGES.indexOf(stage) === PIPELINE_STAGES.length - 1 || busy === i.id} onClick={() => move(i.id, 1, stage)}
                        className="rounded-md p-1 text-fg-subtle hover:bg-bg-muted disabled:opacity-30"><ChevronRight size={14} /></button>
                      <span className="ml-auto inline-flex items-center gap-1.5">
                        <DocLinkControl documentId={i.documentId} documents={documents} companyId={i.companyId} onLink={(docId) => linkPipelineDocumentAction(i.id, docId).then(() => {})} />
                        {i.deadline && <span className="text-[10px] text-fg-subtle">due {fmtDate(i.deadline)}</span>}
                      </span>
                    </div>
                  </div>
                ))}
                {col.length === 0 && <p className="px-1 py-2 text-[11px] text-fg-subtle">—</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AddForm({ companies, onDone }: { companies: Array<{ id: number; name: string }>; onDone: () => void }) {
  const [subject, setSubject] = useState("");
  const [type, setType] = useState("");
  const [companyId, setCompanyId] = useState<string>("");
  const [nextAction, setNextAction] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = "w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-[13px] outline-none focus:border-accent/60";

  async function save() {
    setSaving(true); setError(null);
    const res = await createPipelineItemAction({ subject, type, companyId: companyId ? Number(companyId) : null, nextAction: nextAction || null });
    setSaving(false);
    if (!res.ok) { setError(res.error ?? "Couldn't save."); return; }
    onDone();
  }

  return (
    <div className="rounded-xl border border-border/70 bg-bg-subtle/30 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-fg-muted">New case</span>
        <button type="button" onClick={onDone} className="ml-auto rounded-md p-1 text-fg-subtle hover:bg-bg-muted"><X size={13} /></button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input className={input} placeholder="Subject (e.g. Sanjay Kaushik)" value={subject} onChange={(e) => setSubject(e.target.value)} />
        <input className={input} placeholder="Type (e.g. Work Permit)" value={type} onChange={(e) => setType(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <select className={input} value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
          <option value="">— Company —</option>
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input className={input} placeholder="Next action" value={nextAction} onChange={(e) => setNextAction(e.target.value)} />
      </div>
      <div className="flex items-center justify-end gap-1.5">
        <button type="button" onClick={onDone} className="rounded-lg px-2.5 py-1 text-[12px] text-fg-muted hover:bg-bg-muted/60">Cancel</button>
        <button type="button" onClick={save} disabled={saving} className="rounded-lg bg-accent px-3 py-1 text-[12px] font-medium text-accent-fg hover:opacity-90 disabled:opacity-50">{saving ? "Saving…" : "Add case"}</button>
      </div>
      {error && <p className="text-[12px] text-danger">{error}</p>}
    </div>
  );
}

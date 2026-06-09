"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Check, Plus, Link2, Send, Ban, RotateCcw, Loader2, ShieldCheck, ChevronDown, Pencil, Trash2 } from "lucide-react";
import { Badge } from "./ui";
import { useToast } from "./toast";
import { cn } from "@/lib/cn";
import { DOC_CATEGORIES } from "@/lib/documents-shared";
import {
  REQUIREMENT_STATUS_LABELS,
  REQUIREMENT_STATUS_TONE,
  type EffectiveStatus,
} from "@/lib/requirements-shared";
import {
  creqMarkRequested,
  creqLinkDocument,
  creqUnlinkDocument,
  creqVerify,
  creqUnverify,
  creqWaive,
  creqUnwaive,
  creqAdd,
  creqEdit,
  creqRemove,
} from "@/app/companies/[id]/requirement-actions";

type ReqFields = { label: string; category: string | null; mandatory: boolean };

function ReqEditor({ initial, onSave, onCancel, busy }: {
  initial?: ReqFields;
  onSave: (v: ReqFields) => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [mandatory, setMandatory] = useState(initial?.mandatory ?? true);
  return (
    <div className="flex flex-col gap-2 bg-bg-subtle/50 px-3 py-2.5">
      <input value={label} onChange={(e) => setLabel(e.target.value)} autoFocus
        onKeyDown={(e) => { if (e.key === "Enter" && label.trim()) onSave({ label: label.trim(), category: category || null, mandatory }); if (e.key === "Escape") onCancel(); }}
        placeholder="Document name (e.g. VRN certificate)"
        className="rounded-md bg-bg-elev text-sm ring-1 ring-border px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent/40" />
      <div className="flex flex-wrap items-center gap-2">
        <select value={category} onChange={(e) => setCategory(e.target.value)}
          className="rounded-md bg-bg-elev text-[11px] text-fg-muted ring-1 ring-border px-1.5 py-1">
          <option value="">No category</option>
          {DOC_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <label className="inline-flex items-center gap-1.5 text-[11px] text-fg-muted cursor-pointer">
          <input type="checkbox" checked={mandatory} onChange={(e) => setMandatory(e.target.checked)} className="accent-accent" /> Required
        </label>
        <div className="ml-auto flex items-center gap-1.5">
          <button type="button" onClick={onCancel} disabled={busy}
            className="rounded-md px-2 py-1 text-[11px] text-fg-muted hover:text-fg hover:bg-bg-muted disabled:opacity-50">Cancel</button>
          <button type="button" disabled={busy || !label.trim()}
            onClick={() => onSave({ label: label.trim(), category: category || null, mandatory })}
            className="inline-flex items-center gap-1 rounded-md bg-accent text-accent-fg px-2.5 py-1 text-[11px] font-medium disabled:opacity-50">
            {busy ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />} Save
          </button>
        </div>
      </div>
    </div>
  );
}

type ChecklistItem = {
  id: number;
  label: string;
  category: string | null;
  mandatory: boolean;
  expiryTracked: boolean;
  status: "missing" | "requested" | "received" | "verified" | "waived";
  effectiveStatus: EffectiveStatus;
  documentId: number | null;
  documentTitle: string | null;
  docStatus: string | null;
  expiryLabel: string | null;
  verifiedAt: string | null;
  isCustom: boolean;
};

type Checklist = {
  companyId: number;
  score: number;
  band: "Good" | "Watch" | "Risk";
  mandatoryTotal: number;
  mandatoryVerified: number;
  missingMandatory: number;
  expiredMandatory: number;
  items: ChecklistItem[];
};

const bandTone = { Good: "success", Watch: "warn", Risk: "danger" } as const;

function ScoreRing({ score, band }: { score: number; band: "Good" | "Watch" | "Risk" }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const dash = (score / 100) * c;
  const colour = band === "Good" ? "var(--success)" : band === "Watch" ? "var(--warn)" : "var(--danger)";
  return (
    <div className="relative h-16 w-16 shrink-0">
      <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke="hsl(var(--border))" strokeWidth="6" />
        <circle cx="32" cy="32" r={r} fill="none" stroke={`hsl(${colour})`} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`} style={{ transition: "stroke-dasharray 0.5s ease" }} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-sm font-semibold tabular">{score}%</div>
    </div>
  );
}

export function CompanyRequirementsChecklist({
  companyId,
  documents,
  onAddDocument,
  onChanged,
  reloadSignal,
  defaultOpen = true,
}: {
  companyId: number;
  /** This company's saved documents, for the "Link…" dropdown. */
  documents: Array<{ id: number; title: string; category: string | null }>;
  /** Opens the document form in place (over the page), prefilled. */
  onAddDocument: (opts: { title: string; category: string | null }) => void;
  onChanged?: () => void;
  reloadSignal?: number;
  /** Whether the checklist starts expanded. Default true. */
  defaultOpen?: boolean;
}) {
  const { toast } = useToast();
  const [data, setData] = useState<Checklist | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [open, setOpen] = useState(defaultOpen);
  const [openItem, setOpenItem] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const autoSet = useRef(false);
  const [, startTransition] = useTransition();

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/company-requirements?id=${companyId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Could not load checklist"))))
      .then((d: Checklist) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [companyId]);

  useEffect(() => load(), [load]);
  useEffect(() => {
    if (reloadSignal === undefined) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadSignal]);

  useEffect(() => {
    if (!data || autoSet.current) return;
    autoSet.current = true;
    if (defaultOpen && (data.missingMandatory > 0 || data.expiredMandatory > 0)) setOpen(true);
  }, [data, defaultOpen]);

  function run(id: number, fn: () => Promise<{ ok: boolean; error?: string }>, okMsg?: string, after?: () => void) {
    setBusyId(id);
    startTransition(async () => {
      const res = await fn();
      setBusyId(null);
      if (!res.ok) { toast(res.error ?? "Something went wrong", { tone: "danger" }); return; }
      if (okMsg) toast(okMsg, { tone: "success" });
      after?.();
      load();
      onChanged?.();
    });
  }

  function doAdd(v: ReqFields) { run(-1, () => creqAdd(companyId, v), "Requirement added.", () => setAdding(false)); }
  function doEdit(id: number, v: ReqFields) { run(id, () => creqEdit(id, v), "Requirement updated.", () => setEditingId(null)); }
  function doRemove(id: number) { run(id, () => creqRemove(id), "Requirement removed.", () => setOpenItem(null)); }

  if (loading && !data) {
    return (
      <div className="glass elevated rounded-2xl p-4 flex items-center gap-2 text-sm text-fg-muted">
        <Loader2 size={15} className="animate-spin" /> Loading compliance checklist…
      </div>
    );
  }
  if (!data) return null;

  const subtleBtn = "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-fg-muted hover:text-fg hover:bg-bg-muted transition-colors";
  const actionBtn = "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium ring-1 transition-colors";

  return (
    <details className="group glass elevated rounded-2xl overflow-hidden" open={open}>
      <summary onClick={(e) => { e.preventDefault(); setOpen((o) => !o); }}
        className="list-none cursor-pointer flex items-center gap-3 p-3 select-none">
        <ScoreRing score={data.score} band={data.band} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <ShieldCheck size={15} className="text-accent" />
            <span className="text-sm font-semibold">Statutory checklist</span>
            <Badge tone={bandTone[data.band]}>{data.band}</Badge>
          </div>
          <p className="mt-0.5 text-xs text-fg-muted">
            {data.mandatoryTotal === 0
              ? "No required documents set for this company."
              : `${data.mandatoryVerified} of ${data.mandatoryTotal} required verified` +
                (data.missingMandatory ? ` · ${data.missingMandatory} missing` : "") +
                (data.expiredMandatory ? ` · ${data.expiredMandatory} expired` : "")}
          </p>
        </div>
        <ChevronDown size={16} className={cn("shrink-0 text-fg-subtle transition-transform", open && "rotate-180")} />
      </summary>

      <div className="border-t border-border/70 bg-bg-subtle/30 px-3 py-1.5">
        <span className="text-[11px] text-fg-subtle">This list is specific to this company — add VRN, extra registrations, leases, or remove anything that doesn&apos;t apply.</span>
      </div>

      <div className="divide-y divide-border/50">
        {data.items.map((item) => {
          const tone = REQUIREMENT_STATUS_TONE[item.effectiveStatus];
          const busy = busyId === item.id;
          const expanded = openItem === item.id;
          const linkable = documents.filter((d) => d.id !== item.documentId);
          const needsDoc = item.effectiveStatus === "missing" || item.effectiveStatus === "requested";
          const dot = tone === "success" ? "bg-success" : tone === "warn" ? "bg-warn" : tone === "danger" ? "bg-danger" : tone === "info" ? "bg-info" : "bg-fg-subtle";
          const subtitle = item.documentTitle
            ? [item.documentTitle, item.expiryLabel].filter(Boolean).join(" · ")
            : item.mandatory ? "Required" : "Optional";
          const renderAdd = (label: string) => (
            <button type="button" disabled={busy}
              onClick={() => onAddDocument({ title: item.label, category: item.category })}
              className={cn(actionBtn, "bg-accent text-accent-fg ring-transparent hover:opacity-90")}>
              <Plus size={12} /> {label}
            </button>
          );
          return (
            <div key={item.id} className={cn(busy && "opacity-60")}>
              {editingId === item.id ? (
                <ReqEditor
                  initial={{ label: item.label, category: item.category, mandatory: item.mandatory }}
                  onSave={(v) => doEdit(item.id, v)}
                  onCancel={() => setEditingId(null)}
                  busy={busy}
                />
              ) : (
                <>
                  <button type="button" onClick={() => setOpenItem(expanded ? null : item.id)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-bg-muted/40 transition-colors">
                    <span className={cn("h-2 w-2 shrink-0 rounded-full", dot)} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium truncate">{item.label}</span>
                      <span className={cn("block text-[11px] truncate", item.docStatus === "Expired" ? "text-danger" : item.docStatus === "Expiring" ? "text-warn" : "text-fg-muted")}>{subtitle}</span>
                    </span>
                    <Badge tone={tone}>{REQUIREMENT_STATUS_LABELS[item.effectiveStatus]}</Badge>
                    <ChevronDown size={14} className={cn("shrink-0 text-fg-subtle transition-transform", expanded && "rotate-180")} />
                  </button>

                  {expanded && (
                    <div className="flex flex-wrap items-center gap-1.5 pl-[26px] pr-3 pb-2.5">
                      {item.effectiveStatus === "received" && (
                        <button type="button" disabled={busy} onClick={() => run(item.id, () => creqVerify(item.id), "Verified.")}
                          className={cn(actionBtn, "bg-success-soft text-success ring-success/25 hover:bg-success-soft/80")}>
                          <Check size={12} /> Verify
                        </button>
                      )}
                      {(item.effectiveStatus === "verified" || item.effectiveStatus === "expiring") && (
                        <button type="button" disabled={busy} onClick={() => run(item.id, () => creqUnverify(item.id))} className={subtleBtn}>Unverify</button>
                      )}
                      {item.effectiveStatus === "expired" && renderAdd("Renew")}
                      {needsDoc && (
                        <>
                          {renderAdd("Add")}
                          {linkable.length > 0 && (
                            <select disabled={busy} defaultValue=""
                              onChange={(e) => { const v = parseInt(e.target.value, 10); if (!Number.isNaN(v)) run(item.id, () => creqLinkDocument(item.id, v), "Document linked."); }}
                              className="rounded-md bg-bg-subtle text-[11px] text-fg-muted ring-1 ring-border px-1.5 py-1 max-w-[8.5rem]">
                              <option value="" disabled>Link…</option>
                              {linkable.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
                            </select>
                          )}
                          {item.effectiveStatus === "missing" && (
                            <button type="button" disabled={busy} onClick={() => run(item.id, () => creqMarkRequested(item.id), "Marked as requested.")} className={subtleBtn}>
                              <Send size={11} /> Requested
                            </button>
                          )}
                        </>
                      )}
                      {item.documentId && item.effectiveStatus !== "verified" && item.effectiveStatus !== "expiring" && (
                        <button type="button" disabled={busy} onClick={() => run(item.id, () => creqUnlinkDocument(item.id))} className={subtleBtn}>
                          <Link2 size={11} /> Unlink
                        </button>
                      )}
                      {item.effectiveStatus === "waived" ? (
                        <button type="button" disabled={busy} onClick={() => run(item.id, () => creqUnwaive(item.id))} className={subtleBtn}>
                          <RotateCcw size={11} /> Restore
                        </button>
                      ) : needsDoc ? (
                        <button type="button" disabled={busy} onClick={() => run(item.id, () => creqWaive(item.id, null))} className={subtleBtn}>
                          <Ban size={11} /> Waive
                        </button>
                      ) : null}
                      <span className="mx-0.5 h-3 w-px bg-border/70" />
                      <button type="button" disabled={busy} onClick={() => setEditingId(item.id)} className={subtleBtn}>
                        <Pencil size={11} /> Edit
                      </button>
                      <button type="button" disabled={busy} onClick={() => doRemove(item.id)}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-fg-muted hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-50">
                        <Trash2 size={11} /> Remove
                      </button>
                      {busy && <Loader2 size={12} className="animate-spin text-fg-subtle" />}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}

        {adding ? (
          <ReqEditor onSave={doAdd} onCancel={() => setAdding(false)} busy={busyId === -1} />
        ) : (
          <button type="button" onClick={() => setAdding(true)}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-[11px] font-medium text-accent hover:bg-bg-muted/40 transition-colors">
            <Plus size={13} /> Add a required document
          </button>
        )}
      </div>
    </details>
  );
}

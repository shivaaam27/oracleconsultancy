"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Check, Plus, Link2, Send, Ban, RotateCcw, Loader2, ShieldCheck, ChevronDown } from "lucide-react";
import { Badge } from "./ui";
import { useToast } from "./toast";
import { cn } from "@/lib/cn";
import {
  REQUIREMENT_STATUS_LABELS,
  REQUIREMENT_STATUS_TONE,
  type EffectiveStatus,
} from "@/lib/requirements-shared";
import {
  reqMarkRequested,
  reqLinkDocument,
  reqUnlinkDocument,
  reqVerify,
  reqUnverify,
  reqWaive,
  reqUnwaive,
} from "@/app/people/requirement-actions";

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
};

type Checklist = {
  personId: number;
  profileName: string | null;
  score: number;
  band: "Good" | "Watch" | "Risk";
  mandatoryTotal: number;
  mandatoryVerified: number;
  missingMandatory: number;
  expiredMandatory: number;
  items: ChecklistItem[];
  documents: Array<{ id: number; title: string; category: string | null; status: string }>;
};

const SPECIFIC = new Set(["Contract", "Passport", "Permit", "Immigration", "Tax", "Certificate", "Insurance", "Registration", "Licence", "Lease"]);

function addDocHref(personId: number, item: ChecklistItem) {
  const p = new URLSearchParams({ newdoc: "1", person: String(personId), title: item.label, from: `person:${personId}` });
  if (item.category && SPECIFIC.has(item.category)) p.set("category", item.category);
  return `/documents?${p.toString()}`;
}

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
        <circle
          cx="32" cy="32" r={r} fill="none" stroke={`hsl(${colour})`} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`} style={{ transition: "stroke-dasharray 0.5s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-sm font-semibold tabular">{score}%</div>
    </div>
  );
}

export function RequirementsChecklist({
  personId,
  onChanged,
  onNavigate,
  onSummary,
}: {
  personId: number;
  onChanged?: () => void;
  onNavigate?: () => void;
  onSummary?: (s: { score: number; band: "Good" | "Watch" | "Risk"; missing: number; total: number }) => void;
}) {
  const { toast } = useToast();
  const [data, setData] = useState<Checklist | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [openItem, setOpenItem] = useState<number | null>(null);
  const autoSet = useRef(false);
  const [, startTransition] = useTransition();

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/person-requirements?id=${personId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Could not load checklist"))))
      .then((d: Checklist) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [personId]);

  useEffect(() => load(), [load]);

  // Report summary up + smart auto-open once (when something needs attention).
  useEffect(() => {
    if (!data) return;
    onSummary?.({ score: data.score, band: data.band, missing: data.missingMandatory, total: data.mandatoryTotal });
    if (!autoSet.current) {
      autoSet.current = true;
      if (data.missingMandatory > 0 || data.expiredMandatory > 0) setOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  function run(id: number, fn: () => Promise<{ ok: boolean; error?: string }>, okMsg?: string) {
    setBusyId(id);
    startTransition(async () => {
      const res = await fn();
      setBusyId(null);
      if (!res.ok) { toast(res.error ?? "Something went wrong", { tone: "danger" }); return; }
      if (okMsg) toast(okMsg, { tone: "success" });
      load();
      onChanged?.();
    });
  }

  if (loading && !data) {
    return (
      <div className="rounded-2xl bg-bg-elev p-4 ring-1 ring-border flex items-center gap-2 text-sm text-fg-muted">
        <Loader2 size={15} className="animate-spin" /> Loading document compliance…
      </div>
    );
  }
  if (!data) return null;

  const subtleBtn = "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-fg-muted hover:text-fg hover:bg-bg-muted transition-colors";
  const actionBtn = "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium ring-1 transition-colors";

  return (
    <details className="group rounded-2xl bg-bg-elev ring-1 ring-border overflow-hidden" open={open}>
      <summary
        onClick={(e) => { e.preventDefault(); setOpen((o) => !o); }}
        className="list-none cursor-pointer flex items-center gap-3 p-3 select-none"
      >
        <ScoreRing score={data.score} band={data.band} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <ShieldCheck size={15} className="text-accent" />
            <span className="text-sm font-semibold">Document compliance</span>
            <Badge tone={bandTone[data.band]}>{data.band}</Badge>
          </div>
          <p className="mt-0.5 text-xs text-fg-muted">
            {data.mandatoryTotal === 0
              ? "No required documents for this person type."
              : `${data.mandatoryVerified} of ${data.mandatoryTotal} required verified` +
                (data.missingMandatory ? ` · ${data.missingMandatory} missing` : "") +
                (data.expiredMandatory ? ` · ${data.expiredMandatory} expired` : "")}
          </p>
        </div>
        <ChevronDown size={16} className={cn("shrink-0 text-fg-subtle transition-transform", open && "rotate-180")} />
      </summary>

      <div className="divide-y divide-border/50 border-t border-border/70">
        {data.items.map((item) => {
          const tone = REQUIREMENT_STATUS_TONE[item.effectiveStatus];
          const busy = busyId === item.id;
          const expanded = openItem === item.id;
          const linkable = data.documents.filter((d) => d.id !== item.documentId);
          const needsDoc = item.effectiveStatus === "missing" || item.effectiveStatus === "requested";
          const dot = tone === "success" ? "bg-success" : tone === "warn" ? "bg-warn" : tone === "danger" ? "bg-danger" : tone === "info" ? "bg-info" : "bg-fg-subtle";
          const subtitle = item.documentTitle
            ? [item.documentTitle, item.expiryLabel].filter(Boolean).join(" · ")
            : item.mandatory ? "Required" : "Optional";
          return (
            <div key={item.id} className={cn(busy && "opacity-60")}>
              {/* Compact one-line row — tap to reveal actions */}
              <button
                type="button"
                onClick={() => setOpenItem(expanded ? null : item.id)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-bg-muted/40 transition-colors"
              >
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
                    <button type="button" disabled={busy} onClick={() => run(item.id, () => reqVerify(item.id), "Verified.")}
                      className={cn(actionBtn, "bg-success-soft text-success ring-success/25 hover:bg-success-soft/80")}>
                      <Check size={12} /> Verify
                    </button>
                  )}
                  {(item.effectiveStatus === "verified" || item.effectiveStatus === "expiring") && (
                    <button type="button" disabled={busy} onClick={() => run(item.id, () => reqUnverify(item.id))} className={subtleBtn}>Unverify</button>
                  )}
                  {item.effectiveStatus === "expired" && (
                    <Link href={addDocHref(personId, item)} onClick={onNavigate}
                      className={cn(actionBtn, "bg-accent text-accent-fg ring-transparent hover:opacity-90")}>
                      <Plus size={12} /> Renew
                    </Link>
                  )}
                  {needsDoc && (
                    <>
                      <Link href={addDocHref(personId, item)} onClick={onNavigate}
                        className={cn(actionBtn, "bg-accent text-accent-fg ring-transparent hover:opacity-90")}>
                        <Plus size={12} /> Add
                      </Link>
                      {linkable.length > 0 && (
                        <select
                          disabled={busy}
                          defaultValue=""
                          onChange={(e) => { const v = parseInt(e.target.value, 10); if (!Number.isNaN(v)) run(item.id, () => reqLinkDocument(item.id, v), "Document linked."); }}
                          className="rounded-md bg-bg-subtle text-[11px] text-fg-muted ring-1 ring-border px-1.5 py-1 max-w-[8.5rem]"
                        >
                          <option value="" disabled>Link…</option>
                          {linkable.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
                        </select>
                      )}
                      {item.effectiveStatus === "missing" && (
                        <button type="button" disabled={busy} onClick={() => run(item.id, () => reqMarkRequested(item.id), "Marked as requested.")} className={subtleBtn}>
                          <Send size={11} /> Requested
                        </button>
                      )}
                    </>
                  )}
                  {item.documentId && item.effectiveStatus !== "verified" && item.effectiveStatus !== "expiring" && (
                    <button type="button" disabled={busy} onClick={() => run(item.id, () => reqUnlinkDocument(item.id))} className={subtleBtn}>
                      <Link2 size={11} /> Unlink
                    </button>
                  )}
                  {item.effectiveStatus === "waived" ? (
                    <button type="button" disabled={busy} onClick={() => run(item.id, () => reqUnwaive(item.id))} className={subtleBtn}>
                      <RotateCcw size={11} /> Restore
                    </button>
                  ) : needsDoc ? (
                    <button type="button" disabled={busy} onClick={() => run(item.id, () => reqWaive(item.id, null))} className={subtleBtn}>
                      <Ban size={11} /> Waive
                    </button>
                  ) : null}
                  {busy && <Loader2 size={12} className="animate-spin text-fg-subtle" />}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </details>
  );
}

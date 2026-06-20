"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, Plus, Link2, Send, Ban, RotateCcw, Loader2, ShieldCheck, ChevronDown, Pencil, Trash2, RefreshCw, CheckCircle2, History, CalendarClock, X, FileText } from "lucide-react";
import { Badge, Button, LinkButton } from "./ui";
import { DocumentForm } from "./document-form";
import { useToast } from "./toast";
import { cn } from "@/lib/cn";
import { CountUp } from "./arc-gauge";
import { DOC_CATEGORIES } from "@/lib/documents-shared";
import { ProgressTrack, EmptyState, SectionCard, type KitTone } from "./drawer-kit";
import {
  REQUIREMENT_STATUS_LABELS,
  REQUIREMENT_STATUS_TONE,
  type EffectiveStatus,
} from "@/lib/requirements-shared";
import {
  COMPLIANCE_ACTION_LABEL,
  complianceActor,
  type ComplianceEvent,
} from "@/lib/compliance-audit-shared";
import {
  reqMarkRequested,
  reqLinkDocument,
  reqUnlinkDocument,
  reqVerify,
  reqUnverify,
  reqWaive,
  reqUnwaive,
  reqAdd,
  reqEdit,
  reqRemove,
  reqSetReviewDate,
  reqSync,
  requestDocumentsByEmail,
  draftComplianceChaseAction,
} from "@/app/people/requirement-actions";

type ReqFields = { label: string; category: string | null; mandatory: boolean };

/** Compact inline editor for adding/editing a person's requirement item. */
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
    <div className="flex flex-col gap-2 rounded-xl bg-bg-subtle/50 px-3 py-2.5">
      <input value={label} onChange={(e) => setLabel(e.target.value)} autoFocus
        onKeyDown={(e) => { if (e.key === "Enter" && label.trim()) onSave({ label: label.trim(), category: category || null, mandatory }); if (e.key === "Escape") onCancel(); }}
        placeholder="Document name (e.g. Driving licence)"
        className="rounded-lg bg-bg-elev text-sm ring-1 ring-border px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent/40" />
      <div className="flex flex-wrap items-center gap-2">
        <select value={category} onChange={(e) => setCategory(e.target.value)}
          className="rounded-lg bg-bg-elev text-[11px] text-fg-muted ring-1 ring-border px-1.5 py-1">
          <option value="">No category</option>
          {DOC_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <label className="inline-flex items-center gap-1.5 text-[11px] text-fg-muted cursor-pointer">
          <input type="checkbox" checked={mandatory} onChange={(e) => setMandatory(e.target.checked)} className="accent-accent" /> Required
        </label>
        <div className="ml-auto flex items-center gap-1.5">
          <button type="button" onClick={onCancel} disabled={busy}
            className="rounded-lg px-2 py-1 text-[11px] text-fg-muted hover:text-fg hover:bg-bg-muted disabled:opacity-50">Cancel</button>
          <Button type="button" size="xs" disabled={busy || !label.trim()}
            onClick={() => onSave({ label: label.trim(), category: category || null, mandatory })}>
            {busy ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />} Save
          </Button>
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
  reviewDate: string | null;
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
  events?: ComplianceEvent[];
};

/** Compact relative time, e.g. "just now", "3h ago", "12 Jun". */
function relTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function addDocHref(personId: number, item: ChecklistItem) {
  const p = new URLSearchParams({ newdoc: "1", person: String(personId), title: item.label, from: `person:${personId}` });
  // Carry the category through (even broad ones like "Other") so the new
  // document records it; auto-linking now matches on label, not category alone.
  if (item.category) p.set("category", item.category);
  return `/documents?${p.toString()}`;
}

const bandTone: Record<"Good" | "Watch" | "Risk", KitTone> = { Good: "success", Watch: "warn", Risk: "danger" };
const bandBadge = { Good: "success", Watch: "warn", Risk: "danger" } as const;

const IN_PLACE = new Set<EffectiveStatus>(["verified", "waived"]);

export function RequirementsChecklist({
  personId,
  onChanged,
  onNavigate,
  onSummary,
  onAddDocument,
  companies,
  people,
  reloadSignal,
}: {
  personId: number;
  onChanged?: () => void;
  onNavigate?: () => void;
  onSummary?: (s: { score: number; band: "Good" | "Watch" | "Risk"; missing: number; total: number }) => void;
  /** When provided, the host opens its own "add document" surface (e.g. the
   *  person drawer's layered dialog). When omitted but companies+people are
   *  passed, this component hosts its OWN in-place DocumentForm dialog so the
   *  upload-onto-a-gap flow stays on-page; otherwise it links to /documents. */
  onAddDocument?: (opts: { title: string; category: string | null }) => void;
  /** Picker data for the self-hosted "add document" dialog (P2-JRNY-05). */
  companies?: Array<{ id: number; name: string }>;
  people?: Array<{ id: number; name: string }>;
  reloadSignal?: number;
}) {
  const { toast } = useToast();
  // Self-hosted in-place "add document" — used when the host doesn't pass
  // onAddDocument but does supply picker data, so the flow never leaves the page.
  const [addDoc, setAddDoc] = useState<{ title: string; category: string | null } | null>(null);
  const canHostAdd = !onAddDocument && !!companies && !!people;
  const [data, setData] = useState<Checklist | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [openItem, setOpenItem] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [showInPlace, setShowInPlace] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [requesting, setRequesting] = useState(false);
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

  useEffect(() => {
    if (reloadSignal === undefined) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadSignal]);

  useEffect(() => {
    if (!data) return;
    onSummary?.({ score: data.score, band: data.band, missing: data.missingMandatory, total: data.mandatoryTotal });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

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

  function doAdd(v: ReqFields) { run(-1, () => reqAdd(personId, v), "Requirement added.", () => setAdding(false)); }
  function doEdit(id: number, v: ReqFields) { run(id, () => reqEdit(id, v), "Requirement updated.", () => setEditingId(null)); }
  function doRemove(id: number) { run(id, () => reqRemove(id), "Requirement removed.", () => setOpenItem(null)); }
  function doRequest() {
    setRequesting(true);
    startTransition(async () => {
      const res = await requestDocumentsByEmail(personId);
      setRequesting(false);
      const msg = res.ok
        ? `Request emailed — ${res.count} document${res.count === 1 ? "" : "s"} marked requested`
        : res.reason === "no-items" ? "No missing documents to request"
        : res.reason === "no-email" ? "No email address on file for this person"
        : res.reason === "not-configured" ? "Email sending isn't switched on"
        : res.error || "Couldn't send the request";
      toast(msg, { tone: res.ok ? "success" : "warn", duration: 4500 });
      if (res.ok) load();
    });
  }
  function doDraftChase() {
    setRequesting(true);
    startTransition(async () => {
      const res = await draftComplianceChaseAction(personId);
      setRequesting(false);
      toast(res.ok && res.count ? `Chase drafted in Outbox — ${res.count} item${res.count === 1 ? "" : "s"} to review & send` : res.reason === "no-items" ? "Nothing missing or expired to chase" : "Couldn't draft the chase", { tone: res.ok && res.count ? "success" : "default", duration: 4500 });
    });
  }

  function doSync() {
    setSyncing(true);
    startTransition(async () => {
      const res = await reqSync(personId);
      setSyncing(false);
      if (!res.ok) { toast(res.error ?? "Could not sync", { tone: "danger" }); return; }
      const changed = res.added + res.restored;
      toast(changed === 0 ? "Already up to date with the template." : `Synced — ${[res.added && `${res.added} added`, res.restored && `${res.restored} restored`].filter(Boolean).join(", ")}.`, { tone: changed ? "success" : "default" });
      load();
      onChanged?.();
    });
  }

  if (loading && !data) {
    return (
      <div className="glass elevated rounded-2xl p-4 flex items-center gap-2 text-sm text-fg-muted">
        <Loader2 size={15} className="animate-spin" /> Loading document compliance…
      </div>
    );
  }
  if (!data) return null;

  const needsAction = data.items.filter((it) => !IN_PLACE.has(it.effectiveStatus));
  const inPlace = data.items.filter((it) => IN_PLACE.has(it.effectiveStatus));
  const events = data.events ?? [];
  const lastReviewed = events.find((e) => e.action === "verified");

  return (
    <>
    <div className="space-y-3">
      {/* Pulse header */}
      <SectionCard className="p-3.5 space-y-2.5">
        <div className="flex items-center gap-2">
          <ShieldCheck size={15} className="text-accent" />
          <span className="text-sm font-semibold">Document compliance</span>
          <Badge tone={bandBadge[data.band]}>{data.band}</Badge>
          <span className={cn("ml-auto text-lg font-semibold tabular", data.band === "Good" ? "text-success" : data.band === "Watch" ? "text-warn" : "text-danger")}><CountUp value={data.score} duration={600} />%</span>
        </div>
        <ProgressTrack value={data.mandatoryVerified} total={data.mandatoryTotal} tone={bandTone[data.band]} />
        <div className="flex items-center justify-between text-[11px] text-fg-muted">
          <span>
            {data.mandatoryTotal === 0 ? "No required documents for this person type."
              : `${data.mandatoryVerified}/${data.mandatoryTotal} verified${data.missingMandatory ? ` · ${data.missingMandatory} missing` : ""}${data.expiredMandatory ? ` · ${data.expiredMandatory} expired` : ""}`}
          </span>
          <button type="button" disabled={syncing} onClick={doSync}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-fg-muted hover:text-accent hover:bg-bg-muted transition-colors disabled:opacity-50">
            {syncing ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />} Sync
          </button>
        </div>
        {lastReviewed && (
          <div className="text-[11px] text-fg-subtle">
            Last verified {relTime(lastReviewed.createdAt)} · {complianceActor(lastReviewed.createdBy)}
          </div>
        )}
      </SectionCard>

      {/* Needs action */}
      <SectionCard>
        <div className="px-4 py-2.5 border-b border-border/50 text-xs font-medium uppercase tracking-wider text-fg-muted inline-flex items-center gap-1.5 w-full">
          Needs action
          {needsAction.length > 0 && <span className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full bg-bg-subtle text-fg-muted text-[11px] font-semibold tabular normal-case">{needsAction.length}</span>}
          {(data.missingMandatory > 0 || data.expiredMandatory > 0) && (
            <span className="ml-auto inline-flex items-center gap-1.5">
              <button type="button" disabled={requesting} onClick={doDraftChase}
                title="Draft a chase (missing + expired, with reasons) in the Outbox to review and send"
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 normal-case font-medium text-fg-muted hover:text-accent hover:bg-bg-muted transition-colors disabled:opacity-50">
                {requesting ? <Loader2 size={11} className="animate-spin" /> : <FileText size={11} />} Draft chase
              </button>
              {data.missingMandatory > 0 && (
                <button type="button" disabled={requesting} onClick={doRequest}
                  title="Email this person their missing documents now (and mark them requested)"
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 normal-case font-medium text-fg-muted hover:text-accent hover:bg-bg-muted transition-colors disabled:opacity-50">
                  {requesting ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />} Email now
                </button>
              )}
            </span>
          )}
        </div>
        {needsAction.length === 0 ? (
          <EmptyState icon={<CheckCircle2 size={20} />} tone="success" title="All caught up" hint="Every required document is in place." />
        ) : (
          <div className="divide-y divide-border/50">
            {needsAction.map((item) => <ItemRow key={item.id} item={item} />)}
          </div>
        )}
        {/* Add custom item */}
        {adding ? (
          <div className="border-t border-border/50 p-2"><ReqEditor onSave={doAdd} onCancel={() => setAdding(false)} busy={busyId === -1} /></div>
        ) : (
          <button type="button" onClick={() => setAdding(true)}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-left text-[11px] font-medium text-accent hover:bg-bg-muted/40 transition-colors border-t border-border/50">
            <Plus size={13} /> Add a required document
          </button>
        )}
      </SectionCard>

      {/* In place — collapsed */}
      {inPlace.length > 0 && (
        <SectionCard>
          <button type="button" onClick={() => setShowInPlace((s) => !s)}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-fg-muted hover:bg-bg-muted/40 transition-colors">
            <CheckCircle2 size={13} className="text-success" /> In place
            <span className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full bg-bg-subtle text-fg-muted text-[11px] font-semibold tabular normal-case">{inPlace.length}</span>
            <ChevronDown size={14} className={cn("ml-auto text-fg-subtle transition-transform", showInPlace && "rotate-180")} />
          </button>
          {showInPlace && <div className="divide-y divide-border/50 border-t border-border/50">{inPlace.map((item) => <ItemRow key={item.id} item={item} />)}</div>}
        </SectionCard>
      )}

      {/* Audit trail — who did what, when */}
      {events.length > 0 && (
        <SectionCard>
          <button type="button" onClick={() => setShowHistory((s) => !s)}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-fg-muted hover:bg-bg-muted/40 transition-colors">
            <History size={13} className="text-fg-subtle" /> History
            <span className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full bg-bg-subtle text-fg-muted text-[11px] font-semibold tabular normal-case">{events.length}</span>
            <ChevronDown size={14} className={cn("ml-auto text-fg-subtle transition-transform", showHistory && "rotate-180")} />
          </button>
          {showHistory && (
            <ul className="divide-y divide-border/50 border-t border-border/50">
              {events.map((e) => (
                <li key={e.id} className="flex items-start gap-2.5 px-3.5 py-2">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-fg-subtle/60" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] leading-snug">
                      <span className="font-medium">{COMPLIANCE_ACTION_LABEL[e.action]}</span>
                      <span className="text-fg-muted"> · {e.label}</span>
                    </p>
                    {e.detail && <p className="text-[11px] text-fg-subtle truncate">{e.detail}</p>}
                  </div>
                  <span className="shrink-0 text-[11px] text-fg-subtle whitespace-nowrap">
                    {relTime(e.createdAt)} · {complianceActor(e.createdBy)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      )}
    </div>

    {/* Self-hosted "add document" — layered over the host so the upload-onto-a-
        gap flow stays on-page even when the host doesn't provide onAddDocument. */}
    {canHostAdd && (
      <Dialog.Root open={!!addDoc} onOpenChange={(o) => { if (!o) setAddDoc(null); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm
            data-[state=open]:animate-in data-[state=open]:fade-in-0
            data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
          <Dialog.Content
            aria-describedby={undefined}
            className="fixed left-1/2 top-1/2 z-[61] -translate-x-1/2 -translate-y-1/2
              w-[min(560px,calc(100vw-1.5rem))] max-h-[88dvh] flex flex-col overflow-hidden
              glass glass-refract rounded-2xl outline-none
              data-[state=open]:animate-in data-[state=open]:zoom-in-95 data-[state=open]:fade-in-0
              data-[state=closed]:animate-out data-[state=closed]:zoom-out-95"
          >
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
              <Dialog.Title className="text-sm font-semibold truncate">Add a required document</Dialog.Title>
              <Dialog.Close asChild>
                <button type="button" aria-label="Close"
                  className="h-7 w-7 inline-flex items-center justify-center rounded text-fg-muted hover:text-fg hover:bg-bg-subtle transition-colors">
                  <X size={14} />
                </button>
              </Dialog.Close>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {addDoc && (
                <DocumentForm
                  mode="create"
                  companies={companies!}
                  people={people!}
                  initialPersonId={personId}
                  initialCategory={addDoc.category}
                  initialTitle={addDoc.title}
                  onCancel={() => setAddDoc(null)}
                  onComplete={(res) => { if (res.ok) { toast("Document added.", { tone: "success" }); setAddDoc(null); load(); onChanged?.(); } }}
                />
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    )}
    </>
  );

  function ItemRow({ item }: { item: ChecklistItem }) {
    const tone = REQUIREMENT_STATUS_TONE[item.effectiveStatus];
    const busy = busyId === item.id;
    const expanded = openItem === item.id;
    const linkable = data!.documents.filter((d) => d.id !== item.documentId);
    const needsDoc = item.effectiveStatus === "missing" || item.effectiveStatus === "requested";
    const dot = tone === "success" ? "bg-success" : tone === "warn" ? "bg-warn" : tone === "danger" ? "bg-danger" : tone === "info" ? "bg-info" : "bg-fg-subtle";
    const subtitle = item.documentTitle ? [item.documentTitle, item.expiryLabel].filter(Boolean).join(" · ") : item.mandatory ? "Required" : "Optional";
    const addCat = item.category ?? null;

    if (editingId === item.id) {
      return <div className="p-2"><ReqEditor initial={{ label: item.label, category: item.category, mandatory: item.mandatory }} onSave={(v) => doEdit(item.id, v)} onCancel={() => setEditingId(null)} busy={busy} /></div>;
    }

    const primaryAdd = (label: string) =>
      onAddDocument ? (
        <Button type="button" size="xs" disabled={busy} onClick={(e) => { e.stopPropagation(); onAddDocument({ title: item.label, category: addCat }); }}>
          <Plus size={12} /> {label}
        </Button>
      ) : canHostAdd ? (
        <Button type="button" size="xs" disabled={busy} onClick={(e) => { e.stopPropagation(); setAddDoc({ title: item.label, category: addCat }); }}>
          <Plus size={12} /> {label}
        </Button>
      ) : (
        <LinkButton size="xs" href={addDocHref(personId, item)} onClick={(e) => { e.stopPropagation(); onNavigate?.(); }}>
          <Plus size={12} /> {label}
        </LinkButton>
      );

    return (
      <div className={cn(busy && "opacity-60")}>
        <div className="group/row flex items-center gap-2.5 px-3.5 py-2.5">
          <span className={cn("h-2 w-2 shrink-0 rounded-full", dot)} />
          <button type="button" onClick={() => setOpenItem(expanded ? null : item.id)} className="min-w-0 flex-1 text-left">
            <span className="block text-sm font-medium truncate">{item.label}</span>
            <span className={cn("block text-[11px] truncate", item.docStatus === "Expired" ? "text-danger" : item.docStatus === "Expiring" ? "text-warn" : "text-fg-subtle")}>{subtitle}</span>
          </button>
          {/* Contextual primary action, always visible */}
          {item.effectiveStatus === "received" && (
            <button type="button" disabled={busy} onClick={() => run(item.id, () => reqVerify(item.id), "Verified.")}
              className="inline-flex items-center gap-1 rounded-lg bg-success-soft text-success px-2 py-1 text-[11px] font-medium ring-1 ring-success/25 hover:bg-success-soft/80"><Check size={12} /> Verify</button>
          )}
          {item.effectiveStatus === "expired" && primaryAdd("Renew")}
          {needsDoc && primaryAdd("Add")}
          <Badge tone={tone}>{REQUIREMENT_STATUS_LABELS[item.effectiveStatus]}</Badge>
          <button type="button" onClick={() => setOpenItem(expanded ? null : item.id)} aria-label="More" className="shrink-0 text-fg-subtle hover:text-fg">
            <ChevronDown size={14} className={cn("transition-transform", expanded && "rotate-180")} />
          </button>
        </div>
        {expanded && (
          <div className="flex flex-wrap items-center gap-1.5 px-3.5 pb-2.5 pl-[26px]">
            {(item.effectiveStatus === "verified" || item.effectiveStatus === "expiring" || item.effectiveStatus === "expired") && (
              <button type="button" disabled={busy} onClick={() => run(item.id, () => reqUnverify(item.id))} className="rounded-md px-2 py-1 text-[11px] text-fg-muted hover:text-fg hover:bg-bg-muted">Unverify</button>
            )}
            {item.status === "verified" && (
              <label className="inline-flex items-center gap-1 rounded-md bg-bg-subtle px-1.5 py-1 text-[11px] text-fg-muted ring-1 ring-border" title="Renew-by date for this requirement, even without an attached file">
                <CalendarClock size={11} /> Valid until
                <input type="date" disabled={busy} defaultValue={item.reviewDate ? item.reviewDate.slice(0, 10) : ""}
                  onChange={(e) => run(item.id, () => reqSetReviewDate(item.id, e.target.value ? new Date(`${e.target.value}T00:00:00Z`).toISOString() : null), e.target.value ? "Review date set." : "Review date cleared.")}
                  className="bg-transparent text-fg outline-none [color-scheme:light] dark:[color-scheme:dark]" />
              </label>
            )}
            {needsDoc && linkable.length > 0 && (
              <select disabled={busy} defaultValue="" onChange={(e) => { const v = parseInt(e.target.value, 10); if (!Number.isNaN(v)) run(item.id, () => reqLinkDocument(item.id, v), "Document linked."); }}
                className="rounded-md bg-bg-subtle text-[11px] text-fg-muted ring-1 ring-border px-1.5 py-1 max-w-[8.5rem]">
                <option value="" disabled>Link…</option>
                {linkable.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
              </select>
            )}
            {item.effectiveStatus === "missing" && (
              <button type="button" disabled={busy} onClick={() => run(item.id, () => reqMarkRequested(item.id), "Marked as requested.")} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-fg-muted hover:text-fg hover:bg-bg-muted"><Send size={11} /> Requested</button>
            )}
            {item.documentId && item.effectiveStatus !== "verified" && item.effectiveStatus !== "expiring" && (
              <button type="button" disabled={busy} onClick={() => run(item.id, () => reqUnlinkDocument(item.id))} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-fg-muted hover:text-fg hover:bg-bg-muted"><Link2 size={11} /> Unlink</button>
            )}
            {item.effectiveStatus === "waived" ? (
              <button type="button" disabled={busy} onClick={() => run(item.id, () => reqUnwaive(item.id))} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-fg-muted hover:text-fg hover:bg-bg-muted"><RotateCcw size={11} /> Restore</button>
            ) : needsDoc ? (
              <button type="button" disabled={busy} onClick={() => run(item.id, () => reqWaive(item.id, null))} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-fg-muted hover:text-fg hover:bg-bg-muted"><Ban size={11} /> Waive</button>
            ) : null}
            <span className="mx-0.5 h-3 w-px bg-border/70" />
            <button type="button" disabled={busy} onClick={() => setEditingId(item.id)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-fg-muted hover:text-fg hover:bg-bg-muted"><Pencil size={11} /> Edit</button>
            <button type="button" disabled={busy} onClick={() => doRemove(item.id)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-fg-muted hover:text-danger hover:bg-danger/10"><Trash2 size={11} /> Remove</button>
            {busy && <Loader2 size={12} className="animate-spin text-fg-subtle" />}
          </div>
        )}
      </div>
    );
  }
}

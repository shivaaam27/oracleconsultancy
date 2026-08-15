"use client";

import { useState, useTransition } from "react";
import { Plus, Archive, Loader2, X, FileWarning, Home, ShieldCheck, FileText } from "lucide-react";
import { cn } from "@/lib/cn";
import { RecordList } from "./record-list";
import { buildColumns } from "./entity-cells";
import { ENTITY_VIEWS } from "@/lib/entity-view";

/** The commitments list is defined in metadata, not here (Stage 3/4). */
const COMMITMENT_COLUMNS = ENTITY_VIEWS.commitment!.listColumns;
import {
  KIND_LABEL,
  daysToNotice,
  noticeByDate,
  commitmentUrgency,
  URGENCY_TONE,
  type Commitment,
  type CommitmentKind,
} from "@/lib/commitments-shared";
import { createCommitmentAction, archiveCommitmentAction, linkCommitmentDocumentAction } from "@/app/hrms/registers/actions";
import { DocLinkControl, type LinkDoc } from "./doc-link-control";

const KIND_ICON: Record<CommitmentKind, React.ReactNode> = {
  lease: <Home size={13} />, insurance: <ShieldCheck size={13} />, contract: <FileText size={13} />,
};
const TONE_CHIP: Record<string, string> = {
  danger: "bg-danger-soft text-danger", warn: "bg-warn-soft text-warn", success: "bg-success-soft text-success", muted: "bg-bg-muted text-fg-muted",
};
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");
const STATUS_LABEL: Record<string, string> = { active: "Active", needs_doc: "Needs document", quoting: "Quoting", partial: "Partial", expired: "Expired" };
const statusLabel = (s: string) => STATUS_LABEL[s] ?? s;

/**
 * Commitments register + calendar: leases, insurance and contracts with their
 * notice-by deadlines (end − notice period). Items needing notice soon float up.
 */
export function CommitmentsRegister({ items, companies, documents = [] }: { items: Commitment[]; companies: Array<{ id: number; name: string }>; documents?: LinkDoc[] }) {
  const [adding, setAdding] = useState(false);
  const [, start] = useTransition();
  const [busy, setBusy] = useState<number | null>(null);

  function archive(id: number) {
    if (!confirm("Archive this commitment?")) return;
    setBusy(id);
    start(async () => { await archiveCommitmentAction(id); setBusy(null); });
  }

  // Sort: overdue/soon first (by notice-by date), then the rest.
  const ranked = [...items].sort((a, b) => {
    const da = daysToNotice(a), db = daysToNotice(b);
    if (da === null) return db === null ? 0 : 1;
    if (db === null) return -1;
    return da - db;
  });
  const dueSoon = ranked.filter((c) => ["overdue", "soon"].includes(commitmentUrgency(c)));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {dueSoon.length > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-warn-soft px-2.5 py-1 text-xs font-medium text-warn">
            <FileWarning size={13} /> {dueSoon.length} need{dueSoon.length === 1 ? "s" : ""} notice soon
          </span>
        )}
        <button type="button" onClick={() => setAdding((a) => !a)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg hover:opacity-90">
          <Plus size={14} /> Add
        </button>
      </div>

      {adding && <AddForm companies={companies} onDone={() => setAdding(false)} />}

      {/* The commitments register on the shared list shell (Stage 4). Columns
          come from ENTITY_VIEWS.commitment; the urgency chip, the notice date
          and the row's own controls are overrides. */}
      <RecordList
        rows={ranked}
        rowKey={(c) => c.id}
        listKey="commitment"
        bulkActions={[
          {
            label: "Archive",
            tone: "danger",
            icon: <Archive size={12} />,
            run: async (picked) => { for (const c of picked) await archive(c.id); },
          },
        ]}
        total={ranked.length}
        empty={<p className="text-center text-[12px] text-fg-subtle">No commitments yet. Add a lease, insurance policy or contract.</p>}
        columns={buildColumns<(typeof ranked)[number] & Record<string, unknown>>(COMMITMENT_COLUMNS, {
          overrides: {
            title: (c) => (
              <span className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 text-fg-subtle" title={KIND_LABEL[c.kind]}>{KIND_ICON[c.kind]}</span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium">{c.title}</span>
                  <span className="block truncate text-[11px] text-fg-muted">
                    {[KIND_LABEL[c.kind], c.companyName, c.counterparty, c.amount].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </span>
            ),
            noticeBy: (c) => {
              const urg = commitmentUrgency(c);
              const nb = noticeByDate(c);
              const d = daysToNotice(c);
              const hasNotice = (c.noticeDays ?? 0) > 0;
              return (
                <span className="flex items-center justify-end gap-2">
                  <span className="hidden text-right text-[11px] text-fg-subtle sm:block">
                    {nb && hasNotice ? fmt(nb.toISOString()) : "—"}
                  </span>
                  <span className={cn("shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-medium", TONE_CHIP[URGENCY_TONE[urg]])}>
                    {urg === "overdue" ? (hasNotice ? "Notice overdue" : "Expired")
                      : urg === "soon" ? `${d}d to ${hasNotice ? "notice" : "expiry"}`
                      : urg === "ok" ? "OK" : statusLabel(c.status)}
                  </span>
                </span>
              );
            },
          },
        })}
        rowActions={(c) => (
          <span className="flex items-center gap-1">
            <DocLinkControl documentId={c.documentId} documents={documents} companyId={c.companyId} onLink={(docId) => linkCommitmentDocumentAction(c.id, docId).then(() => {})} />
            <button type="button" onClick={() => archive(c.id)} disabled={busy === c.id} title="Archive"
              className="shrink-0 rounded-md p-1 text-fg-subtle hover:bg-bg-muted hover:text-danger">
              {busy === c.id ? <Loader2 size={12} className="animate-spin" /> : <Archive size={12} />}
            </button>
          </span>
        )}
      />
    </div>
  );
}

function AddForm({ companies, onDone }: { companies: Array<{ id: number; name: string }>; onDone: () => void }) {
  const [kind, setKind] = useState<CommitmentKind>("lease");
  const [title, setTitle] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [endDate, setEndDate] = useState("");
  const [noticeDays, setNoticeDays] = useState("");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState("active");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = "w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-[13px] outline-none focus:border-accent/60";

  async function save() {
    setSaving(true); setError(null);
    const res = await createCommitmentAction({
      kind, title, companyId: companyId ? Number(companyId) : null, counterparty: counterparty || null,
      endDate: endDate || null, noticeDays: noticeDays ? Number(noticeDays) : null, amount: amount || null,
      status, reference: reference || null,
    });
    setSaving(false);
    if (!res.ok) { setError(res.error ?? "Couldn't save."); return; }
    onDone();
  }

  return (
    <div className="rounded-xl border border-border/70 bg-bg-subtle/30 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-fg-muted">New commitment</span>
        <button type="button" onClick={onDone} className="ml-auto rounded-md p-1 text-fg-subtle hover:bg-bg-muted"><X size={13} /></button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <select className={input} value={kind} onChange={(e) => setKind(e.target.value as CommitmentKind)}>
          <option value="lease">Lease</option><option value="insurance">Insurance</option><option value="contract">Contract</option>
        </select>
        <input className={input} placeholder="Title (e.g. Head office lease)" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <select className={input} value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
          <option value="">— Company —</option>
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input className={input} placeholder="Other party (landlord/insurer)" value={counterparty} onChange={(e) => setCounterparty(e.target.value)} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <label className="text-[11px] text-fg-muted">End date<input type="date" className={input} value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label>
        <label className="text-[11px] text-fg-muted">Notice (days)<input type="number" min={0} className={input} value={noticeDays} onChange={(e) => setNoticeDays(e.target.value)} /></label>
        <label className="text-[11px] text-fg-muted">Amount<input className={input} placeholder="rent/premium" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[11px] text-fg-muted">Status<select className={input} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="active">Active</option><option value="needs_doc">Needs document</option><option value="quoting">Quoting</option><option value="partial">Partial</option><option value="expired">Expired</option>
        </select></label>
        <label className="text-[11px] text-fg-muted">Reference / policy no.<input className={input} value={reference} onChange={(e) => setReference(e.target.value)} /></label>
      </div>
      <div className="flex items-center justify-end gap-1.5">
        <button type="button" onClick={onDone} className="rounded-lg px-2.5 py-1 text-[12px] text-fg-muted hover:bg-bg-muted/60">Cancel</button>
        <button type="button" onClick={save} disabled={saving} className="rounded-lg bg-accent px-3 py-1 text-[12px] font-medium text-accent-fg hover:opacity-90 disabled:opacity-50">{saving ? "Saving…" : "Add"}</button>
      </div>
      {error && <p className="text-[12px] text-danger">{error}</p>}
    </div>
  );
}

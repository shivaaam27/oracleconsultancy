"use client";

// ─────────────────────────────────────────────────────────────────────────────
// TENDERS — bids being chased, before any enquiry exists (Stage 7).
//
// The workbook's `tenders` sheet: 80 rows, four columns, and nothing in COS
// held it until now. It sits ON the Funnel tab because that is the same story —
// what might become an order — but it is a SEPARATE record, so it never lands
// in the conversion figures, which are about enquiries a client actually sent.
//
// ⚠️ The point of the screen is the missed bid: live, deadline gone, nothing
// submitted and nobody closed it.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check, X, Pencil, Archive, Gavel, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { Combobox } from "./combobox";
import { fmtDate } from "@/lib/ops-orders-shared";
import {
  tenderView, tenderTotals, TENDER_OUTCOMES, TENDER_TYPES, type Tender,
} from "@/lib/ops-tenders-shared";
import {
  createTenderAction, updateTenderAction, archiveTenderAction,
} from "@/app/ops/payment-actions";
import { createOpsRefAction } from "@/app/ops/actions";

const inputCls =
  "h-8 w-full rounded-md border border-border bg-bg px-2 text-[13px] outline-none placeholder:text-fg-subtle focus:border-accent";

export function OpsTendersPanel({
  companyId, tenders: serverRows, clients,
}: {
  companyId: number;
  tenders: Tender[];
  clients: string[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState(serverRows);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const seededFor = useRef(companyId);
  useEffect(() => {
    if (seededFor.current !== companyId) { seededFor.current = companyId; setRows(serverRows); }
  }, [companyId, serverRows]);

  const views = useMemo(() => rows.map((t) => tenderView(t)), [rows]);
  const totals = useMemo(() => tenderTotals(views), [views]);
  // Live ones first, soonest deadline leading; settled ones fall to the bottom.
  const shown = useMemo(() => [...views].sort((a, b) => {
    if (a.open !== b.open) return a.open ? -1 : 1;
    if (a.daysLeft === null && b.daysLeft === null) return 0;
    if (a.daysLeft === null) return 1;
    if (b.daysLeft === null) return -1;
    return a.daysLeft - b.daysLeft;
  }), [views]);

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-bg-elev">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <button type="button" onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 text-[12px] font-medium hover:text-accent">
          <ChevronDown size={13} className={cn("transition-transform", open && "rotate-180")} />
          <Gavel size={13} className="text-fg-subtle" />
          Tenders being chased
          <span className="ml-1 text-[11px] font-normal text-fg-subtle">
            {totals.open} live
            {totals.dueSoon > 0 && ` · ${totals.dueSoon} due this week`}
          </span>
        </button>
        {totals.missed > 0 && (
          <span className="text-[11px] text-danger">
            {totals.missed} deadline{totals.missed === 1 ? "" : "s"} passed with nothing submitted
          </span>
        )}
      </header>

      {open && (
        <div className="space-y-2 p-3">
          <AddTender
            companyId={companyId} clients={clients}
            onSaved={(t) => { setError(null); setRows((p) => [t, ...p]); router.refresh(); }}
            onError={setError}
          />

          {error && (
            <p role="alert" className="rounded-md border border-danger/30 bg-danger-soft px-2.5 py-1.5 text-[12px] text-danger">
              {error}
            </p>
          )}

          {shown.length === 0 ? (
            <p className="py-3 text-center text-[12px] text-fg-subtle">
              Nothing being chased. Add a tender when one is advertised — it is not an enquiry
              until a client asks you directly, so it is kept apart from the conversion figures.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] border-collapse text-[12px]">
                <thead>
                  <tr className="border-b border-border text-[10px] uppercase tracking-[0.04em] text-fg-subtle">
                    <th className="px-2 py-1.5 text-left font-normal">What for</th>
                    <th className="px-2 py-1.5 text-left font-normal">Client</th>
                    <th className="px-2 py-1.5 text-left font-normal">Type</th>
                    <th className="px-2 py-1.5 text-center font-normal">Deadline</th>
                    <th className="px-2 py-1.5 text-left font-normal">Where it stands</th>
                    <th className="w-16 px-2 py-1.5" />
                  </tr>
                </thead>
                <tbody>
                  {shown.map((v) => (
                    <>
                      <tr key={v.tender.id} className="border-b border-border/60">
                        <td className="max-w-[280px] truncate px-2 py-1.5" title={v.tender.description}>
                          {v.tender.description}
                        </td>
                        <td className="px-2 py-1.5 text-fg-muted">{v.tender.client ?? "—"}</td>
                        <td className="px-2 py-1.5 text-fg-subtle">{v.tender.quoteType ?? "—"}</td>
                        <td className="px-2 py-1.5 text-center">
                          <span className="block">{fmtDate(v.tender.deadline) ?? "—"}</span>
                          {v.daysLeft !== null && v.open && (
                            <span className={cn("block text-[11px]",
                              v.daysLeft < 0 ? "text-danger" : v.daysLeft <= 7 ? "text-warn" : "text-fg-subtle")}>
                              {v.daysLeft < 0 ? `${-v.daysLeft}d ago` : `${v.daysLeft}d left`}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          <span className={cn("block truncate",
                            v.missed ? "text-danger"
                            : (v.tender.outcome ?? "").toUpperCase() === "WON" ? "text-success"
                            : v.closed ? "text-fg-subtle" : "")}>
                            {v.tender.outcome ?? (v.submitted ? "Submitted" : "Live")}
                          </span>
                          <span className="block truncate text-[11px] text-fg-subtle">
                            {v.waitingOn ?? v.tender.outcomeReason ?? "—"}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <button type="button" title="Open"
                            onClick={() => setEditing(editing === v.tender.id ? null : v.tender.id)}
                            className="rounded p-1 text-fg-subtle hover:bg-bg-muted hover:text-fg">
                            <Pencil size={13} />
                          </button>
                          <button type="button" title="Archive (never deleted)" disabled={pending}
                            onClick={() => {
                              if (!confirm("Archive this tender?")) return;
                              start(async () => {
                                const res = await archiveTenderAction(v.tender.id, true);
                                if (!res.ok) { setError(res.error ?? "Couldn't archive."); return; }
                                setRows((p) => p.filter((r) => r.id !== v.tender.id));
                                router.refresh();
                              });
                            }}
                            className="rounded p-1 text-fg-subtle hover:bg-bg-muted hover:text-fg">
                            <Archive size={13} />
                          </button>
                        </td>
                      </tr>
                      {editing === v.tender.id && (
                        <tr key={`e${v.tender.id}`}>
                          <td colSpan={6} className="p-2">
                            <EditTender
                              companyId={companyId} tender={v.tender} clients={clients}
                              onDone={(t) => {
                                setRows((p) => p.map((r) => (r.id === t.id ? t : r)));
                                setEditing(null); router.refresh();
                              }}
                              onCancel={() => setEditing(null)}
                              onError={setError}
                            />
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function AddTender({
  companyId, clients, onSaved, onError,
}: {
  companyId: number; clients: string[];
  onSaved: (t: Tender) => void; onError: (e: string | null) => void;
}) {
  const [pending, start] = useTransition();
  const [description, setDescription] = useState("");
  const [client, setClient] = useState("");
  const [quoteType, setQuoteType] = useState("");
  const [deadline, setDeadline] = useState("");
  const [comboKey, setComboKey] = useState(0);
  const ref = useRef<HTMLInputElement | null>(null);

  const save = () => {
    onError(null);
    if (!description.trim()) { onError("Say what the tender is for."); return; }
    start(async () => {
      const res = await createTenderAction({ companyId, description, client, quoteType, deadline });
      if (!res.ok) { onError(res.error ?? "Couldn't save."); return; }
      onSaved({
        id: res.id ?? -Date.now(), companyId, description: description.trim(),
        client: client || null, quoteType: quoteType || null, deadline: deadline || null,
        outcome: null, outcomeReason: null, submittedDate: null, enquiryId: null,
        notes: null, archived: false,
      });
      setDescription("");
      setComboKey((k) => k + 1);
      ref.current?.focus();
    });
  };

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-12"
      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); save(); } }}>
      <label className="block min-w-0 sm:col-span-5">
        <span className="mb-1 block text-[10px] uppercase tracking-[0.04em] text-fg-subtle">What for</span>
        <input ref={ref} value={description} onChange={(e) => setDescription(e.target.value)}
          placeholder="SUPPLY OF MAPTEK SENTRY DMS" className={inputCls} />
      </label>
      <label className="block min-w-0 sm:col-span-2">
        <span className="mb-1 block text-[10px] uppercase tracking-[0.04em] text-fg-subtle">Client</span>
        <Combobox key={`c${comboKey}`} options={clients} defaultValue={client}
          onCreate={(v) => createOpsRefAction(companyId, "client", v)} createNoun="client"
          placeholder="" onInput={setClient} onCommit={setClient} className={inputCls} />
      </label>
      <label className="block min-w-0 sm:col-span-2">
        <span className="mb-1 block text-[10px] uppercase tracking-[0.04em] text-fg-subtle">Type</span>
        <Combobox key={`t${comboKey}`} options={TENDER_TYPES} defaultValue={quoteType}
          placeholder="" onInput={setQuoteType} onCommit={setQuoteType} className={inputCls} />
      </label>
      <label className="block min-w-0 sm:col-span-2">
        <span className="mb-1 block text-[10px] uppercase tracking-[0.04em] text-fg-subtle">Deadline</span>
        <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={inputCls} />
      </label>
      <div className="flex items-end sm:col-span-1">
        <button type="button" onClick={save} disabled={pending}
          className="inline-flex h-8 w-full items-center justify-center gap-1 rounded-md bg-accent px-2 text-xs font-medium text-accent-fg disabled:opacity-60">
          {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Add
        </button>
      </div>
    </div>
  );
}

function EditTender({
  companyId, tender, clients, onDone, onCancel, onError,
}: {
  companyId: number; tender: Tender; clients: string[];
  onDone: (t: Tender) => void; onCancel: () => void; onError: (e: string | null) => void;
}) {
  const [pending, start] = useTransition();
  const [f, setF] = useState({
    description: tender.description, client: tender.client ?? "",
    quoteType: tender.quoteType ?? "", deadline: tender.deadline?.slice(0, 10) ?? "",
    submittedDate: tender.submittedDate?.slice(0, 10) ?? "",
    outcome: tender.outcome ?? "", outcomeReason: tender.outcomeReason ?? "",
    notes: tender.notes ?? "",
  });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  const submit = () =>
    start(async () => {
      onError(null);
      const res = await updateTenderAction(tender.id, f);
      if (!res.ok) { onError(res.error ?? "Couldn't save."); return; }
      onDone({
        ...tender,
        description: f.description.trim(), client: f.client || null,
        quoteType: f.quoteType || null, deadline: f.deadline || null,
        submittedDate: f.submittedDate || null, outcome: f.outcome || null,
        outcomeReason: f.outcomeReason || null, notes: f.notes || null,
      });
    });

  return (
    <div className="space-y-2 rounded-md border border-accent/30 bg-bg-subtle p-3"
      onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-12">
        <label className="block min-w-0 sm:col-span-5">
          <span className="mb-1 block text-[10px] uppercase tracking-[0.04em] text-fg-subtle">What for</span>
          <input value={f.description} onChange={(e) => set("description", e.target.value)} className={inputCls} />
        </label>
        <label className="block min-w-0 sm:col-span-2">
          <span className="mb-1 block text-[10px] uppercase tracking-[0.04em] text-fg-subtle">Client</span>
          <Combobox options={clients} defaultValue={f.client}
            onCreate={(v) => createOpsRefAction(companyId, "client", v)} createNoun="client"
            placeholder="" onInput={(v) => set("client", v)} onCommit={(v) => set("client", v)} className={inputCls} />
        </label>
        <label className="block min-w-0 sm:col-span-2">
          <span className="mb-1 block text-[10px] uppercase tracking-[0.04em] text-fg-subtle">Type</span>
          <Combobox options={TENDER_TYPES} defaultValue={f.quoteType} placeholder=""
            onInput={(v) => set("quoteType", v)} onCommit={(v) => set("quoteType", v)} className={inputCls} />
        </label>
        <label className="block min-w-0 sm:col-span-3">
          <span className="mb-1 block text-[10px] uppercase tracking-[0.04em] text-fg-subtle">Deadline</span>
          <input type="date" value={f.deadline} onChange={(e) => set("deadline", e.target.value)} className={inputCls} />
        </label>
        <label className="block min-w-0 sm:col-span-3">
          <span className="mb-1 block text-[10px] uppercase tracking-[0.04em] text-fg-subtle">Submitted on</span>
          <input type="date" value={f.submittedDate} onChange={(e) => set("submittedDate", e.target.value)} className={inputCls} />
        </label>
        <label className="block min-w-0 sm:col-span-3">
          <span className="mb-1 block text-[10px] uppercase tracking-[0.04em] text-fg-subtle">Outcome</span>
          <Combobox options={TENDER_OUTCOMES} defaultValue={f.outcome} placeholder=""
            onInput={(v) => set("outcome", v)} onCommit={(v) => set("outcome", v)} className={inputCls} />
        </label>
        <label className="block min-w-0 sm:col-span-6">
          <span className="mb-1 block text-[10px] uppercase tracking-[0.04em] text-fg-subtle">Why / notes</span>
          <input value={f.outcomeReason} onChange={(e) => set("outcomeReason", e.target.value)} className={inputCls} />
        </label>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={submit} disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg disabled:opacity-60">
          {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save
        </button>
        <button type="button" onClick={onCancel}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-fg-muted hover:text-fg">
          <X size={13} /> Cancel
        </button>
      </div>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";
import { BottomSheet } from "@/components/bottom-sheet";
import { Combobox } from "@/components/combobox";
import { useToast } from "@/components/toast";
import {
  money, outstandingOf,
  type CzCustomer, type CzInvoice, type CzReceipt,
} from "@/lib/cocozuri-shared";
import { createReceiptsAction } from "@/app/cocozuri/actions";

/* ------------------------------------------------------------------ *
 * Recording money that has come in.
 *
 * ⚠️ ONE CHEQUE CAN SETTLE SEVERAL INVOICES, AND THAT IS THE POINT OF THIS FORM.
 * Pick the customer, tick the invoices it covers, and it is written down as one
 * row per invoice sharing a date and a reference — so every shilling stays
 * attached to the paperwork it settles. The alternative, a lump sum sitting "on
 * account", is a job somebody has to come back and finish, and in the workbook
 * it is a sentence in a REMARKS column that nothing can add up.
 *
 * ⚠️ ONLY WHAT IS ACTUALLY OUTSTANDING IS OFFERED. A draft has not been sent to
 * anybody and a settled invoice needs nothing, so neither can be picked at all —
 * which is a better guard than an error message after the fact.
 * ------------------------------------------------------------------ */

const INPUT = "w-full rounded-md border border-border bg-bg px-2 py-1 text-[12.5px] outline-none focus:border-accent";

/** Today, as an <input type="date"> wants it — in the LOCAL wall clock.
 *  ⚠️ Slicing the ISO string would put the UTC day in the box, which in Dar
 *  (UTC+3) is yesterday for the first three hours of every morning. */
function todayLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function CocozuriReceiptSheet({
  customers,
  invoices,
  receipts,
  companies,
  presetCustomerId,
  onClose,
}: {
  customers: CzCustomer[];
  invoices: CzInvoice[];
  receipts: CzReceipt[];
  /** Every company, so the "received into" question can be answered honestly. */
  companies: { id: number; name: string }[];
  presetCustomerId?: number | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [customerName, setCustomerName] = useState(
    presetCustomerId ? (customers.find((c) => c.id === presetCustomerId)?.name ?? "") : "",
  );
  const [when, setWhen] = useState(todayLocal());
  const [method, setMethod] = useState("");
  const [reference, setReference] = useState("");
  const [intoName, setIntoName] = useState("");
  const [notes, setNotes] = useState("");
  /** invoice id → what is being paid against it, as typed. */
  const [allocated, setAllocated] = useState<Record<number, string>>({});

  const customer = customers.find((c) => c.name === customerName) ?? null;

  // ⚠️ Worked out here, live, from the same tested function the Owed page uses.
  // There is no "unpaid" flag to read — what is owed is the invoice less its
  // credit notes less its receipts, and that is the only place it exists.
  const open = useMemo(() => {
    if (!customer) return [];
    return outstandingOf(
      invoices.filter((i) => i.customerId === customer.id),
      receipts,
    );
  }, [customer, invoices, receipts]);

  const total = Object.values(allocated).reduce((t, v) => t + (Number(v) || 0), 0);
  const picked = Object.entries(allocated).filter(([, v]) => Number(v) > 0).length;

  function pickCustomer(name: string) {
    setCustomerName(name);
    setAllocated({}); // their invoices are not this customer's invoices
  }

  /** Ticking an invoice offers its whole balance — the common case by a mile —
   *  and the figure stays editable for a part payment. */
  function toggle(id: number, balance: number) {
    setAllocated((a) => {
      const next = { ...a };
      if (next[id] != null) delete next[id];
      else next[id] = String(Math.round(balance));
      return next;
    });
  }

  async function save() {
    if (!customer) { toast("Pick a customer first.", { tone: "danger" }); return; }
    const rows = Object.entries(allocated)
      .map(([id, v]) => ({ invoiceId: Number(id), amount: Number(v) }))
      .filter((r) => Number.isFinite(r.amount) && r.amount !== 0);
    if (rows.length === 0) { toast("Tick at least one invoice and type what was paid against it.", { tone: "danger" }); return; }

    setBusy(true);
    const res = await createReceiptsAction(
      rows.map((r) => ({
        ...r,
        // A date with no time is midnight LOCAL, which is the day meant.
        receivedOn: new Date(`${when}T12:00:00`).toISOString(),
        method: method || null,
        reference: reference || null,
        receivedIntoCompanyId: companies.find((c) => c.name === intoName)?.id ?? null,
        notes: notes || null,
      })),
    );
    setBusy(false);
    if (!res.ok) { toast(res.error ?? "Could not record it.", { tone: "danger" }); return; }
    toast(
      rows.length === 1
        ? `${money(total, customer.currency)} recorded.`
        : `${money(total, customer.currency)} recorded across ${rows.length} invoices.`,
      { tone: "success" },
    );
    onClose();
    router.refresh();
  }

  return (
    <BottomSheet open onClose={onClose} title="Record a payment" maxWidth="max-w-3xl">
      <div className="flex flex-col gap-3 px-1 pb-2">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Customer">
            <Combobox
              defaultValue={customerName}
              options={customers.map((c) => c.name)}
              onCommit={pickCustomer}
              onInput={pickCustomer}
              placeholder="Who paid"
            />
          </Field>
          <Field label="Received on">
            <input type="date" value={when} onChange={(e) => setWhen(e.target.value)} className={INPUT} />
          </Field>
          <Field label="How">
            <Combobox
              defaultValue={method}
              options={["Cash", "Cheque", "Bank transfer", "Mobile money"]}
              onCommit={setMethod}
              onInput={setMethod}
              placeholder="Cheque, transfer, cash…"
            />
          </Field>
          <Field label="Reference">
            <input value={reference} onChange={(e) => setReference(e.target.value)} className={INPUT}
              placeholder="Cheque no., transfer ref" />
          </Field>
        </div>

        {/* ⚠️ THE "IN DSC" QUESTION, ASKED RATHER THAN GUESSED AT. The workbook's
            remarks say the money keeps landing in DSC Ltd although Cocozuri
            raised the invoice. Nobody has ruled on what that means, so this
            records which company took it and nothing more. */}
        <Field label="Received into">
          <Combobox
            defaultValue={intoName}
            options={companies.map((c) => c.name)}
            onCommit={setIntoName}
            onInput={setIntoName}
            placeholder="Which company's account took it"
          />
          <span className="text-[11px] text-fg-subtle">
            Leave blank if it came into Cocozuri&rsquo;s own account. The old spreadsheet kept saying
            &ldquo;received in DSC&rdquo; — this is where that goes, so it can be counted later.
          </span>
        </Field>

        {/* What it is paying for. */}
        {!customer ? (
          <p className="rounded-md border border-border bg-bg-subtle px-3 py-2.5 text-[12.5px] text-fg-subtle">
            Pick a customer and their unpaid invoices appear here.
          </p>
        ) : open.length === 0 ? (
          <p className="rounded-md border border-border bg-bg-subtle px-3 py-2.5 text-[12.5px] text-fg-muted">
            {customer.name} has nothing outstanding. Only an <strong>issued</strong> invoice with a
            balance can be paid — a draft has not been sent to anybody.
          </p>
        ) : (
          <div className="rounded-md border border-border">
            <div className="grid grid-cols-[24px_minmax(0,1fr)_90px_110px_120px] items-center gap-2 border-b border-border bg-bg-subtle px-2.5 py-1.5 text-[10.5px] font-medium uppercase tracking-[0.06em] text-fg-subtle">
              <span /><span>Invoice</span><span>Age</span><span className="text-right">Owed</span><span>Paying</span>
            </div>
            <div className="max-h-[15rem] overflow-y-auto">
              {open.map((o) => {
                const on = allocated[o.invoice.id] != null;
                return (
                  <div key={o.invoice.id}
                    className="grid grid-cols-[24px_minmax(0,1fr)_90px_110px_120px] items-center gap-2 border-b border-border px-2.5 py-1.5 last:border-0">
                    <input type="checkbox" checked={on} onChange={() => toggle(o.invoice.id, o.balance)}
                      aria-label={`Pay ${o.invoice.number}`} />
                    <span className="truncate text-[12.5px] text-fg">
                      {o.invoice.number}
                      {o.invoice.branchName && <span className="text-fg-subtle"> · {o.invoice.branchName}</span>}
                    </span>
                    <span className={o.days > 0 ? "text-[12px] text-warn" : "text-[12px] text-fg-subtle"}>
                      {o.days > 0 ? `${o.days}d late` : "not due"}
                    </span>
                    <span className="text-right text-[12.5px] tabular text-fg-muted">{money(o.balance, o.invoice.currency)}</span>
                    <input
                      value={allocated[o.invoice.id] ?? ""}
                      onChange={(e) => setAllocated((a) => ({ ...a, [o.invoice.id]: e.target.value }))}
                      onFocus={() => { if (!on) toggle(o.invoice.id, o.balance); }}
                      inputMode="decimal" className={INPUT} placeholder="—"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {total > 0 && (
          <div className="flex items-center justify-between rounded-md border border-border bg-bg-subtle px-3 py-2 text-[13px]">
            <span className="text-fg-muted">
              {picked === 1 ? "One invoice" : `${picked} invoices`}
              {picked > 1 && <span className="text-fg-subtle"> · one row each, sharing this reference</span>}
            </span>
            <span className="tabular font-semibold text-fg">{money(total, customer?.currency ?? "TZS")}</span>
          </div>
        )}

        {/* Overpaying is allowed — it happens — but it is never silent. */}
        {customer && open.some((o) => Number(allocated[o.invoice.id] ?? 0) > o.balance + 0.5) && (
          <p className="flex items-start gap-2 rounded-md border border-warn/30 bg-warn/10 px-3 py-2 text-[12px] text-warn">
            <AlertTriangle size={13} className="mt-px shrink-0" />
            More is being paid than is owed on at least one invoice. That is recorded as it stands —
            the invoice will show a credit rather than a balance.
          </p>
        )}

        <Field label="Note">
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className={INPUT}
            placeholder="Anything worth remembering about this payment" />
        </Field>

        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void save()} disabled={busy || total === 0}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-[12.5px] font-medium text-accent-fg hover:opacity-90 disabled:opacity-60">
            {busy && <Loader2 size={13} className="animate-spin" />} Record it
          </button>
          <button type="button" onClick={onClose} className="h-8 rounded-md px-3 text-[12.5px] text-fg-muted hover:text-fg">Cancel</button>
        </div>
      </div>
    </BottomSheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-fg-subtle">{label}</span>
      {children}
    </label>
  );
}

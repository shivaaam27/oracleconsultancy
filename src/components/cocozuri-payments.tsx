"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, BookOpen, Banknote, Loader2, Plus, Trash2 } from "lucide-react";
import { RecordList, type RecordFilter } from "@/components/record-list";
import { BottomSheet } from "@/components/bottom-sheet";
import { FIELD, SearchInput } from "@/components/ui";
import { FluidSelect } from "@/components/fluid-select";
import { useToast } from "@/components/toast";
import { czDate, money } from "@/lib/cocozuri-shared";
import { todayInDar } from "@/lib/cocozuri-stock-shared";
import { typedNumberOr } from "@/lib/typed-number";
import { paymentBlockers, type CzOwing, type CzPayment } from "@/lib/cocozuri-pay-shared";
import {
  createPaymentsAction, deletePaymentAction, postPaymentAction, unpostPaymentAction,
} from "@/app/cocozuri/actions";

/* ------------------------------------------------------------------ *
 * Money out — the twin of money in.
 *
 * ⚠️ ONE CHEQUE, SEVERAL PURCHASES = ONE ROW EACH, sharing a date and a
 * reference, all or nothing. Nothing ever sits "on account" waiting to be
 * allocated, which is how a supplier ends up chased for what was already paid.
 * ------------------------------------------------------------------ */

type Row = CzPayment & { statusLabel: string; booksState: "unposted" | "posted" | "reversed" };

export function CocozuriPayments({
  payments, owing, owingTotal, companies, booksState, ready, reason, openNew,
}: {
  payments: CzPayment[];
  owing: CzOwing[];
  owingTotal: number;
  companies: { id: number; name: string }[];
  booksState: Record<number, "unposted" | "posted" | "reversed">;
  ready: boolean;
  reason: string | null;
  openNew?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [paying, setPaying] = useState(!!openNew);
  const [busy, setBusy] = useState(false);

  // ⚠️ The flag is consumed, or Back re-opens the sheet.
  useEffect(() => {
    if (openNew) window.history.replaceState(null, "", "/cocozuri/payments");
  }, [openNew]);

  async function run(label: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.ok) { toast(res.error ?? "That did not work.", { tone: "danger" }); return; }
    toast(label, { tone: "success" });
    router.refresh();
  }

  const rows: Row[] = useMemo(() => {
    const term = q.trim().toLowerCase();
    return payments
      .map((p) => ({
        ...p,
        booksState: booksState[p.id] ?? "unposted",
        statusLabel:
          (booksState[p.id] ?? "unposted") === "posted" ? "In the books"
            : (booksState[p.id] ?? "unposted") === "reversed" ? "Reversed" : "Not posted",
      }))
      .filter((p) =>
        !term ||
        (p.paidTo ?? "").toLowerCase().includes(term) ||
        (p.purchaseRef ?? "").toLowerCase().includes(term) ||
        (p.reference ?? "").toLowerCase().includes(term));
  }, [payments, q, booksState]);

  const paid = rows.reduce((s, r) => s + r.amount, 0);

  const rail: RecordFilter[] = [
    { key: "all", label: "All payments", count: payments.length, href: "#", active: true },
  ];

  return (
    <>
      {/* ⚠️ What is still owed sits ABOVE the payments, because it is the thing
          somebody came to this page to act on. Worst first — oldest debt at the
          top, the house rule for a list you are meant to do something about. */}
      {owing.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border bg-bg-elev">
          <div className="min-w-[38rem]">
            <div className="flex items-center justify-between border-b border-border bg-bg-subtle px-3 py-1.5">
              <span className="text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">
                Still owed — oldest first
              </span>
              <span className="text-sm font-semibold tabular text-fg">{money(owingTotal)}</span>
            </div>
            {owing.slice(0, 12).map((o) => (
              <div key={o.purchase.id} className="grid grid-cols-[110px_minmax(8rem,1fr)_90px_110px_110px] items-center gap-2 border-b border-border px-3 py-1.5 last:border-0">
                <Link href={`/cocozuri/purchases`} className="truncate text-sm text-accent hover:underline">
                  {o.purchase.reference}
                </Link>
                <span className="min-w-0 truncate text-sm text-fg" title={o.paidTo ?? ""}>
                  {/* ⚠️ "Not named" as a plain fact, never a warning — the supplier
                      on a purchase is optional and must stay so. */}
                  {o.paidTo ?? "nobody named"}
                  {o.purchase.paidFrom === "own_money" && (
                    <span className="ml-1.5 text-xs text-warn">owed back personally</span>
                  )}
                </span>
                <span className="text-right text-sm tabular text-fg-subtle">{o.daysOld}d</span>
                <span className="text-right text-sm tabular text-fg-muted">{money(o.payable)}</span>
                <span className={`text-right text-sm tabular ${o.outstanding < 0 ? "text-warn" : "text-fg"}`}>
                  {money(o.outstanding)}
                  {o.outstanding < 0 && <span className="ml-1 text-xs">overpaid</span>}
                </span>
              </div>
            ))}
            {owing.length > 12 && (
              <p className="px-3 py-1.5 text-xs text-fg-subtle">and {owing.length - 12} more.</p>
            )}
          </div>
        </div>
      )}

      <RecordList
        rows={rows}
        columns={[
          { key: "paidOn", label: "Paid", width: "100px", render: (r) => <span className="text-sm text-fg-muted">{czDate(r.paidOn)}</span> },
          { key: "paidTo", label: "To", width: "minmax(0,1fr)", render: (r) => (
            <span className="min-w-0 truncate text-sm text-fg">
              {r.paidTo ?? "nobody named"}
              {r.purchaseRef && <span className="ml-1.5 text-xs text-fg-subtle">{r.purchaseRef}</span>}
            </span>
          ) },
          { key: "method", label: "How", width: "110px", hideBelow: "md", render: (r) => (
            <span className="truncate text-sm text-fg-subtle">{[r.method, r.reference].filter(Boolean).join(" · ") || "—"}</span>
          ) },
          { key: "statusLabel", label: "Books", width: "105px", render: (r) => (
            <span className={`text-sm ${r.booksState === "posted" ? "text-success" : r.booksState === "reversed" ? "text-fg-subtle" : "text-fg-muted"}`}>
              {r.statusLabel}
            </span>
          ) },
          { key: "amount", label: "Amount", width: "120px", align: "right", render: (r) => (
            <span className="text-sm tabular text-fg">{money(r.amount)}</span>
          ) },
          { key: "act", label: "", width: "150px", align: "right", render: (r) => (
            <span className="flex items-center justify-end gap-1">
              {r.booksState === "posted" ? (
                <button type="button" disabled={busy} title="Take it back out of the books"
                  onClick={() => {
                    const why = window.prompt("Taking a payment back out of the books. Why?");
                    if (why == null) return;
                    void run("Taken back out — a reversal, not an erasure.", () => unpostPaymentAction(r.id, why));
                  }}
                  className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-xs text-fg-subtle hover:text-fg disabled:opacity-60">
                  <BookOpen size={12} /> Unpost
                </button>
              ) : (
                <button type="button" disabled={busy || !ready} title={ready ? "Put it in the books" : reason ?? undefined}
                  onClick={() => void run("The payment is in the books.", () => postPaymentAction(r.id))}
                  className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-xs text-fg-subtle hover:text-fg disabled:opacity-60">
                  <BookOpen size={12} /> Post
                </button>
              )}
              <button type="button" disabled={busy} title="Remove it"
                onClick={() => {
                  if (!window.confirm("Remove this payment?")) return;
                  void run("Removed.", () => deletePaymentAction(r.id));
                }}
                className="inline-flex h-7 items-center rounded-md px-1.5 text-xs text-fg-subtle hover:text-danger disabled:opacity-60">
                <Trash2 size={12} />
              </button>
            </span>
          ) },
        ]}
        rowKey={(r) => r.id}
        listKey="cz_payment"
        filters={rail}
        total={payments.length}
        shown={rows.length}
        exportName="cocozuri-payments"
        footerNote={paid > 0 ? <span className="text-fg-muted">{money(paid)} paid out</span> : undefined}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Supplier, reference…"
              wrapperClassName="w-[16rem]" className="text-sm" />
            <span className="grow" />
            <button type="button" onClick={() => setPaying(true)} disabled={owing.length === 0}
              title={owing.length === 0 ? "Nothing is owed." : undefined}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-2.5 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-60">
              <Plus size={13} /> Pay somebody
            </button>
          </div>
        }
        empty={
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Banknote size={20} className="text-fg-subtle" />
            <p className="text-base font-medium text-fg-muted">Nothing has been paid out yet.</p>
            <p className="max-w-[32rem] text-sm text-fg-subtle">
              A purchase bought on account, or with somebody&apos;s own money, leaves a debt. This is
              where it gets settled — and where somebody who bought the almonds themselves gets
              their money back.
            </p>
          </div>
        }
      />

      {paying && (
        <PaySheet owing={owing} companies={companies} onClose={() => setPaying(false)}
          onPaid={() => { setPaying(false); router.refresh(); }} />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Paying
 * ------------------------------------------------------------------ */

function PaySheet({
  owing, companies, onClose, onPaid,
}: {
  owing: CzOwing[];
  companies: { id: number; name: string }[];
  onClose: () => void;
  onPaid: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [paidOn, setPaidOn] = useState(todayInDar());
  const [method, setMethod] = useState("");
  const [reference, setReference] = useState("");
  const [fromCompany, setFromCompany] = useState<number | null>(null);
  const [amounts, setAmounts] = useState<Record<number, string>>({});

  const lines = owing
    .filter((o) => typedNumberOr(amounts[o.purchase.id]) !== 0)
    .map((o) => ({
      purchaseId: o.purchase.id,
      amount: typedNumberOr(amounts[o.purchase.id]),
      payable: o.payable,
      alreadyPaid: o.paid,
    }));

  const blockers = paymentBlockers({ lines, paidOn });
  const total = lines.reduce((s, l) => s + l.amount, 0);
  const overpaying = owing.filter((o) => typedNumberOr(amounts[o.purchase.id]) > o.outstanding + 0.005);

  async function save() {
    setBusy(true);
    const res = await createPaymentsAction(
      lines.map((l) => ({
        purchaseId: l.purchaseId,
        amount: l.amount,
        paidOn,
        method: method || null,
        reference: reference || null,
        paidFromCompanyId: fromCompany,
      })),
    );
    setBusy(false);
    if (!res.ok) { toast(res.error ?? "Could not record it.", { tone: "danger" }); return; }
    toast(`${lines.length} payment${lines.length === 1 ? "" : "s"} recorded. Post them to put the money in the books.`, { tone: "success" });
    onPaid();
  }

  return (
    <BottomSheet open onClose={onClose} title="Pay somebody" maxWidth="max-w-3xl">
      <div className="flex flex-col gap-3 px-1 pb-2">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Date">
            <input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} className={FIELD} />
          </Field>
          <Field label="How">
            <input value={method} onChange={(e) => setMethod(e.target.value)} className={FIELD} placeholder="Cash, transfer, cheque" />
          </Field>
          <Field label="Reference">
            <input value={reference} onChange={(e) => setReference(e.target.value)} className={FIELD} placeholder="Cheque or transfer no." />
          </Field>
          <Field label="Out of whose account">
            <FluidSelect
              value={fromCompany == null ? "" : String(fromCompany)}
              onSelect={(v) => setFromCompany(v ? Number(v) : null)}
              placeholder="Cocozuri"
              options={[{ value: "", label: "Cocozuri" }, ...companies.map((c) => ({ value: String(c.id), label: c.name }))]} />
          </Field>
        </div>

        {/* ⚠️ Said before anything is typed. One cheque covering four bills is
            four rows, all or nothing — nothing sits on account. */}
        <p className="rounded-md border border-border bg-bg-subtle px-3 py-2 text-sm text-fg-muted">
          One payment can cover several purchases: type an amount against each, and they are recorded
          together under the same date and reference. Either all of them land or none does.
        </p>

        <div className="rounded-md border border-border">
          <div className="grid grid-cols-[110px_minmax(0,1fr)_110px_120px] items-center gap-2 border-b border-border bg-bg-subtle px-2.5 py-1.5 text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">
            <span>Purchase</span>
            <span>Owed to</span>
            <span className="text-right">Outstanding</span>
            <span className="text-right">Paying</span>
          </div>
          <div className="max-h-[20rem] overflow-y-auto">
            {owing.map((o) => (
              <div key={o.purchase.id} className="grid grid-cols-[110px_minmax(0,1fr)_110px_120px] items-center gap-2 border-b border-border px-2.5 py-1.5 last:border-0">
                <span className="truncate text-sm text-fg">{o.purchase.reference}</span>
                <span className="min-w-0 truncate text-sm text-fg-muted" title={o.paidTo ?? ""}>
                  {o.paidTo ?? "nobody named"}
                  {o.purchase.paidFrom === "own_money" && <span className="ml-1.5 text-xs text-warn">personally</span>}
                </span>
                <span className="text-right text-sm tabular text-fg-muted">{money(o.outstanding)}</span>
                <input value={amounts[o.purchase.id] ?? ""} inputMode="decimal"
                  onChange={(e) => setAmounts((a) => ({ ...a, [o.purchase.id]: e.target.value }))}
                  className={`${FIELD} text-right tabular`} placeholder="–"
                  aria-label={`Paying against ${o.purchase.reference}`} />
              </div>
            ))}
          </div>
        </div>

        {/* ⚠️ An overpayment is recorded as it stands, not refused — people do
            overpay, and a system that will not write it down gets a second set
            of books kept beside it. */}
        {overpaying.length > 0 && (
          <p className="rounded-md border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-warn">
            That is more than is outstanding on {overpaying.map((o) => o.purchase.reference).join(", ")}.
            It will be recorded as it stands and shown as an overpayment.
          </p>
        )}

        {total !== 0 && (
          <p className="rounded-md border border-border bg-bg-subtle px-3 py-2 text-sm text-fg-muted">
            <strong className="text-fg">{money(total)}</strong> across {lines.length} purchase
            {lines.length === 1 ? "" : "s"}.
          </p>
        )}

        {blockers.length > 0 && lines.length > 0 && (
          <p className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            <AlertTriangle size={13} className="mt-px shrink-0" /> {blockers[0]}
          </p>
        )}

        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void save()} disabled={busy || blockers.length > 0}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-60">
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Banknote size={13} />} Record it
          </button>
          <button type="button" onClick={onClose} className="h-8 rounded-md px-3 text-sm text-fg-muted hover:text-fg">Cancel</button>
        </div>
      </div>
    </BottomSheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">{label}</span>
      {children}
    </label>
  );
}

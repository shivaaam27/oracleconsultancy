"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Banknote, BookOpen, Loader2, Plus, Trash2, Undo2 } from "lucide-react";
import { RecordList, type RecordFilter } from "@/components/record-list";
import { buildColumns } from "@/components/entity-cells";
import { ENTITY_VIEWS } from "@/lib/entity-view";
import { SearchInput } from "@/components/ui";
import { useToast } from "@/components/toast";
import { CocozuriReceiptSheet } from "@/components/cocozuri-receipt-sheet";
import {
  money,
  type CzCustomer, type CzInvoice, type CzReceipt,
} from "@/lib/cocozuri-shared";
import { deleteReceiptAction, postReceiptAction, unpostReceiptAction } from "@/app/cocozuri/actions";

/* ------------------------------------------------------------------ *
 * Money in.
 *
 * The workbook has no such list. What it has is a PAID column and a PAID DATE
 * column on the invoice row, which can hold exactly one payment — so a part
 * payment either overwrote the first one or went into REMARKS as a sentence.
 * Here a payment is a row, and two against one invoice are two rows.
 * ------------------------------------------------------------------ */

type Row = CzReceipt & {
  customerName: string;
  receivedLabel: string;
  amountLabel: string;
};

export function CocozuriReceipts({
  receipts, customers, invoices, companies, openNew, books, booksReady, booksReason,
}: {
  receipts: CzReceipt[];
  customers: CzCustomer[];
  invoices: CzInvoice[];
  companies: { id: number; name: string }[];
  openNew?: boolean;
  /** receiptId → whether it is in the books. Resolved server-side in ONE query. */
  books: Record<number, "unposted" | "posted" | "reversed">;
  /** False when the chart of accounts cannot serve a posting yet. */
  booksReady: boolean;
  booksReason: string | null;
}) {
  const { toast } = useToast();
  const [, start] = useTransition();
  const [q, setQ] = useState("");
  const [into, setInto] = useState<number | null | "own">(null);
  const [recording, setRecording] = useState(!!openNew);
  const [busy, setBusy] = useState<number | null>(null);

  /**
   * ⚠️ THE `?new=1` FLAG IS TAKEN OUT OF THE ADDRESS AS SOON AS IT HAS BEEN
   * USED, AND IT IS NOT COSMETIC.
   *
   * `revalidatePath("/cocozuri/receipts")` does not invalidate the client's
   * cached entry for `/cocozuri/receipts?new=1` — they are different keys. So on
   * the deep link the payment SAVED and the list did not move: press Record it,
   * nothing happens, press it again, and the customer has been credited twice.
   * Measured both ways — on the clean URL the list went to 4 payments at once;
   * on `?new=1` it sat at 2 with three rows in the table.
   *
   * It also stops Back re-opening the sheet, which is the reason `/notes` does
   * the same thing.
   */
  useEffect(() => {
    if (openNew) window.history.replaceState(null, "", "/cocozuri/receipts");
  }, [openNew]);

  const nameOf = useMemo(
    () => new Map(customers.map((c) => [c.id, c.name] as const)),
    [customers],
  );

  const rows: Row[] = useMemo(() => {
    const term = q.trim().toLowerCase();
    return receipts
      .filter((r) => (into == null ? true : into === "own" ? r.receivedIntoCompanyId == null : r.receivedIntoCompanyId === into))
      .map((r) => ({
        ...r,
        customerName: nameOf.get(r.customerId) ?? "—",
        receivedLabel: new Date(r.receivedOn).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" }),
        amountLabel: money(r.amount, r.currency),
      }))
      .filter((r) =>
        !term ||
        r.customerName.toLowerCase().includes(term) ||
        (r.invoiceNumber ?? "").toLowerCase().includes(term) ||
        (r.reference ?? "").toLowerCase().includes(term) ||
        (r.method ?? "").toLowerCase().includes(term));
  }, [receipts, q, into, nameOf]);

  /* ⚠️ THE "IN DSC" SPLIT, MADE COUNTABLE. In the workbook this fact lives in a
     REMARKS column as free prose ("Cheque received in DSC"), so nobody can say
     how much of Cocozuri's money went where. Here it is a filter with a total. */
  const intoCounts = useMemo(() => {
    const m = new Map<number | "own", number>();
    for (const r of receipts) {
      const k = r.receivedIntoCompanyId ?? "own";
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [receipts]);

  const rail: RecordFilter[] = [
    { key: "all", label: "All payments", count: receipts.length, href: "/cocozuri/receipts", active: into == null, onSelect: () => setInto(null) },
    ...(intoCounts.has("own")
      ? [{ key: "own", label: "Into Cocozuri", count: intoCounts.get("own")!, href: "#", active: into === "own", group: "Received into", onSelect: () => setInto("own") }]
      : []),
    ...companies
      .filter((c) => intoCounts.has(c.id))
      .map((c) => ({
        key: `co-${c.id}`, label: `Into ${c.name}`, count: intoCounts.get(c.id)!,
        href: "#", active: into === c.id, group: "Received into",
        tone: "warn" as const, onSelect: () => setInto(c.id),
      })),
  ];

  const total = rows.reduce((t, r) => t + r.amount, 0);

  const columns = buildColumns<Row>(ENTITY_VIEWS.cz_receipt!.listColumns, {
    overrides: {
      invoiceNumber: (r) => (
        <span className="truncate text-[12.5px] text-fg-muted">{r.invoiceNumber ?? "—"}</span>
      ),
      amountLabel: (r) => (
        <span className="tabular text-[12.5px] text-fg">
          {r.amountLabel}
          {/* ⚠️ A quiet mark, not a column of its own — six columns already
              crowd this card. Green means it reached the accounts. */}
          {books[r.id] === "posted" && (
            <BookOpen size={11} className="ml-1 inline-block align-[-1px] text-success" aria-label="In the books" />
          )}
          {books[r.id] === "reversed" && (
            <Undo2 size={11} className="ml-1 inline-block align-[-1px] text-warn" aria-label="Taken back out of the books" />
          )}
        </span>
      ),
    },
  });

  async function post(r: Row) {
    setBusy(r.id);
    const res = await postReceiptAction(r.id);
    setBusy(null);
    if (!res.ok) { toast(res.error ?? "Could not post it.", { tone: "danger" }); return; }
    toast(`${money(r.amount, r.currency)} is in the books.`, { tone: "success" });
    start(() => {});
  }

  async function reverse(r: Row) {
    const why = prompt("Take this payment back out of the books? The original entries and their reversal both stay on the record.\n\nWhy?");
    if (why === null) return;
    setBusy(r.id);
    const res = await unpostReceiptAction(r.id, why || null);
    setBusy(null);
    if (!res.ok) { toast(res.error ?? "Could not reverse it.", { tone: "danger" }); return; }
    toast("Taken out of the books, with a reversal on the record.", { tone: "success" });
    start(() => {});
  }

  async function remove(r: Row) {
    if (!confirm(`Remove the ${money(r.amount, r.currency)} recorded against ${r.invoiceNumber ?? "this invoice"}? The invoice goes back to owing it.`)) return;
    const res = await deleteReceiptAction(r.id);
    if (!res.ok) { toast(res.error ?? "Could not remove it.", { tone: "danger" }); return; }
    toast("Payment removed.", { tone: "success" });
    start(() => {});
  }

  return (
    <>
      <RecordList
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        listKey="cz_receipt"
        filters={rail}
        total={receipts.length}
        shown={rows.length}
        exportName="cocozuri-payments"
        rowActions={(r) => (
          <span className="flex items-center gap-1.5">
            {busy === r.id && <Loader2 size={13} className="animate-spin text-fg-subtle" />}
            {/* ⚠️ Posting is explicit, per the ledger's fifth rule — recording a
                payment does not put it in the accounts. */}
            {books[r.id] !== "posted" && books[r.id] !== "reversed" && booksReady && (
              <button type="button" onClick={() => void post(r)} className="text-fg-subtle hover:text-accent" title="Post to the ledger">
                <BookOpen size={13} />
              </button>
            )}
            {books[r.id] === "posted" && (
              <button type="button" onClick={() => void reverse(r)} className="text-fg-subtle hover:text-warn" title="Take it back out of the books">
                <Undo2 size={13} />
              </button>
            )}
            <button type="button" onClick={() => void remove(r)} className="text-fg-subtle hover:text-danger" title="Remove this payment">
              <Trash2 size={13} />
            </button>
          </span>
        )}
        footerNote={
          <span className="flex items-center gap-3">
            <span className="tabular">{money(total)} shown</span>
            {/* ⚠️ Says WHY nothing can be posted. "0 in the books" on its own
                sends somebody hunting for a bug that is really an empty chart
                of accounts. */}
            {!booksReady && booksReason && <span className="text-fg-subtle">{booksReason}</span>}
            {booksReady && (
              <span className="text-fg-subtle">
                {rows.filter((r) => books[r.id] === "posted").length} of {rows.length} in the books
              </span>
            )}
          </span>
        }
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Customer, invoice, reference…"
              wrapperClassName="w-[16rem]" className="h-8 text-[12.5px]" />
            <span className="grow" />
            <button type="button" onClick={() => setRecording(true)}
              className="inline-flex h-7 items-center gap-1.5 rounded-md bg-accent px-2.5 text-[12px] font-medium text-accent-fg hover:opacity-90">
              <Plus size={13} /> Record a payment
            </button>
          </div>
        }
        empty={
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Banknote size={20} className="text-fg-subtle" />
            <p className="text-[13px] font-medium text-fg-muted">No payments recorded yet.</p>
            <p className="max-w-[28rem] text-[12px] text-fg-subtle">
              Record one and the invoice it settles stops appearing on the Owed page. One cheque can
              cover several invoices — tick them all and it is written down once against each.
            </p>
          </div>
        }
      />

      {recording && (
        <CocozuriReceiptSheet
          customers={customers}
          invoices={invoices}
          receipts={receipts}
          companies={companies}
          onClose={() => setRecording(false)}
        />
      )}
    </>
  );
}

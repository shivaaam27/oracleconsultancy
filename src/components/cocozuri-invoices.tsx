"use client";

import { useMemo, useState } from "react";
import { FileText, Plus, Undo2 } from "lucide-react";
import { RecordList, type RecordColumn, type RecordFilter } from "@/components/record-list";
import { SearchInput } from "@/components/ui";
import { CocozuriInvoiceSheet } from "@/components/cocozuri-invoice-sheet";
import {
  invoiceDueDate, invoiceTotals, money,
  type CzCustomer, type CzInvoice, type CzPrice, type CzProduct,
  czDate,
} from "@/lib/cocozuri-shared";
import { cn } from "@/lib/cn";

type Row = CzInvoice & { total: number; due: Date };

export function CocozuriInvoices({
  invoices, customers, products, prices, defaultVat,
}: {
  invoices: CzInvoice[];
  customers: CzCustomer[];
  products: CzProduct[];
  prices: CzPrice[];
  defaultVat: number;
}) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [raising, setRaising] = useState<null | "invoice" | "credit_note">(null);

  const rows: Row[] = useMemo(() => {
    const term = q.trim().toLowerCase();
    return invoices
      .filter((i) => (status ? i.status === status : true))
      .filter((i) =>
        !term || i.number.toLowerCase().includes(term) || i.customerName.toLowerCase().includes(term)
      )
      .map((i) => ({
        ...i,
        // ⚠️ Worked out from the lines every time. There is no total column, and
        // there must never be one — see `invoiceTotals`.
        total: invoiceTotals(i.lines, i.vatRate, i.taxInclusive).gross,
        due: invoiceDueDate(i.issueDate, i.termsDays),
      }));
  }, [invoices, q, status]);

  const count = (s: string) => invoices.filter((i) => i.status === s).length;
  const rail: RecordFilter[] = [
    { key: "all", label: "All", count: invoices.length, href: "#", active: !status, onSelect: () => setStatus(null) },
    { key: "draft", label: "Drafts", count: count("draft"), href: "#", active: status === "draft", onSelect: () => setStatus("draft") },
    { key: "issued", label: "Issued", count: count("issued"), href: "#", active: status === "issued", onSelect: () => setStatus("issued") },
    { key: "cancelled", label: "Cancelled", count: count("cancelled"), href: "#", active: status === "cancelled", group: "Archive", onSelect: () => setStatus("cancelled") },
  ];

  const columns: RecordColumn<Row>[] = [
    {
      key: "number", label: "Number", width: "150px",
      render: (r: Row) => (
        <span className="inline-flex items-center gap-1.5">
          {r.docType === "credit_note" && <Undo2 size={11} className="shrink-0 text-warn" aria-label="Credit note" />}
          <span className="truncate text-base font-medium text-fg">{r.number}</span>
        </span>
      ),
    },
    { key: "customerName", label: "Customer", width: "minmax(0,1fr)", render: (r: Row) => <span className="truncate">{r.customerName}</span> },
    {
      key: "issueDate", label: "Date", width: "110px", hideBelow: "md",
      render: (r: Row) => <span className="text-fg-muted">{czDate(r.issueDate)}</span>,
    },
    {
      key: "status", label: "Status", width: "100px",
      render: (r: Row) => (
        <span className={cn("text-sm",
          r.status === "issued" ? "text-success" : r.status === "cancelled" ? "text-fg-subtle line-through" : "text-warn")}>
          {r.status === "draft" ? "Draft" : r.status === "issued" ? "Issued" : "Cancelled"}
        </span>
      ),
    },
    {
      key: "total", label: "Amount", width: "130px",
      render: (r: Row) => (
        <span className={cn("tabular text-sm", r.docType === "credit_note" ? "text-warn" : "text-fg")}>
          {r.docType === "credit_note" ? "−" : ""}{money(r.total, r.currency)}
        </span>
      ),
    },
  ];

  return (
    <>
      <RecordList
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        rowHref={(r) => `/cocozuri/invoices/${encodeURIComponent(r.number)}`}
        listKey="cz_invoice"
        filters={rail}
        total={invoices.length}
        shown={rows.length}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search invoices…"
              wrapperClassName="w-[15rem]" className="h-8 text-sm" />
            <span className="grow" />
            <button type="button" onClick={() => setRaising("credit_note")}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2 text-sm font-medium text-fg-muted hover:text-fg">
              <Undo2 size={13} /> Credit note
            </button>
            <button type="button" onClick={() => setRaising("invoice")}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-2.5 text-sm font-medium text-accent-fg hover:opacity-90">
              <Plus size={13} /> New invoice
            </button>
          </div>
        }
        empty={
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <FileText size={20} className="text-fg-subtle" />
            <p className="text-base font-medium text-fg-muted">No invoices yet.</p>
            <p className="max-w-[26rem] text-sm text-fg-subtle">
              Raise one and the prices fill themselves in from the customer&rsquo;s own list.
            </p>
          </div>
        }
      />

      {raising && (
        <CocozuriInvoiceSheet
          customers={customers}
          products={products}
          prices={prices}
          defaultVat={defaultVat}
          docType={raising}
          onClose={() => setRaising(null)}
        />
      )}
    </>
  );
}

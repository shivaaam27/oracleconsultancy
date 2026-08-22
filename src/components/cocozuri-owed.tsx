"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Plus } from "lucide-react";
import { RecordList, type RecordColumn, type RecordFilter } from "@/components/record-list";
import { SearchInput } from "@/components/ui";
import { CocozuriReceiptSheet } from "@/components/cocozuri-receipt-sheet";
import {
  CZ_AGEING_BANDS, ageingSummary, customerAccounts, money, outstandingOf,
  type CzAgeingKey, type CzCustomer, type CzInvoice, type CzReceipt,
} from "@/lib/cocozuri-shared";
import { cn } from "@/lib/cn";

/* ------------------------------------------------------------------ *
 * What is owed, and how late.
 *
 * ⚠️ THE FIVE BANDS ACROSS THE TOP ARE THE POINT OF THIS PAGE. The workbook has
 * four: its Sheet2 jumps from 31–60 straight to 91+, so everything between 61
 * and 90 days late is reported a whole month younger than it is. On the day the
 * books were read that was two invoices worth TZS 1,567,000 — CZ-180 and
 * CZ/AP/47 — sitting in the wrong column.
 *
 * ⚠️ NOTHING ON THIS SCREEN IS STORED. Every figure is worked out from the
 * invoices, their credit notes and the receipts, each time it is asked for. The
 * workbook's answer to this was a DEBTOR MASTER sheet typed out by hand at each
 * month end, which was out of date the moment a cheque arrived.
 * ------------------------------------------------------------------ */

type Row = {
  customerId: number;
  customerName: string;
  balance: number;
  unappliedCredit: number;
  oldestDays: number;
  openInvoices: number;
  bands: Record<CzAgeingKey, number>;
};

export function CocozuriOwed({
  invoices, receipts, customers, companies,
}: {
  invoices: CzInvoice[];
  receipts: CzReceipt[];
  customers: CzCustomer[];
  companies: { id: number; name: string }[];
}) {
  const [q, setQ] = useState("");
  const [band, setBand] = useState<CzAgeingKey | null>(null);
  const [recording, setRecording] = useState<number | null | false>(false);

  const outstanding = useMemo(() => outstandingOf(invoices, receipts), [invoices, receipts]);
  const accounts = useMemo(() => customerAccounts(invoices, receipts), [invoices, receipts]);
  const totals = useMemo(
    () => ageingSummary(outstanding.map((o) => ({ days: o.days, amount: o.balance }))),
    [outstanding],
  );
  const owed = Object.values(totals).reduce((t, v) => t + v, 0);

  const rows: Row[] = useMemo(() => {
    const term = q.trim().toLowerCase();
    return accounts
      .filter((a) => a.openInvoices > 0 || Math.round(a.balance) !== 0)
      .filter((a) => (band ? Math.round(a.bands[band]) !== 0 : true))
      .filter((a) => !term || a.customerName.toLowerCase().includes(term))
      .map((a) => ({
        customerId: a.customerId,
        customerName: a.customerName,
        balance: a.balance,
        unappliedCredit: a.unappliedCredit,
        oldestDays: a.oldestDays,
        openInvoices: a.openInvoices,
        bands: a.bands,
      }));
  }, [accounts, q, band]);

  const rail: RecordFilter[] = [
    { key: "all", label: "Everyone who owes", count: accounts.filter((a) => a.openInvoices > 0).length, href: "/cocozuri/owed", active: !band, onSelect: () => setBand(null) },
    ...CZ_AGEING_BANDS.map((b) => ({
      key: b.key,
      label: b.label,
      count: accounts.filter((a) => Math.round(a.bands[b.key]) !== 0).length,
      href: "#",
      active: band === b.key,
      group: "How late",
      tone: (b.key === "over90" ? "danger" : b.key === "d61_90" ? "warn" : undefined) as "danger" | "warn" | undefined,
      onSelect: () => setBand(b.key),
    })),
  ];

  const columns: RecordColumn<Row>[] = [
    /* ⚠️ NINE COLUMNS DID NOT FIT. Five ageing bands, a total, a count and an age
       against one flexible name left the customer 120px even on a 1440px screen
       — "SHOPPERS SUPERMARKET LTD" and "SHREEJI SUPERMARKET" truncate to the
       same thing, which is exactly the fault the Documents list already records.
       The count moves INTO the name cell as a context line, the way the rest of
       Desk carries secondary detail. */
    {
      key: "customerName", label: "Customer", width: "minmax(0,1fr)",
      render: (r) => (
        <span className="flex min-w-0 flex-col">
          <Link href={`/cocozuri/statements/${r.customerId}`} className="truncate text-[13px] font-medium text-fg hover:text-accent">
            {r.customerName}
          </Link>
          <span className="truncate text-[11px] text-fg-subtle">
            {r.openInvoices ? `${r.openInvoices} unpaid` : "nothing outstanding"}
          </span>
        </span>
      ),
      csv: (r) => r.customerName,
    },
    {
      key: "oldestDays", label: "Oldest", width: "76px", align: "right",
      render: (r) => (
        <span className={cn("tabular text-[12.5px]",
          r.oldestDays > 90 ? "text-danger" : r.oldestDays > 60 ? "text-warn" : r.oldestDays > 0 ? "text-fg-muted" : "text-fg-subtle")}>
          {r.oldestDays > 0 ? `${r.oldestDays}d` : "—"}
        </span>
      ),
      csv: (r) => r.oldestDays,
    },
    // One column per band, so a customer's debt is read across the row exactly
    // as the workbook's per-customer ageing block reads — with the band it is
    // missing put back.
    ...CZ_AGEING_BANDS.map((b): RecordColumn<Row> => ({
      key: b.key, label: b.short, width: "92px", align: "right",
      /* ⚠️ ALL FIVE FOLD AWAY BELOW `lg`, not just the two quiet ones. On a
         375px phone the five bands were resolving to 27px each — a column too
         narrow to print "250,000" in, so the ageing read as five slivers of
         nothing. Below `lg` the phone keeps what it can act on: who owes, how
         late, how much. The tiles above still carry the totals. */
      hideBelow: "lg",
      render: (r) => (
        <span className={cn("tabular text-[12px]",
          Math.round(r.bands[b.key]) === 0 ? "text-fg-subtle"
            : b.key === "over90" ? "text-danger" : b.key === "d61_90" ? "text-warn" : "text-fg-muted")}>
          {Math.round(r.bands[b.key]) === 0 ? "—" : money(r.bands[b.key])}
        </span>
      ),
      csv: (r) => Math.round(r.bands[b.key]),
      total: (rs) => {
        const t = rs.reduce((n, r) => n + r.bands[b.key], 0);
        return <span className="tabular">{Math.round(t) === 0 ? "—" : money(t)}</span>;
      },
    })),
    {
      key: "balance", label: "Owed", width: "112px", align: "right",
      render: (r) => (
        <span className="tabular text-[12.5px] font-medium text-fg">
          {money(r.balance)}
          {/* ⚠️ Shown apart, never netted into a band: a credit note attached to
              no invoice cannot be aged, and folding it in would put a figure in
              a column that means something else. */}
          {Math.round(r.unappliedCredit) !== 0 && (
            <span className="ml-1 text-[11px] text-accent" title="Credit on account, not applied to any invoice">
              (−{money(r.unappliedCredit)} credit)
            </span>
          )}
        </span>
      ),
      csv: (r) => Math.round(r.balance),
      total: (rs) => <span className="tabular">{money(rs.reduce((t, r) => t + r.balance, 0))}</span>,
    },
  ];

  return (
    <>
      {/* The ageing, across the whole book. Every number is a door: tap it and
          the list below narrows to the people in that band. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <BandTile label="Owed in total" value={owed} tone="total" active={!band} onClick={() => setBand(null)} />
        {CZ_AGEING_BANDS.map((b) => (
          <BandTile
            key={b.key}
            label={b.label}
            value={totals[b.key]}
            tone={b.key === "over90" ? "danger" : b.key === "d61_90" ? "warn" : "plain"}
            active={band === b.key}
            onClick={() => setBand(band === b.key ? null : b.key)}
          />
        ))}
      </div>

      <RecordList
        rows={rows}
        columns={columns}
        rowKey={(r) => r.customerId}
        listKey="cz_owed"
        filters={rail}
        total={accounts.length}
        shown={rows.length}
        exportName="cocozuri-owed"
        showFooter
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customers…"
              wrapperClassName="w-[15rem]" className="h-8 text-[12.5px]" />
            <span className="grow" />
            <button type="button" onClick={() => setRecording(null)}
              className="inline-flex h-7 items-center gap-1.5 rounded-md bg-accent px-2.5 text-[12px] font-medium text-accent-fg hover:opacity-90">
              <Plus size={13} /> Record a payment
            </button>
          </div>
        }
        empty={
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <CheckCircle2 size={20} className="text-success" />
            <p className="text-[13px] font-medium text-fg-muted">Nothing is outstanding.</p>
            <p className="max-w-[26rem] text-[12px] text-fg-subtle">
              Only issued invoices count here — a draft has not been sent to anybody, so nobody owes it.
            </p>
          </div>
        }
      />

      {/* The oldest invoices, one line each — the chase list. */}
      {outstanding.length > 0 && (
        <div className="rounded-lg border border-border bg-bg-elev">
          <div className="flex items-center justify-between border-b border-border px-3.5 py-2">
            <h2 className="text-[13px] font-semibold text-fg">The oldest first</h2>
            <span className="text-[11.5px] text-fg-subtle">{outstanding.length} invoice{outstanding.length === 1 ? "" : "s"} unpaid</span>
          </div>
          <ul>
            {outstanding.slice(0, 12).map((o) => (
              <li key={o.invoice.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 border-b border-border px-3.5 py-1.5 text-[12.5px] last:border-0">
                <Link href={`/cocozuri/invoices/${encodeURIComponent(o.invoice.number)}`} className="truncate text-fg hover:text-accent">
                  {o.invoice.number}
                  <span className="text-fg-subtle"> · {o.invoice.customerName}</span>
                  {o.invoice.branchName && <span className="text-fg-subtle"> · {o.invoice.branchName}</span>}
                </Link>
                <span className={cn("tabular text-[12px]",
                  o.days > 90 ? "text-danger" : o.days > 60 ? "text-warn" : o.days > 0 ? "text-fg-muted" : "text-fg-subtle")}>
                  {o.days > 0 ? `${o.days} days late` : `due in ${-o.days} days`}
                </span>
                <span className="tabular text-fg">{money(o.balance, o.invoice.currency)}</span>
              </li>
            ))}
          </ul>
          {outstanding.length > 12 && (
            <p className="px-3.5 py-1.5 text-[11.5px] text-fg-subtle">
              {outstanding.length - 12} more — open a customer&rsquo;s statement for their full list.
            </p>
          )}
        </div>
      )}

      {recording !== false && (
        <CocozuriReceiptSheet
          customers={customers}
          invoices={invoices}
          receipts={receipts}
          companies={companies}
          presetCustomerId={recording}
          onClose={() => setRecording(false)}
        />
      )}
    </>
  );
}

function BandTile({
  label, value, tone, active, onClick,
}: {
  label: string;
  value: number;
  tone: "total" | "danger" | "warn" | "plain";
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2.5 text-left transition-colors",
        active ? "border-accent bg-accent-soft" : "border-border bg-bg-elev hover:border-accent/40 hover:bg-bg-subtle",
      )}
    >
      <span className={cn("tabular text-[16px] font-semibold leading-none",
        Math.round(value) === 0 ? "text-fg-subtle"
          : tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : "text-fg")}>
        {money(value)}
      </span>
      <span className="text-[11.5px] text-fg-muted">{label}</span>
    </button>
  );
}

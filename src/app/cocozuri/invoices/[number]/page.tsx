import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { defaultVatRate, getInvoiceByNumber, listCustomers, listInvoices, listPrices, listProducts, listReceipts } from "@/lib/cocozuri";
import { cocozuriCompany } from "@/lib/cocozuri";
import { invoiceBooksState, resolveAccounts } from "@/lib/cocozuri-ledger";
import { CocozuriInvoiceActions } from "@/components/cocozuri-invoice-actions";
import { CocozuriCreditApply } from "@/components/cocozuri-credit-apply";
import { CocozuriBooksStrip } from "@/components/cocozuri-books-strip";
import { CocozuriDespatch } from "@/components/cocozuri-despatch";
import { CocozuriInvoiceEdit } from "@/components/cocozuri-invoice-edit";
import { despatchChoices, despatchFor } from "@/lib/cocozuri-despatch";
import { CocozuriTimeline } from "@/components/cocozuri-timeline";
import { CocozuriHelp } from "@/components/cocozuri-help";
import { timelineFor } from "@/lib/cocozuri-events";
import { amountInWords, invoiceBalance, invoiceDueDate, invoiceTotals, lineAmount, money, packLabel } from "@/lib/cocozuri-shared";

export const dynamic = "force-dynamic";

/** ⚠️ Every other CocoZuri page names itself; this one fell back to the app's
 *  default, so an invoice open in a tab read "Oracle Consultancy Limited —
 *  Operations". The number is the one thing you look for across a row of tabs. */
export async function generateMetadata({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  return { title: `${decodeURIComponent(number)} — CocoZuri` };
}

/**
 * One invoice, as it prints.
 *
 * The layout follows the spreadsheets it replaces, because the customers already
 * recognise it: Cocozuri's own line at the top, the customer's details on the
 * left, the number and date on the right, then the lines and the total in words.
 *
 * ⚠️ EVERY FIGURE IS WORKED OUT HERE. There is no total column on the invoice and
 * no VAT column — the lines are the fact. And every DETAIL is the one frozen onto
 * the invoice when it was raised, never today's: a customer who moves office does
 * not rewrite paperwork they were sent last year.
 */
export default async function CocozuriInvoicePage({
  params,
}: {
  params: Promise<{ number: string }>;
}) {
  const { number } = await params;
  const invoice = await getInvoiceByNumber(decodeURIComponent(number));
  if (!invoice) notFound();

  const t = invoiceTotals(invoice.lines, invoice.vatRate, invoice.taxInclusive);
  const due = invoiceDueDate(invoice.issueDate, invoice.termsDays);
  const isCredit = invoice.docType === "credit_note";

  // What is still owed on it — worked out from the receipts and any credit note
  // pointed at it, never stored. Only meaningful once it has been issued.
  const [siblings, receipts] = await Promise.all([
    listInvoices({ customerId: invoice.customerId }),
    listReceipts({ customerId: invoice.customerId }),
  ]);
  const bal = invoiceBalance(invoice, receipts, siblings.filter((i) => i.docType === "credit_note"));
  const settled = invoice.status === "issued" && !isCredit;

  // ⚠️ Only an ISSUED document can be in the books, so a draft is not asked
  // about — the strip would have nothing to say and a Post button on a draft
  // invites exactly the mistake the rule exists to prevent.
  const company = await cocozuriCompany();
  const [booksState, accounts] = invoice.status === "issued" && company
    ? await Promise.all([invoiceBooksState(invoice), resolveAccounts(company.id)])
    : [null, null];

  /* ⚠️ WHICH LOTS WENT OUT — on an ISSUED invoice only. A draft has despatched
     nothing, and a credit note is chocolate coming back, so neither has lots to
     show. ⚠️ It moves no stock: the day sheet owns the quantity. */
  const showsDespatch = invoice.status === "issued" && !isCredit;
  const [despatch, lotChoices] = showsDespatch
    ? await Promise.all([despatchFor(invoice.id), despatchChoices(invoice.id)])
    : [[], {}];

  /* ⚠️ ONLY A DRAFT CAN BE EDITED, so the catalogue is only loaded for one.
     An issued invoice offering an Edit button would be inviting exactly the
     mistake the rule exists to prevent — and the server refuses it by number. */
  const events = await timelineFor("invoice", invoice.id);
  const editable = invoice.status === "draft";
  const [editCustomers, editProducts, editPrices, editVat] = editable
    ? await Promise.all([listCustomers(), listProducts(), listPrices(), defaultVatRate()])
    : [[], [], [], 0];

  return (
    <div className="mx-auto w-full max-w-[58rem] space-y-3">
      {/* Everything in here is chrome, and none of it prints. */}
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Link href="/cocozuri/invoices"
          className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm text-fg-muted hover:bg-bg-subtle hover:text-fg">
          <ArrowLeft size={13} /> All invoices
        </Link>
        <span className="grow" />
        <CocozuriHelp title="This invoice">
          <p>
            <strong>A draft can be edited; an issued one cannot.</strong> Changing the customer on a
            draft re-freezes the VAT rate, the terms, the currency and their details. An issued
            invoice is answered with a credit note.
          </p>
          <p>
            <strong>Issuing is not posting.</strong> Somebody presses Post, and until they do this
            is not in the books.
          </p>
          <p>
            <strong>The lots below are a despatch record and they move no stock.</strong> The day
            sheet is what takes chocolate off the shelf. They are written at issue, soonest-expiring
            first, and against what other invoices have already claimed of each lot &mdash; without
            that, two invoices would each be told the whole lot was theirs.
          </p>
          <p>
            <strong>They can be corrected after issue</strong>, which is the one place this module
            bends its own rule. Which lots went in the van is not money.
          </p>
        </CocozuriHelp>
        {editable && (
          <CocozuriInvoiceEdit
            invoice={{
              id: invoice.id,
              number: invoice.number,
              docType: invoice.docType,
              customerName: invoice.customerName,
              branchName: invoice.branchName,
              reference: invoice.reference,
              lines: invoice.lines.map((l) => ({
                productId: l.productId,
                description: l.description,
                brand: l.brand,
                packSize: l.packSize,
                packUnit: l.packUnit,
                uom: l.uom,
                qty: l.qty,
                unitPrice: l.unitPrice,
              })),
            }}
            customers={editCustomers} products={editProducts} prices={editPrices} defaultVat={editVat} />
        )}
        <CocozuriInvoiceActions id={invoice.id} status={invoice.status} number={invoice.number} />
      </div>

      {/* Is it in the books, and if not, why not. */}
      {booksState && accounts && (
        <CocozuriBooksStrip
          invoiceId={invoice.id}
          number={invoice.number}
          state={booksState}
          ready={accounts.ok}
          reason={accounts.ok ? null : accounts.error}
        />
      )}

      {/* ⚠️ Which invoice a credit note answers. Without it a credit note can
          only reduce the customer's account as a whole, and "what is still owed
          on CZ-180" has no answer — see `CocozuriCreditApply`. */}
      {isCredit && (
        <CocozuriCreditApply
          creditNoteId={invoice.id}
          appliesTo={invoice.appliesToInvoiceId}
          invoices={siblings.filter((i) => i.docType === "invoice" && i.status === "issued").map((i) => ({ id: i.id, number: i.number }))}
        />
      )}

      {/* What is left on it. Derived from the receipts every time it is asked. */}
      {settled && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-border bg-bg-subtle px-3 py-2 text-sm print:hidden">
          <span className="text-fg-muted">Invoiced <span className="tabular text-fg">{money(bal.gross, invoice.currency)}</span></span>
          {bal.credited > 0 && <span className="text-fg-muted">Credited <span className="tabular text-fg">{money(bal.credited, invoice.currency)}</span></span>}
          <span className="text-fg-muted">Received <span className="tabular text-fg">{money(bal.paid, invoice.currency)}</span></span>
          <span className="grow" />
          <span className={Math.round(bal.balance) === 0 ? "text-success" : Math.round(bal.balance) < 0 ? "text-accent" : "font-medium text-fg"}>
            {Math.round(bal.balance) === 0
              ? "Settled in full"
              : Math.round(bal.balance) < 0
                ? `Overpaid by ${money(-bal.balance, invoice.currency)}`
                : `Still owed ${money(bal.balance, invoice.currency)}`}
          </span>
        </div>
      )}

      {showsDespatch && <CocozuriDespatch lines={despatch} choices={lotChoices} />}

      {invoice.status === "draft" && (
        <p className="rounded-lg border border-warn/30 bg-warn/10 px-3.5 py-2 text-sm text-warn print:hidden">
          This is a draft. Nothing is fixed until you issue it — and once issued it cannot be edited,
          only answered with a credit note.
        </p>
      )}
      {invoice.status === "cancelled" && (
        <p className="rounded-lg border border-border bg-bg-subtle px-3.5 py-2 text-sm text-fg-muted print:hidden">
          Cancelled. It was never issued, so nobody was ever asked to pay it.
        </p>
      )}

      {/* The paper. */}
      <article className="rounded-lg border border-border bg-bg-elev px-6 py-6 text-sm print:border-0 print:px-0">
        <p className="text-center text-xs leading-relaxed text-fg-muted">
          P.O.BOX 20865, DAR-ES-SALAAM, TANZANIA · TIN NO: 104 679 218 · VAT NO: 400117481
        </p>

        {isCredit && (
          <h1 className="mt-3 text-center text-lg font-semibold tracking-wide text-fg">CREDIT NOTE</h1>
        )}

        <div className="mt-5 flex flex-wrap justify-between gap-4">
          <div className="min-w-[16rem]">
            <p className="text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">Customer details:</p>
            {/* Frozen at the moment it was raised — see the note on the table. */}
            <p className="mt-1 font-semibold text-fg">
              {invoice.customerName}
              {invoice.branchName && <span className="text-fg-muted"> — {invoice.branchName}</span>}
            </p>
            {invoice.customerPoBox && <p className="text-fg-muted">P.O.BOX {invoice.customerPoBox}</p>}
            {invoice.customerCity && <p className="text-fg-muted">{invoice.customerCity}</p>}
            {invoice.customerTin && <p className="text-fg-muted">TIN: {invoice.customerTin}</p>}
            {invoice.customerVatNo && <p className="text-fg-muted">VAT: {invoice.customerVatNo}</p>}
          </div>
          <div className="text-right">
            <p className="font-semibold text-fg">
              {isCredit ? "CREDIT NOTE NO" : "INVOICE NO"}: {invoice.number}
            </p>
            <p className="text-fg-muted">
              DATE: {new Date(invoice.issueDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase()}
            </p>
            {!isCredit && (
              <p className="text-fg-muted">
                DUE: {due.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase()}
                {" "}({invoice.termsDays} days)
              </p>
            )}
            {invoice.reference && <p className="text-fg-muted">REF: {invoice.reference}</p>}
          </div>
        </div>

        <table className="mt-5 w-full border-collapse">
          <thead>
            <tr className="border-y border-border text-xs uppercase tracking-[0.06em] text-fg-subtle">
              <th className="py-1.5 pr-2 text-left font-medium">No</th>
              <th className="py-1.5 pr-2 text-left font-medium">Brand</th>
              <th className="py-1.5 pr-2 text-left font-medium">Item</th>
              <th className="py-1.5 pr-2 text-left font-medium">Packing</th>
              <th className="py-1.5 pr-2 text-right font-medium">Qty</th>
              <th className="py-1.5 pr-2 text-left font-medium">Unit</th>
              <th className="py-1.5 pr-2 text-right font-medium">TShs</th>
              <th className="py-1.5 text-right font-medium">
                Total {invoice.taxInclusive ? "(inc VAT)" : "(exc VAT)"}
              </th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((l) => (
              <tr key={l.id ?? l.lineNo} className="border-b border-border/60">
                <td className="py-1.5 pr-2 text-fg-subtle">{l.lineNo}</td>
                <td className="py-1.5 pr-2 text-fg-muted">{l.brand ?? ""}</td>
                {/* The words the invoice was PRINTED with, not the product's name today. */}
                <td className="py-1.5 pr-2 text-fg">{l.description}</td>
                <td className="py-1.5 pr-2 text-fg-muted">{packLabel(l)}</td>
                <td className="py-1.5 pr-2 text-right tabular">{l.qty}</td>
                <td className="py-1.5 pr-2 text-fg-muted">{l.uom ?? ""}</td>
                <td className="py-1.5 pr-2 text-right tabular">{money(l.unitPrice)}</td>
                <td className="py-1.5 text-right tabular">{money(lineAmount(l))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 flex justify-end">
          <div className="w-[16rem] space-y-1">
            <Row label="Before VAT" value={money(t.net, invoice.currency)} />
            <Row label={`VAT at ${invoice.vatRate}%`} value={money(t.vat, invoice.currency)} />
            <div className="flex items-center justify-between border-t border-border pt-1.5 text-base font-semibold text-fg">
              <span>Net final amount</span>
              <span className="tabular">{money(t.gross, invoice.currency)}</span>
            </div>
          </div>
        </div>

        {/* ⚠️ GENERATED, not typed. It is typed by hand on all 295 spreadsheet
            invoices, which is both a wasted minute and a place for the words to
            disagree with the figure above them. */}
        <p className="mt-4 border-t border-border pt-2.5">
          <span className="text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">In words: </span>
          <span className="font-medium text-fg">{amountInWords(t.gross)}</span>
          <span className="text-fg-muted"> {invoice.currency} ONLY</span>
        </p>

        {invoice.notes && <p className="mt-2 text-xs text-fg-muted">{invoice.notes}</p>}
      </article>

      {/* ⚠️ What happened to this invoice, and a place to say something about it.
          Print-hidden — working notes, not part of the document somebody is sent. */}
      <CocozuriTimeline
        subjectType="invoice" subjectId={invoice.id} subjectRef={invoice.number}
        events={events} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-fg-muted">
      <span>{label}</span>
      <span className="tabular">{value}</span>
    </div>
  );
}

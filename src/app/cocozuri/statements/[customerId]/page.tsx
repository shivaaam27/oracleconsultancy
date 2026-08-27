import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { CocozuriStatementControls } from "@/components/cocozuri-statement-controls";
import { statementFor } from "@/lib/cocozuri";
import { CZ_AGEING_BANDS, money } from "@/lib/cocozuri-shared";

export const dynamic = "force-dynamic";
export const metadata = { title: "Statement of account — CocoZuri" };

/**
 * One customer's statement of account, as it prints.
 *
 * This is the customer tab from `Invoice Master.xlsx` — header, then invoice
 * date / no / amount / running total / overdue by — except that nothing on it is
 * typed. Every line comes from an invoice, a credit note or a receipt, and the
 * running balance is worked out down the page.
 *
 * ⚠️ The period is in the address (`?from=` / `?to=`), so a statement can be
 * bookmarked and sent, the same way the ledger reports work. Anything before the
 * start of the period is rolled into an OPENING BALANCE rather than dropped —
 * that is the difference between a statement and a filtered list.
 */
export default async function CocozuriStatementPage({
  params, searchParams,
}: {
  params: Promise<{ customerId: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const [{ customerId }, sp] = await Promise.all([params, searchParams]);
  const id = Number(customerId);
  if (!Number.isFinite(id)) notFound();

  const from = sp.from ? new Date(`${sp.from}T00:00:00`).toISOString() : undefined;
  const to = sp.to ? new Date(`${sp.to}T23:59:59`).toISOString() : undefined;

  const s = await statementFor(id, { from, to });
  if (!s || !s.customer) notFound();
  const { customer, opening, rows, closing, outstanding, bands } = s;

  const today = new Date();
  const dmy = (d: string | Date) =>
    new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();

  return (
    /* ⚠️ Capped to the same measure as the invoice (`max-w-[58rem]`). A statement
       is a document somebody prints and posts, not a dashboard: left to fill a
       1440px screen its table ran to 1180px, which reads badly and prints worse.
       The two documents in this module now sit on the same paper. */
    <div className="mx-auto w-full max-w-[58rem] space-y-4">
      {/* Chrome. None of it prints. */}
      <div className="print:hidden">
        <PageHeader title="Statement of account" sub={customer.name} />
      </div>
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Link href="/cocozuri/statements"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2 text-sm text-fg-muted hover:text-fg">
          <ArrowLeft size={13} /> All statements
        </Link>
        <CocozuriStatementControls customerId={id} from={sp.from} to={sp.to} />
        <span className="grow" />
        <span className="text-xs text-fg-subtle">
          {rows.length} line{rows.length === 1 ? "" : "s"}
          {(from || to) && " in this period"}
        </span>
      </div>

      {/* The ageing, so "how late" is answered beside "how much". */}
      {outstanding.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 print:hidden">
          {CZ_AGEING_BANDS.map((b) => (
            <div key={b.key} className="rounded-lg border border-border bg-bg-elev px-3 py-2">
              <p className={`tabular text-lg font-semibold leading-none ${
                Math.round(bands[b.key]) === 0 ? "text-fg-subtle"
                  : b.key === "over90" ? "text-danger" : b.key === "d61_90" ? "text-warn" : "text-fg"}`}>
                {money(bands[b.key])}
              </p>
              <p className="mt-1 text-xs text-fg-muted">{b.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* The paper. */}
      <article className="rounded-lg border border-border bg-bg-elev px-6 py-6 text-sm print:border-0 print:px-0">
        <p className="text-center text-xs leading-relaxed text-fg-muted">
          P.O.BOX 20865, DAR-ES-SALAAM, TANZANIA · TIN NO: 104 679 218 · VAT NO: 400117481
        </p>
        <h1 className="mt-3 text-center text-lg font-semibold tracking-wide text-fg">STATEMENT OF ACCOUNT</h1>

        <div className="mt-5 flex flex-wrap justify-between gap-4">
          <div className="min-w-[16rem]">
            <p className="text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">Customer details:</p>
            <p className="mt-1 font-semibold text-fg">{customer.name}</p>
            {customer.poBox && <p className="text-fg-muted">P.O.BOX {customer.poBox}</p>}
            {customer.city && <p className="text-fg-muted">{customer.city}</p>}
            {customer.tin && <p className="text-fg-muted">TIN: {customer.tin}</p>}
            {customer.vatNo && <p className="text-fg-muted">VAT: {customer.vatNo}</p>}
          </div>
          <div className="text-right">
            <p className="text-fg-muted">AS AT: {dmy(today)}</p>
            {(from || to) && (
              <p className="text-fg-muted">
                PERIOD: {from ? dmy(from) : "the beginning"} – {to ? dmy(to) : dmy(today)}
              </p>
            )}
            <p className="text-fg-muted">TERMS: {customer.paymentTermsDays} DAYS</p>
          </div>
        </div>

        <table className="mt-5 w-full border-collapse">
          <thead>
            <tr className="border-y border-border text-xs uppercase tracking-[0.06em] text-fg-subtle">
              <th className="py-1.5 pr-2 text-left font-medium">Date</th>
              <th className="py-1.5 pr-2 text-left font-medium">Ref</th>
              <th className="py-1.5 pr-2 text-left font-medium">Detail</th>
              <th className="py-1.5 pr-2 text-right font-medium">Charged</th>
              <th className="py-1.5 pr-2 text-right font-medium">Paid / credited</th>
              <th className="py-1.5 text-right font-medium">Balance</th>
            </tr>
          </thead>
          <tbody>
            {/* ⚠️ Shown even when it is nothing, so the page adds up from a
                stated starting point rather than an assumed one. */}
            {(from || opening !== 0) && (
              <tr className="border-b border-border/60">
                <td className="py-1.5 pr-2 text-fg-subtle">{from ? dmy(from) : ""}</td>
                <td className="py-1.5 pr-2 text-fg-muted" colSpan={2}>Balance brought forward</td>
                <td className="py-1.5 pr-2" />
                <td className="py-1.5 pr-2" />
                <td className="py-1.5 text-right tabular text-fg">{money(opening, customer.currency)}</td>
              </tr>
            )}
            {rows.map((r, i) => (
              <tr key={`${r.kind}-${r.ref}-${i}`} className="border-b border-border/60">
                <td className="py-1.5 pr-2 text-fg-subtle">{dmy(r.date)}</td>
                <td className="py-1.5 pr-2 text-fg">
                  {r.kind === "invoice" || r.kind === "credit_note" ? (
                    <Link href={`/cocozuri/invoices/${encodeURIComponent(r.ref)}`} className="hover:text-accent print:no-underline">
                      {r.ref}
                    </Link>
                  ) : r.ref}
                </td>
                <td className="py-1.5 pr-2 text-fg-muted">
                  {r.kind === "receipt" ? "Payment received" : r.kind === "credit_note" ? "Credit note" : "Invoice"}
                  {r.detail && <span className="text-fg-subtle"> · {r.detail}</span>}
                </td>
                <td className="py-1.5 pr-2 text-right tabular text-fg-muted">{r.debit ? money(r.debit, customer.currency) : ""}</td>
                <td className="py-1.5 pr-2 text-right tabular text-fg-muted">{r.credit ? money(r.credit, customer.currency) : ""}</td>
                <td className="py-1.5 text-right tabular text-fg">{money(r.balance, customer.currency)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-sm text-fg-subtle">
                  Nothing on this account{(from || to) && " in this period"}. Only issued invoices appear here.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border text-base font-semibold text-fg">
              <td className="py-2 pr-2" colSpan={5}>BALANCE DUE</td>
              <td className="py-2 text-right tabular">{money(closing, customer.currency)}</td>
            </tr>
          </tfoot>
        </table>

        {/* The chase list, on the paper, because "you owe us X" invites the
            question "on what?" and the workbook's own statements answer it. */}
        {outstanding.length > 0 && (
          <div className="mt-6">
            <p className="text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">Outstanding invoices</p>
            <table className="mt-1.5 w-full border-collapse">
              <tbody>
                {outstanding.map((o) => (
                  <tr key={o.invoice.id} className="border-b border-border/60">
                    <td className="py-1.5 pr-2 text-fg">{o.invoice.number}</td>
                    <td className="py-1.5 pr-2 text-fg-subtle">{dmy(o.invoice.issueDate)}</td>
                    <td className="py-1.5 pr-2 text-fg-subtle">due {dmy(o.due)}</td>
                    <td className="py-1.5 pr-2 text-right text-fg-muted">
                      {o.days > 0 ? `${o.days} days overdue` : `${-o.days} days to go`}
                    </td>
                    <td className="py-1.5 text-right tabular text-fg">{money(o.balance, customer.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-6 text-xs leading-relaxed text-fg-subtle">
          Payment terms are {customer.paymentTermsDays} days from the date of invoice. Please quote the
          invoice number when paying. If any item on this statement is not recognised, tell us and we
          will look into it.
        </p>
      </article>
    </div>
  );
}

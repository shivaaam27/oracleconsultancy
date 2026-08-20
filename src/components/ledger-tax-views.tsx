// THE VAT RETURN AND THE WITHHOLDING SUMMARY, drawn (Phase 3).
//
// Display only — every figure arrives worked out by `ledger-tax-shared.ts`.
//
// Three things this screen must never do, and does not:
//   · treat zero-rated and exempt as the same thing;
//   · report a line it could not work out as nil;
//   · imply the figures are ready to file when a rate is still unconfirmed.

import { AlertTriangle, Percent } from "lucide-react";
import { ledgerAmount } from "@/lib/ledger-shared";
import { TREATMENT_LABELS, type VatReturn, type WhtSummary } from "@/lib/ledger-tax-shared";
import { ReportCard } from "@/components/ledger-report-views";
import { cn } from "@/lib/cn";

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={cn("px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-fg-subtle", className)}>
      {children}
    </th>
  );
}
function Td({ children, className, colSpan }: { children?: React.ReactNode; className?: string; colSpan?: number }) {
  return <td colSpan={colSpan} className={cn("px-3 py-1.5 align-middle", className)}>{children}</td>;
}
function Money({ v, className, zero }: { v: number | null | undefined; className?: string; zero?: boolean }) {
  const s = ledgerAmount(v) || (zero ? "0.00" : "");
  return <td className={cn("px-3 py-1.5 text-right tabular", (v ?? 0) < 0 && "text-danger", className)}>{s}</td>;
}

/** Shown on both screens: the rates nobody has checked yet. */
function Unconfirmed({ names }: { names: string[] }) {
  if (names.length === 0) return null;
  return (
    <div className="border-b border-border bg-warn-soft px-3 py-2 text-[12px] text-warn">
      <strong className="flex items-center gap-1.5">
        <AlertTriangle className="h-3.5 w-3.5" />
        Not ready to file — {names.length} rate{names.length === 1 ? "" : "s"} in this period {names.length === 1 ? "has" : "have"} not been confirmed
      </strong>
      <span className="mt-0.5 block">
        {names.join(" · ")} — check {names.length === 1 ? "it" : "them"}{" "}
        with whoever files your returns, then tick &ldquo;confirmed&rdquo; on the Tax rates tab.
      </span>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════ the VAT return ══ */

export function VatReturnView({
  vat, from, to, companyId,
}: {
  vat: VatReturn;
  from?: string | null;
  to?: string | null;
  companyId: number;
}) {
  const payable = vat.netPayable >= 0;

  return (
    <div className="space-y-3">
      <ReportCard
        title="VAT return"
        meta={from || to ? `${from || "the beginning"} to ${to || "today"}` : "everything, since the books opened"}
      >
        <Unconfirmed names={vat.unconfirmedRates} />

        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-[13px]">
            <thead>
              <tr data-list-head className="border-b border-border text-left">
                <Th className="w-[52%]">Box</Th>
                <Th className="text-right">Net</Th>
                <Th className="text-right">VAT</Th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border bg-bg-muted/60">
                <Td className="text-[11px] font-medium uppercase tracking-[0.06em] text-fg-muted">
                  What we charged
                </Td><Td /><Td />
              </tr>
              <Row label="Standard-rated sales" box={vat.outputStandard} />
              {/* ⚠️ Zero-rated and exempt are separate rows because they are
                  separate things — zero-rated is taxable and counts in turnover. */}
              <Row label="Zero-rated sales" box={vat.outputZeroRated} hint="taxable at 0% — counts in turnover" />
              <Row label="Exempt sales" box={vat.outputExempt} hint="outside VAT — NOT in turnover" />
              <tr className="border-b border-border font-medium">
                <Td>Output VAT</Td>
                <Money v={vat.taxableTurnover} />
                <Money v={vat.totalOutputTax} zero />
              </tr>

              <tr className="border-b border-border bg-bg-muted/60">
                <Td className="text-[11px] font-medium uppercase tracking-[0.06em] text-fg-muted">
                  What we paid
                </Td><Td /><Td />
              </tr>
              <Row label="Standard-rated purchases and imports" box={vat.inputStandard} />
              {vat.inputZeroRated.count > 0 && <Row label="Zero-rated purchases" box={vat.inputZeroRated} />}
              {vat.inputExempt.count > 0 && <Row label="Exempt purchases" box={vat.inputExempt} />}
              <tr className="border-b border-border font-medium">
                <Td>Input VAT</Td>
                <Money v={vat.inputStandard.net + vat.inputZeroRated.net + vat.inputExempt.net} />
                <Money v={vat.totalInputTax} zero />
              </tr>
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-bg-muted/50 text-[14px] font-semibold">
                <Td>{payable ? "Payable to TRA" : "Repayable by TRA"}</Td>
                <Td />
                <Money v={Math.abs(vat.netPayable)} zero />
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="space-y-1 border-t border-border px-3 py-2 text-[12px] text-fg-subtle">
          <p>
            Output VAT less input VAT. Taxable turnover is standard-rated plus zero-rated sales; exempt sales
            are deliberately outside it.
          </p>
          <p>
            ⚠️ Import VAT is counted from what customs assessed on each bill of lading. The customs value
            itself is not recorded anywhere in the system, so the <b>tax</b> is exact and the <b>net</b>
            {" "}understates by those values.
          </p>
          <p>
            ⚠️ These figures come from the invoices, purchases and imports as typed — not from the ledger.
            Once the documents post themselves into the books, this report should read the VAT accounts
            instead, and the two be checked against each other.
          </p>
        </div>
      </ReportCard>

      {/* ⚠️ Never folded into the totals as nil. */}
      {vat.unknown.length > 0 && (
        <ReportCard
          title={`${vat.unknown.length} not counted`}
          meta={<span className="text-warn">these need a rate before the return is right</span>}
        >
          <p className="border-b border-border px-3 py-2 text-[12px] text-fg-muted">
            Each of these is a document with no tax rate set, or a foreign one with no exchange rate — so its
            VAT is <b>unknown</b>, not nil. They are left out of every figure above rather than quietly
            counted as zero.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-[13px]">
              <thead>
                <tr data-list-head className="border-b border-border text-left">
                  <Th className="w-28">Date</Th>
                  <Th>Document</Th>
                  <Th className="w-40">Who</Th>
                  <Th className="w-24">Side</Th>
                </tr>
              </thead>
              <tbody>
                {vat.unknown.map((l, i) => (
                  <tr key={i} data-list-row className="border-b border-border/60 last:border-0">
                    <Td className="tabular">{l.date?.slice(0, 10) ?? "—"}</Td>
                    <Td className="truncate">{l.source}</Td>
                    <Td className="truncate text-fg-muted">{l.party ?? "—"}</Td>
                    <Td className="text-fg-muted">{l.side === "output" ? "Sale" : "Purchase"}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ReportCard>
      )}

      {vat.lines.length === 0 && (
        <p className="text-[13px] text-fg-muted">
          Nothing taxable in this period yet. VAT is recorded on an invoice on the Delivery &amp; billing tab
          of Orders &amp; Imports, and on a purchase on the order line.
        </p>
      )}
    </div>
  );
}

function Row({
  label, box, hint,
}: {
  label: string;
  box: { net: number; tax: number; count: number };
  hint?: string;
}) {
  return (
    <tr data-list-row className="border-b border-border/60">
      <Td>
        {label}
        {hint && <> <span className="text-[11px] text-fg-subtle">{hint}</span></>}
        {box.count > 0 && <> <span className="text-[11px] text-fg-subtle">({box.count})</span></>}
      </Td>
      <Money v={box.net} />
      <Money v={box.tax} />
    </tr>
  );
}

/* ═══════════════════════════════════════════════════════════ withholding ═══ */

export function WithholdingView({
  wht, from, to,
}: {
  wht: WhtSummary;
  from?: string | null;
  to?: string | null;
}) {
  return (
    <div className="space-y-3">
      <ReportCard
        title="Withholding tax"
        meta={from || to ? `${from || "the beginning"} to ${to || "today"}` : "everything, since the books opened"}
      >
        <Unconfirmed names={wht.unconfirmedRates} />

        {wht.byParty.length === 0 && wht.unknown.length === 0 ? (
          <div className="px-3 py-8 text-center text-[13px] text-fg-muted">
            Nothing was withheld in this period. Withholding is recorded on a payment, on the Payments tab of
            Orders &amp; Imports.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-[13px]">
              <thead>
                <tr data-list-head className="border-b border-border text-left">
                  <Th className="w-[48%]">Kept back from</Th>
                  <Th className="w-16 text-right">Payments</Th>
                  <Th className="text-right">Base</Th>
                  <Th className="text-right">Withheld</Th>
                </tr>
              </thead>
              <tbody>
                {wht.byParty.map((p) => (
                  <tr key={p.party} data-list-row className="border-b border-border/60 last:border-0">
                    <Td className="truncate">{p.party}</Td>
                    <Td className="tabular text-right text-fg-muted">{p.count}</Td>
                    <Money v={p.base} />
                    <Money v={p.tax} />
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-bg-muted/50 font-medium">
                  <Td>Owed to TRA</Td>
                  <Td className="tabular text-right">{wht.count}</Td>
                  <Money v={wht.base} />
                  <Money v={wht.total} zero />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <p className="border-t border-border px-3 py-2 text-[12px] text-fg-subtle">
          Worked out on what each supplier invoiced, not on what left the bank — those differ by the tax
          itself. A payment with no base recorded is reported below rather than guessed at.
        </p>
      </ReportCard>

      {wht.unknown.length > 0 && (
        <ReportCard
          title={`${wht.unknown.length} not counted`}
          meta={<span className="text-warn">no amount recorded to work the tax out on</span>}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-[13px]">
              <thead>
                <tr data-list-head className="border-b border-border text-left">
                  <Th className="w-28">Date</Th>
                  <Th>Payment</Th>
                  <Th className="w-40">Supplier</Th>
                </tr>
              </thead>
              <tbody>
                {wht.unknown.map((l, i) => (
                  <tr key={i} data-list-row className="border-b border-border/60 last:border-0">
                    <Td className="tabular">{l.date?.slice(0, 10) ?? "—"}</Td>
                    <Td className="truncate">{l.source}</Td>
                    <Td className="truncate text-fg-muted">{l.party ?? "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ReportCard>
      )}
    </div>
  );
}

/** A tiny legend used on the tax rates screen and the return. */
export function TreatmentLegend() {
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-fg-subtle">
      <Percent className="h-3 w-3" />
      {Object.entries(TREATMENT_LABELS).map(([k, v]) => (
        <span key={k}>{v}</span>
      ))}
    </p>
  );
}

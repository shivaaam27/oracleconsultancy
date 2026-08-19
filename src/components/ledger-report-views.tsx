// THE FIVE REPORTS, drawn (Phase 2).
//
// Display only — every figure arrives already worked out by
// `ledger-reports-shared.ts`. ⚠️ If you need a number that is not here, add it
// THERE with a test, not with arithmetic in the JSX.
//
// Desk throughout: hairlines, `data-list-head`/`data-list-row`, tabular figures,
// no pills, one blue. Two habits specific to accounts:
//
//   · **A nil cell is blank, not "0.00".** An accountant's eye needs the empty
//     side of the column to read a set of books at a glance.
//   · **Every number is a door.** An account row links to its own entries, so
//     "why is rent 4.2m?" is one click rather than a search.
//
// ⚠️ These are plain components, not `"use client"` — they render on the server
// inside the report page. Only the controls strip needs to be a client
// component.

import Link from "next/link";
import { ledgerAmount, num, type GlAccount } from "@/lib/ledger-shared";
import type {
  BalanceSheet, LedgerBlock, PartyStatement, ProfitAndLoss, StatementRow,
  TrialBalanceReport, TrialRow,
} from "@/lib/ledger-reports-shared";
import { cn } from "@/lib/cn";

/* ─────────────────────────────────────────────────────────── shared bits ── */

export function ReportCard({ title, meta, children }: { title: string; meta?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-bg-elev print:border-0">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-3 py-2">
        <h2 className="text-[13px] font-medium">{title}</h2>
        {meta && <span className="text-[12px] text-fg-muted">{meta}</span>}
      </header>
      {children}
    </section>
  );
}

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

/**
 * A figure. ⚠️ Blank when nil — see the note at the top.
 *
 * ⚠️ EXCEPT in a balance column, where `zero` makes it print "0.00". Blank in a
 * debit or credit column means "nothing on this side" and is right; blank where
 * a BALANCE belongs reads as missing data rather than as "nothing owed", which
 * is the opposite of what the row is saying.
 */
function Money({ v, className, zero }: { v: number | null | undefined; className?: string; zero?: boolean }) {
  const s = ledgerAmount(v) || (zero ? "0.00" : "");
  return (
    <td className={cn("px-3 py-1.5 text-right tabular", (v ?? 0) < 0 && "text-danger", className)}>{s}</td>
  );
}

/** An account's name, indented to its place in the tree, linking to its entries. */
function AccountCell({
  account, depth, companyId, group, from, to,
}: {
  account: GlAccount;
  depth: number;
  companyId: number;
  group: boolean;
  from?: string | null;
  to?: string | null;
}) {
  const label = (
    <>
      <span className="tabular text-fg-subtle">{account.number}</span>{" "}
      <span className={cn(account.isGroup && "font-medium")}>{account.name}</span>
    </>
  );
  // ⚠️ No link in the group view: a consolidated row is several companies'
  // accounts at once, so there is no single account to open. Better a plain
  // label than a link that quietly shows one company's share.
  const inner = group || account.isGroup ? label : (
    <Link
      href={`/ledger/entries?co=${companyId}&account=${account.id}${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}`}
      className="hover:text-accent hover:underline"
    >
      {label}
    </Link>
  );
  return <Td><span style={{ paddingLeft: depth * 14 }} className="block">{inner}</span></Td>;
}

function Nothing({ what }: { what: string }) {
  return (
    <div className="px-3 py-8 text-center text-[13px] text-fg-muted">
      Nothing to show — {what}
    </div>
  );
}

/* ══════════════════════════════════════════════════════ 1 · trial balance ══ */

export function TrialBalanceView({
  report, companyId, group, from, to,
}: {
  report: TrialBalanceReport;
  companyId: number;
  group: boolean;
  from?: string | null;
  to?: string | null;
}) {
  if (report.rows.length === 0) return <ReportCard title="Trial balance"><Nothing what="nothing has been posted." /></ReportCard>;

  return (
    <ReportCard
      title="Trial balance"
      meta={
        report.balanced
          ? <span className="text-success">Debits and credits agree</span>
          : <span className="text-danger">⚠️ Out by {ledgerAmount(Math.abs(report.difference))}</span>
      }
    >
      {/* ⚠️ An unbalanced trial balance is an ALARM about the BOOKS, not about
          this screen. Every voucher is checked before it is written, so it
          should be unreachable. */}
      {!report.balanced && (
        <p className="border-b border-border bg-danger-soft px-3 py-2 text-[12px] text-danger">
          The books do not balance. Every voucher is checked before it is written, so this means something
          reached the ledger another way. Stop and find it before relying on any figure here.
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-[13px]">
          <thead>
            <tr data-list-head className="border-b border-border text-left">
              <Th className="w-[38%]">Account</Th>
              <Th className="text-right">Opening</Th>
              <Th className="text-right">Debit</Th>
              <Th className="text-right">Credit</Th>
              <Th className="text-right">Closing Dr</Th>
              <Th className="text-right">Closing Cr</Th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((r: TrialRow) => (
              <tr key={r.account.id} data-list-row className={cn("border-b border-border/60 last:border-0", r.account.isGroup && "bg-bg-muted/40")}>
                <AccountCell account={r.account} depth={r.depth} companyId={companyId} group={group} from={from} to={to} />
                <Money v={r.opening} className="text-fg-muted" />
                <Money v={r.debit} />
                <Money v={r.credit} />
                <Money v={r.closingDebit} />
                <Money v={r.closingCredit} />
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-bg-muted/50 font-medium">
              <Td>Total</Td>
              <Td />
              <Money v={report.totalDebit} />
              <Money v={report.totalCredit} />
              <Money v={report.totalClosingDebit} />
              <Money v={report.totalClosingCredit} />
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="border-t border-border px-3 py-1.5 text-[12px] text-fg-subtle">
        Headings show their whole branch and are left out of the total, so nothing is counted twice.
      </p>
    </ReportCard>
  );
}

/* ═══════════════════════════════════════════════════ 2 · profit and loss ══ */

export function ProfitAndLossView({
  pl, companyId, group, from, to,
}: {
  pl: ProfitAndLoss;
  companyId: number;
  group: boolean;
  from?: string | null;
  to?: string | null;
}) {
  const section = (title: string, rows: StatementRow[], total: number) => (
    <>
      <tr className="border-b border-border bg-bg-muted/60">
        <Td className="text-[11px] font-medium uppercase tracking-[0.06em] text-fg-muted">{title}</Td>
        <Td />
      </tr>
      {rows.length === 0 && (
        <tr className="border-b border-border/60"><Td className="text-fg-subtle" colSpan={2}>Nothing in this period</Td></tr>
      )}
      {rows.map((r) => (
        <tr key={r.account.id} data-list-row className={cn("border-b border-border/60", r.isGroup && "bg-bg-muted/30")}>
          <AccountCell account={r.account} depth={r.depth} companyId={companyId} group={group} from={from} to={to} />
          <Money v={r.amount} />
        </tr>
      ))}
      <tr className="border-b border-border font-medium">
        <Td>Total {title.toLowerCase()}</Td>
        <Money v={total} />
      </tr>
    </>
  );

  return (
    <ReportCard
      title="Profit and loss"
      meta={from || to ? `${from || "the beginning"} to ${to || "today"}` : "everything, since the books opened"}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-[13px]">
          <thead>
            <tr data-list-head className="border-b border-border text-left">
              <Th className="w-[70%]">Account</Th>
              <Th className="text-right">Amount</Th>
            </tr>
          </thead>
          <tbody>
            {section("Income", pl.income, pl.totalIncome)}
            {section("Expenses", pl.expenses, pl.totalExpenses)}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-bg-muted/50 text-[14px] font-semibold">
              <Td>{pl.netProfit >= 0 ? "Profit for the period" : "Loss for the period"}</Td>
              <Money v={pl.netProfit} zero />
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="border-t border-border px-3 py-1.5 text-[12px] text-fg-subtle">
        Only what happened inside the period — a profit and loss never carries an opening balance, or it
        would report every year&rsquo;s trading every year.
      </p>
    </ReportCard>
  );
}

/* ═══════════════════════════════════════════════════════ 3 · balance sheet ══ */

export function BalanceSheetView({
  bs, companyId, group, asAt,
}: {
  bs: BalanceSheet;
  companyId: number;
  group: boolean;
  asAt: string;
}) {
  const section = (title: string, rows: StatementRow[], total: number, extra?: React.ReactNode) => (
    <>
      <tr className="border-b border-border bg-bg-muted/60">
        <Td className="text-[11px] font-medium uppercase tracking-[0.06em] text-fg-muted">{title}</Td>
        <Td />
      </tr>
      {rows.length === 0 && (
        <tr className="border-b border-border/60"><Td className="text-fg-subtle" colSpan={2}>Nothing here</Td></tr>
      )}
      {rows.map((r) => (
        <tr key={r.account.id} data-list-row className={cn("border-b border-border/60", r.isGroup && "bg-bg-muted/30")}>
          <AccountCell account={r.account} depth={r.depth} companyId={companyId} group={group} to={asAt} />
          <Money v={r.amount} />
        </tr>
      ))}
      {extra}
      <tr className="border-b border-border font-medium">
        <Td>Total {title.toLowerCase()}</Td>
        <Money v={total} />
      </tr>
    </>
  );

  return (
    <ReportCard
      title="Balance sheet"
      meta={
        <span className={bs.balanced ? "text-success" : "text-danger"}>
          {bs.balanced ? "Balances" : `⚠️ Out by ${ledgerAmount(Math.abs(bs.difference))}`} · as at {asAt}
        </span>
      }
    >
      {!bs.balanced && (
        <p className="border-b border-border bg-danger-soft px-3 py-2 text-[12px] text-danger">
          Assets do not equal liabilities plus equity. Since this figure is worked out from the entries every
          time, the fault is in the books rather than in the report.
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-[13px]">
          <thead>
            <tr data-list-head className="border-b border-border text-left">
              <Th className="w-[70%]">Account</Th>
              <Th className="text-right">Amount</Th>
            </tr>
          </thead>
          <tbody>
            {section("Assets", bs.assets, bs.totalAssets)}
            {section("Liabilities", bs.liabilities, bs.totalLiabilities)}
            {section("Equity", bs.equity, bs.totalEquity, (
              <>
                {/* ⚠️ THE TWO ROWS THAT MAKE IT BALANCE, and neither is posted.
                    The profit sitting in the income and expense accounts has
                    not reached equity yet, so the sheet adds it here. */}
                {Math.abs(bs.earlierYearsEarnings) > 0.005 && (
                  <tr data-list-row className="border-b border-border/60">
                    <Td>
                      <span className="italic">Retained from earlier years</span>{" "}
                      <span className="text-[11px] text-fg-subtle">worked out, not posted</span>
                    </Td>
                    <Money v={bs.earlierYearsEarnings} />
                  </tr>
                )}
                <tr data-list-row className="border-b border-border/60">
                  <Td>
                    <span className="italic">Profit this financial year</span>{" "}
                    <span className="text-[11px] text-fg-subtle">
                      since {bs.fyStartedOn} · worked out, not posted
                    </span>
                  </Td>
                  <Money v={bs.currentYearEarnings} />
                </tr>
              </>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-bg-muted/50 text-[14px] font-semibold">
              <Td>Liabilities and equity</Td>
              <Money v={bs.totalLiabilities + bs.totalEquity} zero />
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="border-t border-border px-3 py-1.5 text-[12px] text-fg-subtle">
        The year&rsquo;s profit is worked out from the income and expense accounts and added into equity here —
        no journal creates it. That is what makes the two sides agree before anybody has run a year-end.
        The financial year is taken to start in {monthName(bs.fyStartedOn)}; change it in Settings if that is wrong.
      </p>
    </ReportCard>
  );
}

function monthName(iso: string): string {
  const m = Number(iso.slice(5, 7));
  return ["January", "February", "March", "April", "May", "June", "July",
    "August", "September", "October", "November", "December"][Math.max(0, m - 1)];
}

/* ═══════════════════════════════════════════════════════ 4 · general ledger ══ */

export function GeneralLedgerView({ blocks, group }: { blocks: LedgerBlock[]; group: boolean }) {
  if (blocks.length === 0) {
    return <ReportCard title="General ledger"><Nothing what="no account has an entry in this period." /></ReportCard>;
  }

  return (
    <div className="space-y-3">
      {blocks.map((b) => (
        <ReportCard
          key={b.account.id}
          title={`${b.account.number} · ${b.account.name}`}
          meta={<>Closing <b className={cn("tabular", b.closing < 0 && "text-danger")}>{ledgerAmount(b.closing) || "0.00"}</b></>}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-[13px]">
              <thead>
                <tr data-list-head className="border-b border-border text-left">
                  <Th className="w-28">Date</Th>
                  <Th className="w-40">Document</Th>
                  <Th>Against / note</Th>
                  <Th className="w-32 text-right">Debit</Th>
                  <Th className="w-32 text-right">Credit</Th>
                  <Th className="w-36 text-right">Balance</Th>
                </tr>
              </thead>
              <tbody>
                {/* ⚠️ The opening balance is a ROW, not a footnote. Without it a
                    mid-year running column starts from zero and every figure in
                    it is wrong in a way that reads as plausible. */}
                <tr className="border-b border-border bg-bg-muted/40">
                  <Td className="text-fg-muted" colSpan={5}>Opening balance</Td>
                  <Money v={b.opening} className="font-medium" zero />
                </tr>
                {b.rows.map((e) => (
                  <tr key={e.id} data-list-row className={cn("border-b border-border/60", e.isReversal && "text-fg-muted")}>
                    <Td className="tabular">{e.postingDate?.slice(0, 10)}</Td>
                    <Td>
                      <span className="block truncate">{e.voucherNo ?? e.voucherType}</span>
                      <span className="text-[11px] text-fg-subtle">{e.voucherType}{e.isReversal ? " · reversal" : ""}</span>
                    </Td>
                    <Td>
                      <span className="block truncate">{e.party ?? <span className="text-fg-subtle">—</span>}</span>
                      {e.remarks && <span className="block truncate text-[11px] text-fg-subtle">{e.remarks}</span>}
                    </Td>
                    <Money v={num(e.debit)} />
                    <Money v={num(e.credit)} />
                    <Money v={e.balance} zero />
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-bg-muted/50 font-medium">
                  <Td colSpan={3}>
                    {b.rows.length} entr{b.rows.length === 1 ? "y" : "ies"} in the period
                  </Td>
                  <Money v={b.debit} />
                  <Money v={b.credit} />
                  <Money v={b.closing} zero />
                </tr>
              </tfoot>
            </table>
          </div>
        </ReportCard>
      ))}
      {group && (
        <p className="text-[12px] text-fg-subtle">
          Each entry is prefixed with the company that produced it, so a group figure can still be traced home.
        </p>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════ 5 · customer/supplier statements ══ */

export function StatementsView({ statements }: { statements: PartyStatement[] }) {
  if (statements.length === 0) {
    return (
      <ReportCard title="Statements">
        <Nothing what="no entry names a customer or supplier yet. A party is typed on a journal line, and will be filled in automatically once invoices and payments start posting." />
      </ReportCard>
    );
  }

  return (
    <div className="space-y-3">
      {statements.map((s) => (
        <ReportCard
          key={s.party}
          title={s.party}
          meta={
            <>
              {s.partyType && <span className="text-fg-subtle">{s.partyType} · </span>}
              Balance <b className={cn("tabular", s.closing < 0 && "text-danger")}>{ledgerAmount(s.closing) || "0.00"}</b>
            </>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-[13px]">
              <thead>
                <tr data-list-head className="border-b border-border text-left">
                  <Th className="w-28">Date</Th>
                  <Th className="w-40">Document</Th>
                  <Th>Note</Th>
                  <Th className="w-32 text-right">Debit</Th>
                  <Th className="w-32 text-right">Credit</Th>
                  <Th className="w-36 text-right">Balance</Th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border bg-bg-muted/40">
                  <Td className="text-fg-muted" colSpan={5}>Brought forward</Td>
                  <Money v={s.opening} className="font-medium" zero />
                </tr>
                {s.rows.map((e) => (
                  <tr key={e.id} data-list-row className={cn("border-b border-border/60", e.isReversal && "text-fg-muted")}>
                    <Td className="tabular">{e.postingDate?.slice(0, 10)}</Td>
                    <Td className="truncate">{e.voucherNo ?? e.voucherType}</Td>
                    <Td className="truncate">{e.remarks ?? <span className="text-fg-subtle">—</span>}</Td>
                    <Money v={num(e.debit)} />
                    <Money v={num(e.credit)} />
                    <Money v={e.balance} zero />
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-bg-muted/50 font-medium">
                  <Td colSpan={3}>Carried forward</Td>
                  <Money v={s.debit} />
                  <Money v={s.credit} />
                  <Money v={s.closing} zero />
                </tr>
              </tfoot>
            </table>
          </div>
        </ReportCard>
      ))}
      <p className="text-[12px] text-fg-subtle">
        Grouped by the name typed on the entry. ⚠️ &ldquo;Barrick&rdquo; and &ldquo;Barrick Ltd&rdquo; are two parties here — real
        customer and supplier records come in a later phase, and until then nothing is merged for you, because
        a statement that quietly joined two names would be worse than one showing both.
      </p>
    </div>
  );
}

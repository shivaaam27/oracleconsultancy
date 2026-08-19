// THE FINANCIAL REPORTS (Phase 2).
//
// ⚠️ ONE page for all five, rather than five near-identical ones. They share the
// same books, the same period, the same controls and the same shell — the only
// thing that differs is which pure function reads the entries. Five copies of
// this file would drift apart within a month.
//
// ⚠️ The report is chosen by the URL (`/ledger/reports/trial-balance`) and the
// period and scope by the query string, so every report is a LINK — bookmark it,
// send it to an accountant, and it opens the same figures.

import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { LedgerTabs } from "@/components/ledger-tabs";
import { LedgerReportControls } from "@/components/ledger-report-controls";
import {
  BalanceSheetView, GeneralLedgerView, ProfitAndLossView, StatementsView, TrialBalanceView,
} from "@/components/ledger-report-views";
import { pickLedgerCompany } from "@/lib/ledger-company";
import { loadBooks, loadGroupBooks } from "@/lib/ledger-reports";
import { getAppSettings } from "@/lib/settings";
import {
  REPORTS, balanceSheet, generalLedger, partyStatements, profitAndLoss, trialBalanceReport,
  type ReportKey,
} from "@/lib/ledger-reports-shared";

export const dynamic = "force-dynamic";

function isReport(v: string): v is ReportKey {
  return REPORTS.some((r) => r.key === v);
}

export default async function LedgerReportPage({
  params, searchParams,
}: {
  params: Promise<{ report: string }>;
  searchParams: Promise<{ co?: string; from?: string; to?: string; empty?: string; group?: string; party?: string; account?: string }>;
}) {
  const { report } = await params;
  if (!isReport(report)) notFound();

  const sp = await searchParams;
  const { companies, chosen } = await pickLedgerCompany(sp.co);

  if (!chosen) {
    return (
      <div className="space-y-3">
        <PageHeader title="Ledger" sub="No companies yet" />
        <p className="text-[13px] text-fg-muted">Add a company first, on the Companies screen.</p>
      </div>
    );
  }

  const group = sp.group === "1";
  const hideEmpty = sp.empty !== "1";
  const from = sp.from || null;
  const to = sp.to || null;
  // A balance sheet is a snapshot, so "to" is its as-at date. Default to today
  // in Dar es Salaam — where the person reading it actually is.
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Dar_es_Salaam" });
  const asAt = to ?? today;

  const [books, settings] = await Promise.all([
    group ? loadGroupBooks({ to: asAt }) : loadBooks(chosen.id, { to: asAt }),
    getAppSettings(),
  ]);
  const { accounts, entries } = books;

  const scope = group ? `All ${companies.length} companies` : chosen.name;
  const label = REPORTS.find((r) => r.key === report)!;

  return (
    <div className="space-y-3">
      <PageHeader
        title={`Ledger · ${label.label}`}
        sub={`${scope} · ${label.hint.toLowerCase()}`}
      />
      <div className="print:hidden">
        <LedgerTabs active="reports" company={chosen.id} companies={companies} />
      </div>

      <LedgerReportControls
        active={report}
        companyName={scope}
        group={group}
        asAtOnly={report === "balance-sheet"}
      />

      {/* Only on paper: a report printed without saying whose books, over what
          period and when it was run is not much use to an accountant. */}
      <div className="hidden print:block">
        <h1 className="text-base font-semibold">{scope} — {label.label}</h1>
        <p className="text-[12px]">
          {report === "balance-sheet"
            ? `As at ${asAt}`
            : `${from ?? "the beginning"} to ${to ?? today}`} · printed {today}
        </p>
      </div>

      {report === "trial-balance" && (
        <TrialBalanceView
          report={trialBalanceReport(accounts, entries, { from, to: asAt }, { hideEmpty })}
          companyId={chosen.id} group={group} from={from} to={to}
        />
      )}

      {report === "profit-and-loss" && (
        <ProfitAndLossView
          pl={profitAndLoss(accounts, entries, { from, to: asAt }, { hideEmpty })}
          companyId={chosen.id} group={group} from={from} to={to}
        />
      )}

      {report === "balance-sheet" && (
        <BalanceSheetView
          bs={balanceSheet(accounts, entries, {
            asAt,
            // ⚠️ Without the right financial-year start the balance sheet is
            // wrong by however much was earned in the mis-attributed months.
            fyStartMonth: settings.ledgerFyStartMonth,
            hideEmpty,
          })}
          companyId={chosen.id} group={group} asAt={asAt}
        />
      )}

      {report === "general-ledger" && (
        <GeneralLedgerView
          blocks={generalLedger(accounts, entries, { from, to: asAt }, {
            accountIds: sp.account ? [Number(sp.account)] : undefined,
            hideEmpty,
          })}
          group={group}
        />
      )}

      {report === "statements" && (
        <StatementsView
          statements={partyStatements(accounts, entries, { from, to: asAt }, { party: sp.party || null })}
        />
      )}
    </div>
  );
}

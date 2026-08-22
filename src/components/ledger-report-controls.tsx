"use client";

// THE REPORT CONTROLS — which report, what period, whose books (Phase 2).
//
// ⚠️ Every control writes to the URL through `useUrlFilters`, not to component
// state (the forward rule in CLAUDE.md). Which means a report is a LINK: the
// owner can bookmark "PES, this year, hiding the empty accounts", send it to an
// accountant, and it opens exactly the same figures. A report held in component
// state can be shared only as a screenshot.
//
// ⚠️ Imports `ledger-reports-shared`, never `ledger-reports` — the latter pulls
// `@/db/supabase` into the browser bundle and kills the page.

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Building2, Printer } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useUrlFilters } from "@/lib/use-url-filters";
import { REPORTS, type ReportKey } from "@/lib/ledger-reports-shared";

export function LedgerReportControls({
  active, companyName, group, asAtOnly,
}: {
  active: ReportKey;
  companyName: string;
  group: boolean;
  /** The balance sheet has ONE date, not a period — it is a snapshot. */
  asAtOnly?: boolean;
}) {
  const params = useSearchParams();
  const { values, set, reset, dirty } = useUrlFilters({ from: "", to: "", empty: "", group: "" });

  const href = (report: ReportKey) => {
    const p = new URLSearchParams(params.toString());
    return `/ledger/reports/${report}?${p.toString()}`;
  };

  const thisYear = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Dar_es_Salaam" }).slice(0, 4);
  const quick = [
    { label: "This year", from: `${thisYear}-01-01`, to: `${thisYear}-12-31` },
    { label: "Last year", from: `${Number(thisYear) - 1}-01-01`, to: `${Number(thisYear) - 1}-12-31` },
    { label: "Everything", from: "", to: "" },
  ];

  return (
    <div className="space-y-2 print:hidden">
      {/* which report */}
      <nav className="flex flex-wrap items-center gap-1" aria-label="Reports">
        {REPORTS.map((r) => (
          <Link
            key={r.key}
            href={href(r.key)}
            aria-current={active === r.key ? "page" : undefined}
            title={r.hint}
            className={cn(
              "rounded-md border px-2.5 py-1 text-sm transition-colors",
              active === r.key
                ? "border-accent bg-accent-soft font-medium text-fg"
                : "border-border text-fg-muted hover:text-fg",
            )}
          >
            {r.label}
          </Link>
        ))}
      </nav>

      {/* period, scope, and what to leave out */}
      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-bg-elev p-2.5">
        {!asAtOnly && (
          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-[0.06em] text-fg-subtle">From</span>
            <Input type="date" value={values.from} onChange={(e) => set({ from: e.target.value })} className="h-8" />
          </label>
        )}
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-[0.06em] text-fg-subtle">
            {asAtOnly ? "As at" : "To"}
          </span>
          <Input type="date" value={values.to} onChange={(e) => set({ to: e.target.value })} className="h-8" />
        </label>

        {!asAtOnly && (
          <span className="mb-0.5 flex items-center gap-1">
            {quick.map((q) => (
              <button
                key={q.label}
                type="button"
                onClick={() => set({ from: q.from, to: q.to })}
                className="rounded-md border border-border px-2 py-1 text-sm text-fg-muted hover:text-fg"
              >
                {q.label}
              </button>
            ))}
          </span>
        )}

        <label className="mb-1 flex cursor-pointer items-center gap-1.5 text-sm text-fg-muted">
          <input
            type="checkbox"
            checked={values.empty === "1"}
            onChange={(e) => set({ empty: e.target.checked ? "1" : "" })}
            className="h-3.5 w-3.5 accent-[var(--accent)]"
          />
          Show accounts with nothing in them
        </label>

        {/* ⚠️ The group view is what the owner cannot get anywhere today: all
            thirteen companies added up. It is the reason the charts are seeded
            from one template. */}
        <label className="mb-1 flex cursor-pointer items-center gap-1.5 text-sm text-fg-muted">
          <input
            type="checkbox"
            checked={values.group === "1"}
            onChange={(e) => set({ group: e.target.checked ? "1" : "" })}
            className="h-3.5 w-3.5 accent-[var(--accent)]"
          />
          <Building2 className="h-3.5 w-3.5" />
          All companies together
        </label>

        <span className="ml-auto mb-0.5 flex items-center gap-2">
          {dirty && <Button variant="ghost" size="sm" onClick={reset}>Clear</Button>}
          <Button variant="ghost" size="sm" onClick={() => window.print()}>
            <Printer className="h-3.5 w-3.5" /> Print
          </Button>
        </span>
      </div>

      {group && (
        <p className="text-sm text-fg-muted">
          Showing <b className="text-fg">every active company added together</b>, matched on account number.
          ⚠️ Balances between the companies are <b>not</b> cancelled out — if one owes another, it appears in
          this total as both a debtor and a creditor. Doing that properly needs the companies named as
          customers and suppliers of each other, which is a later phase.
        </p>
      )}
      {!group && (
        <p className="text-sm text-fg-subtle">
          {companyName} · every figure worked out from the entries as this page loaded, never stored.
        </p>
      )}
    </div>
  );
}

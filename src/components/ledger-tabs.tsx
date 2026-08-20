"use client";

// The three sections of the ledger, and the company whose books you are in.
//
// Deliberately the same component as `ops-tabs.tsx`, down to the company picker
// living HERE rather than on one of the screens — Orders learned that the hard
// way when a person looking at another company's orders had no way to change
// company without going to Setup and back.
//
// ⚠️ `co`, NOT `company`. `?company=<id>` is watched globally by CompanyDrawer
// and slides a company preview open over whatever you were doing.

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";
import { FluidSelect } from "./fluid-select";

const TABS = [
  // First, because until a company has a chart nothing else can happen.
  { key: "chart", label: "Chart of accounts", href: "/ledger" },
  // The manual voucher — how anything is corrected or introduced.
  { key: "journals", label: "Journals", href: "/ledger/journals" },
  // The books themselves, raw.
  { key: "entries", label: "Entries", href: "/ledger/entries" },
  // ⚠️ Last, but it is what the ledger is FOR. Trial balance, P&L, balance
  // sheet, general ledger and statements — per company and across all thirteen.
  { key: "reports", label: "Reports", href: "/ledger/reports" },
  // VAT and withholding (Phase 3). Set up once, then rarely touched — so it
  // sits at the end, next to Reports, which is what reads it.
  { key: "tax", label: "Tax rates", href: "/ledger/tax" },
] as const;

export function LedgerTabs({
  active, company, companies = [],
}: {
  active: string;
  company: number;
  /** ⚠️ Defaulted: a caller that forgets these must not take the page down. */
  companies?: Array<{ id: number; name: string }>;
}) {
  const router = useRouter();
  const params = useSearchParams();

  const withCompany = (base: string, id: number) => {
    const p = new URLSearchParams(params.toString());
    p.delete("company");
    p.set("co", String(id));
    return `${base}?${p.toString()}`;
  };

  return (
    <div className="flex flex-wrap items-end justify-between gap-2 border-b border-border">
      <nav className="flex items-center gap-1" aria-label="Sections">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={withCompany(t.href, company)}
            aria-current={active === t.key ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-1.5 text-[13px] transition-colors",
              active === t.key
                ? "border-accent font-medium text-fg"
                : "border-transparent text-fg-muted hover:text-fg",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {companies.length > 1 && (
        <span className="mb-1 flex items-center gap-1.5 text-[12px]">
          <span className="text-fg-subtle">Company</span>
          <FluidSelect
            value={String(company)}
            options={companies.map((c) => ({ value: String(c.id), label: c.name }))}
            onSelect={(v) => router.push(withCompany(
              TABS.find((t) => t.key === active)?.href ?? "/ledger", Number(v)))}
            buttonClassName="h-7"
          />
        </span>
      )}
    </div>
  );
}

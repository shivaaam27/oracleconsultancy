"use client";

// The two sections of Orders & Imports, and the company they belong to.
//
// ⚠️ The company picker lives HERE, not on one of the screens. The first
// version put it on Setup only, so a person looking at another company's orders
// had no way to change company without going to Setup and back.
//
// Real links, not state — a section is a page with its own URL (CLAUDE.md).

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";
import { FluidSelect } from "./fluid-select";

const TABS = [
  { key: "orders", label: "Orders", href: "/ops" },
  // Where an order comes from, so it sits next to the orders it produces.
  { key: "funnel", label: "Funnel", href: "/ops/funnel" },
  { key: "imports", label: "Imports", href: "/ops/imports" },
  // The end of the road: what went out, what was billed, what is still owed.
  { key: "invoices", label: "Delivery & billing", href: "/ops/invoices" },
  // Money going the other way: what we owe suppliers, agents and forwarders.
  { key: "payments", label: "Payments", href: "/ops/payments" },
  // Everything above, added up. Nothing on it is typed.
  { key: "report", label: "Report", href: "/ops/report" },
  // Last on purpose: the lists are set up once and then rarely touched.
  { key: "setup", label: "Setup", href: "/ops/setup" },
] as const;

export function OpsTabs({
  active, company, companies = [],
}: {
  active: string;
  company: number;
  /** ⚠️ Defaulted: a caller that forgets these must not take the page down
   *  with "cannot read properties of undefined". */
  companies?: Array<{ id: number; name: string }>;
}) {
  const router = useRouter();
  const params = useSearchParams();

  /**
   * Keep everything else in the address — the filter, the sort, the search.
   *
   * ⚠️ The key is `co`, NOT `company`. `?company=<id>` is watched globally by
   * CompanyDrawer, so writing it here slid a company preview open every time
   * somebody clicked Orders, Imports or Setup. The Director Brief already uses
   * `co` for exactly this reason.
   */
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
              TABS.find((t) => t.key === active)?.href ?? "/ops", Number(v)))}
            buttonClassName="h-7"
          />
        </span>
      )}
    </div>
  );
}

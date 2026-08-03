"use client";

import { useRouter } from "next/navigation";
import { MultiSelect } from "@/components/multi-select";
import { briefHref, type BriefPersonRole } from "@/lib/brief-links";
import type { BriefPeriod } from "@/lib/director-brief";

/**
 * The Brief's company filter — tick any number of companies.
 *
 * Navigates with the brief's own `?co=` parameter — never `?company=`, which
 * would open the global CompanyDrawer preview over the report (see
 * `BRIEF_COMPANY_PARAM`).
 */
export function BriefCompanyFilter({
  period,
  selectedCompanyIds,
  selectedPersonIds,
  selectedPersonRole,
  companies,
}: {
  period: BriefPeriod;
  selectedCompanyIds: number[];
  selectedPersonIds: number[];
  selectedPersonRole: BriefPersonRole | null;
  companies: Array<{ id: number; name: string; accent?: string | null }>;
}) {
  const router = useRouter();

  return (
    <MultiSelect
      value={selectedCompanyIds.map(String)}
      // Every row carries a dot so the names stay aligned — companies with no
      // brand colour set fall back to the app accent, matching the "By company"
      // cards on this same page.
      options={companies.map((c) => ({
        value: String(c.id),
        label: c.name,
        dot: c.accent || "hsl(var(--accent))",
      }))}
      allLabel="All companies"
      noun="companies"
      onApply={(next) =>
        router.push(
          briefHref(period, {
            companyIds: next.map(Number),
            // Changing companies can strand people who have no work there; the
            // report simply comes back empty rather than silently dropping them.
            personIds: selectedPersonIds,
            personRole: selectedPersonRole,
          })
        )
      }
      className="h-8 px-2.5 text-xs font-medium"
    />
  );
}

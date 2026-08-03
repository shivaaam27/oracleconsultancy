"use client";

import { useRouter } from "next/navigation";
import { MultiSelect } from "@/components/multi-select";
import { briefHref, briefSelectedMonths, briefMonthsToPeriod, type BriefPersonRole } from "@/lib/brief-links";
import type { BriefPeriod } from "@/lib/director-brief";

/**
 * Tick any months — they need not be adjacent, and they merge into ONE report.
 * Ticking a month deselects the This month / Last month / Quarter / Year
 * presets (none of them matches an `on:` period); clearing hands control back.
 *
 * Uses the same MultiSelect as the company and person filters so all three read
 * as one control repeated.
 */
export function BriefMonthFilter({
  period,
  selectedCompanyIds,
  selectedPersonIds,
  selectedPersonRole,
  months,
}: {
  period: BriefPeriod;
  selectedCompanyIds: number[];
  selectedPersonIds: number[];
  selectedPersonRole: BriefPersonRole | null;
  months: Array<{ value: string; label: string }>;
}) {
  const router = useRouter();

  return (
    <MultiSelect
      value={briefSelectedMonths(period)}
      options={months}
      allLabel="Any month"
      noun="months"
      onApply={(next) =>
        router.push(
          briefHref(briefMonthsToPeriod(next) as BriefPeriod, {
            companyIds: selectedCompanyIds,
            personIds: selectedPersonIds,
            personRole: selectedPersonRole,
          })
        )
      }
      className="h-8 px-2.5 text-xs font-medium"
    />
  );
}

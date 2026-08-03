import Link from "next/link";
import { cn } from "@/lib/cn";
import { briefHref, type BriefPersonRole } from "@/lib/brief-links";
import type { BriefPeriod } from "@/lib/director-brief";

const OPTIONS: Array<{ value: BriefPeriod; label: string }> = [
  { value: "month", label: "This month" },
  { value: "last-month", label: "Last month" },
  { value: "quarter", label: "Quarter" },
  { value: "year", label: "Year" },
];

/** Period switcher. Carries the current filters across — changing the period
 *  used to silently drop them and throw you back to the whole portfolio. */
export function BriefPeriodFilter({
  period,
  selectedCompanyIds,
  selectedPersonIds,
  selectedPersonRole,
}: {
  period: BriefPeriod;
  selectedCompanyIds: number[];
  selectedPersonIds: number[];
  selectedPersonRole: BriefPersonRole | null;
}) {
  return (
    <div className="inline-flex rounded-full glass elevated p-1 print-hidden">
      {OPTIONS.map((option) => (
        <Link
          key={option.value}
          href={briefHref(option.value, { companyIds: selectedCompanyIds, personIds: selectedPersonIds, personRole: selectedPersonRole })}
          className={cn(
            "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
            period === option.value
              ? "bg-accent text-accent-fg shadow-sm"
              : "text-fg-muted hover:bg-bg-muted/70 hover:text-fg"
          )}
        >
          {option.label}
        </Link>
      ))}
    </div>
  );
}

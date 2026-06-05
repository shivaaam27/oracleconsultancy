import Link from "next/link";
import { cn } from "@/lib/cn";
import type { BriefPeriod } from "@/lib/director-brief";

function href(period: BriefPeriod, companyId: number | null) {
  const params = new URLSearchParams();
  if (period !== "month") params.set("period", period);
  if (companyId) params.set("company", String(companyId));
  const q = params.toString();
  return q ? `/brief?${q}` : "/brief";
}

export function BriefCompanyFilter({
  period,
  selectedCompanyId,
  companies,
}: {
  period: BriefPeriod;
  selectedCompanyId: number | null;
  companies: Array<{ id: number; name: string }>;
}) {
  return (
    <div className="flex flex-wrap gap-1.5 print-hidden">
      <Link
        href={href(period, null)}
        className={cn(
          "rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition-colors",
          selectedCompanyId == null
            ? "bg-accent text-accent-fg ring-accent"
            : "bg-bg-elev text-fg-muted ring-border hover:bg-bg-muted/70 hover:text-fg"
        )}
      >
        Portfolio
      </Link>
      {companies.map((company) => (
        <Link
          key={company.id}
          href={href(period, company.id)}
          className={cn(
            "rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition-colors",
            selectedCompanyId === company.id
              ? "bg-accent text-accent-fg ring-accent"
              : "bg-bg-elev text-fg-muted ring-border hover:bg-bg-muted/70 hover:text-fg"
          )}
        >
          {company.name}
        </Link>
      ))}
    </div>
  );
}

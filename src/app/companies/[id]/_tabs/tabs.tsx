import Link from "next/link";
import { LayoutDashboard, Activity, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/cn";

export type CompanyTab = "overview" | "completed" | "timeline";

export const COMPANY_TABS: CompanyTab[] = ["overview", "completed", "timeline"];

export function parseCompanyTab(v: string | undefined): CompanyTab {
  if (v === "timeline" || v === "completed") return v;
  return "overview";
}

const ICONS: Record<CompanyTab, React.ComponentType<{ size?: number }>> = {
  overview: LayoutDashboard,
  completed: CheckCircle2,
  timeline: Activity,
};

const LABELS: Record<CompanyTab, string> = {
  overview: "Overview",
  completed: "Completed",
  timeline: "Timeline",
};

export function CompanyTabs({
  companyId,
  current,
  completedCount,
}: {
  companyId: number;
  current: CompanyTab;
  completedCount?: number;
}) {
  return (
    <div className="flex items-center gap-1 border-b border-border">
      {COMPANY_TABS.map((t) => {
        const Icon = ICONS[t];
        const active = t === current;
        const href = t === "overview" ? `/companies/${companyId}` : `/companies/${companyId}?tab=${t}`;
        return (
          <Link
            key={t}
            href={href}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px transition-colors",
              active
                ? "border-accent text-fg font-medium"
                : "border-transparent text-fg-muted hover:text-fg"
            )}
          >
            <Icon size={13} />
            {LABELS[t]}
            {t === "completed" && completedCount ? (
              <span className="text-xs text-fg-subtle tabular">({completedCount})</span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}

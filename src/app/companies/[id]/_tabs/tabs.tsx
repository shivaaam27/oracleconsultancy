import Link from "next/link";
import { LayoutDashboard, IdCard, ListChecks, Activity, Network } from "lucide-react";
import { cn } from "@/lib/cn";

export type CompanyTab = "overview" | "profile" | "tasks" | "timeline" | "org";

export const COMPANY_TABS: CompanyTab[] = ["overview", "profile", "tasks", "timeline", "org"];

export function parseCompanyTab(v: string | undefined): CompanyTab {
  if (v === "profile" || v === "tasks" || v === "timeline" || v === "org") return v;
  // Legacy deep-links: the File tab merged into Profile; Completed folds into Tasks.
  if (v === "file") return "profile";
  if (v === "completed") return "tasks";
  return "overview";
}

const ICONS: Record<CompanyTab, React.ComponentType<{ size?: number }>> = {
  overview: LayoutDashboard,
  profile: IdCard,
  tasks: ListChecks,
  timeline: Activity,
  org: Network,
};

const LABELS: Record<CompanyTab, string> = {
  overview: "Overview",
  profile: "Profile",
  tasks: "Tasks",
  timeline: "Timeline",
  org: "Org",
};

export function CompanyTabs({
  companyId,
  current,
  openCount,
}: {
  companyId: number;
  current: CompanyTab;
  openCount?: number;
}) {
  return (
    <div className="-mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
    <div className="inline-flex w-max items-center gap-1 p-1 rounded-full glass elevated">
      {COMPANY_TABS.map((t) => {
        const Icon = ICONS[t];
        const active = t === current;
        const href = t === "overview" ? `/companies/${companyId}` : `/companies/${companyId}?tab=${t}`;
        return (
          <Link
            key={t}
            href={href}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 px-3.5 py-1.5 text-sm rounded-full transition-all",
              active
                ? "bg-accent text-accent-fg font-medium shadow-sm"
                : "text-fg-muted hover:text-fg hover:bg-bg-muted/60"
            )}
          >
            <Icon size={14} />
            {LABELS[t]}
            {t === "tasks" && openCount ? (
              <span className={cn("text-xs tabular", active ? "text-accent-fg/80" : "text-fg-subtle")}>{openCount}</span>
            ) : null}
          </Link>
        );
      })}
    </div>
    </div>
  );
}

"use client";

import type { ReactNode } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { HoverPreview } from "./hover-preview";

type CompanyPreview = {
  company: { id: number; name: string; accent: string | null };
  compliance: { score: number; status: "Good" | "Watch" | "Risk"; missing: number; expired: number; expiring: number } | null;
  tasks: { open: number; overdue: number; total: number };
  documents: { count: number; attention: unknown[] };
  teamCount: number;
};

const statusTone: Record<"Good" | "Watch" | "Risk", string> = {
  Good: "text-success",
  Watch: "text-warn",
  Risk: "text-danger",
};

function CompanyPreviewBody(data: CompanyPreview) {
  const c = data.compliance;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {data.company.accent && (
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: data.company.accent }} />
        )}
        <span className="truncate text-sm font-semibold">{data.company.name}</span>
      </div>
      {c && (
        <div className="flex items-baseline justify-between gap-3 border-t border-border/50 pt-2 text-xs">
          <span className="text-fg-muted">Compliance</span>
          <span className={cn("font-semibold tabular", statusTone[c.status])}>{c.score}% · {c.status}</span>
        </div>
      )}
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="text-fg-muted">Tasks</span>
        <span className="font-semibold tabular">
          {data.tasks.open} open
          {data.tasks.overdue > 0 && <span className="text-danger"> · {data.tasks.overdue} overdue</span>}
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="text-fg-muted">Team · Documents</span>
        <span className="font-semibold tabular">
          {data.teamCount} · {data.documents.count}
          {data.documents.attention.length > 0 && <span className="text-warn"> ({data.documents.attention.length}!)</span>}
        </span>
      </div>
      <div className="border-t border-border/50 pt-1.5 text-[11px] text-fg-subtle">Click to open the company</div>
    </div>
  );
}

/** Pushes ?company=<id> so CompanyDrawer opens (no page navigation), with a
 *  lazy-loaded hover preview card (desktop hover / keyboard focus). */
export function CompanyDrawerLink({
  id, className, children, title,
}: {
  id: number;
  className?: string;
  children: ReactNode;
  title?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const open = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("company", String(id));
    params.delete("task");
    params.delete("person");
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <HoverPreview<CompanyPreview> cacheKey={`company:${id}`} url={`/api/company-detail?id=${id}`} render={CompanyPreviewBody}>
      <button type="button" onClick={open} className={className} title={title}>
        {children}
      </button>
    </HoverPreview>
  );
}

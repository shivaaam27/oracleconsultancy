"use client";

import type { ReactNode } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { HoverPreview } from "./hover-preview";

type Props = {
  id: number;
  name: string;
  className?: string;
  /** Render this instead of the name (e.g. an icon button). */
  children?: ReactNode;
  title?: string;
  "aria-label"?: string;
};

type PersonPreview = {
  person: { name: string; role: string | null; companyName: string | null; personType: string | null };
  workload: { open: number; overdue: number; blocked: number; escalated: number };
  documents: Array<{ status: string }>;
};

function PersonPreviewBody(data: PersonPreview) {
  const p = data.person;
  const w = data.workload;
  const expiring = data.documents.filter((d) => d.status === "Expiring").length;
  const expired = data.documents.filter((d) => d.status === "Expired").length;
  const subtitle = [p.role, p.companyName].filter(Boolean).join(" · ");
  return (
    <div className="space-y-2">
      <div>
        <div className="truncate text-sm font-semibold">{p.name}</div>
        {subtitle && <div className="truncate text-xs text-fg-muted">{subtitle}</div>}
      </div>
      <div className="flex items-baseline justify-between gap-3 border-t border-border/50 pt-2 text-xs">
        <span className="text-fg-muted">Open tasks</span>
        <span className="font-semibold tabular">
          {w.open}
          {w.overdue > 0 && <span className="text-danger"> · {w.overdue} overdue</span>}
          {w.blocked > 0 && <span className="text-warn"> · {w.blocked} blocked</span>}
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="text-fg-muted">Documents</span>
        <span className="font-semibold tabular">
          {data.documents.length}
          {expiring > 0 && <span className="text-warn"> · {expiring} expiring</span>}
          {expired > 0 && <span className="text-danger"> · {expired} expired</span>}
        </span>
      </div>
      <div className="border-t border-border/50 pt-1.5 text-[11px] text-fg-subtle">Click to open the person</div>
    </div>
  );
}

/**
 * Pushes ?person=<id> into the URL (no page navigation) so PersonDrawer picks
 * it up. Also clears any ?task= so the task drawer closes when a person opens.
 * Hover/focus shows a lazy-loaded preview card.
 */
export function PersonDrawerLink({ id, name, className, children, title, ...rest }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const open = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("person", String(id));
    params.delete("task"); // one drawer at a time
    params.delete("company");
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <HoverPreview<PersonPreview> cacheKey={`person:${id}`} url={`/api/people-detail?id=${id}`} render={PersonPreviewBody}>
      <button
        type="button"
        onClick={open}
        className={className}
        title={title}
        aria-label={rest["aria-label"] ?? (children ? name : undefined)}
      >
        {children ?? name}
      </button>
    </HoverPreview>
  );
}

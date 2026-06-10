"use client";

import { useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import * as Tooltip from "@radix-ui/react-tooltip";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

// Module-level cache so repeated hovers over the same company don't refetch.
type CompanyPreview = {
  company: { id: number; name: string; accent: string | null };
  compliance: { score: number; status: "Good" | "Watch" | "Risk"; missing: number; expired: number; expiring: number } | null;
  tasks: { open: number; overdue: number; total: number };
  documents: { count: number; attention: unknown[] };
  teamCount: number;
};
const previewCache = new Map<number, CompanyPreview>();

const statusTone: Record<"Good" | "Watch" | "Risk", string> = {
  Good: "text-success",
  Watch: "text-warn",
  Risk: "text-danger",
};

function PreviewBody({ data, loading }: { data: CompanyPreview | null; loading: boolean }) {
  if (loading && !data) {
    return (
      <div className="flex items-center gap-2 text-xs text-fg-muted">
        <Loader2 size={13} className="animate-spin text-accent" /> Loading…
      </div>
    );
  }
  if (!data) return <div className="text-xs text-fg-muted">No preview available.</div>;
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
  const [data, setData] = useState<CompanyPreview | null>(() => previewCache.get(id) ?? null);
  const [loading, setLoading] = useState(false);
  const fetched = useRef(previewCache.has(id));

  const open = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("company", String(id));
    params.delete("task");
    params.delete("person");
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const load = async () => {
    if (fetched.current) return;
    fetched.current = true;
    setLoading(true);
    try {
      const res = await fetch(`/api/company-detail?id=${id}`);
      if (res.ok) {
        const json = (await res.json()) as CompanyPreview;
        previewCache.set(id, json);
        setData(json);
      }
    } catch {
      fetched.current = false; // allow a retry on next hover
    } finally {
      setLoading(false);
    }
  };

  return (
    <Tooltip.Provider delayDuration={350}>
      <Tooltip.Root onOpenChange={(o) => o && load()}>
        <Tooltip.Trigger asChild>
          <button type="button" onClick={open} className={className} title={title}>
            {children}
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="top"
            align="start"
            sideOffset={8}
            collisionPadding={12}
            className="z-[120] w-60 rounded-2xl glass-menu p-3 shadow-pill ring-1 ring-border/70"
          >
            <PreviewBody data={data} loading={loading} />
            <Tooltip.Arrow className="fill-[var(--bg-elev)]" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

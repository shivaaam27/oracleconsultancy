"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { HoverPreview } from "./hover-preview";

type Props = {
  code: string;
  children: React.ReactNode;
  className?: string;
};

type TaskPreview = {
  task: {
    code: string;
    actionItem: string;
    status: string;
    priority: string;
    companyName: string;
    daysToDeadline: number | "done" | null;
    latestUpdate: string | null;
    assignees: string[];
  };
};

function deadlineLabel(d: number | "done" | null): { text: string; tone: string } | null {
  if (d === null || d === "done") return null;
  if (d < 0) return { text: `${Math.abs(d)}d overdue`, tone: "text-danger" };
  if (d === 0) return { text: "Due today", tone: "text-warn" };
  if (d === 1) return { text: "Due tomorrow", tone: "text-warn" };
  if (d <= 7) return { text: `Due in ${d}d`, tone: "text-fg-muted" };
  return { text: `Due in ${d}d`, tone: "text-fg-subtle" };
}

function TaskPreviewBody(data: TaskPreview) {
  const t = data.task;
  const dl = deadlineLabel(t.daysToDeadline);
  const priorityTone = t.priority === "Critical" ? "text-danger" : t.priority === "High" ? "text-warn" : "text-fg-muted";
  return (
    <div className="space-y-2">
      <div>
        <div className="line-clamp-2 text-sm font-semibold leading-snug">{t.actionItem}</div>
        <div className="mt-0.5 truncate text-xs text-fg-muted">{t.code} · {t.companyName}</div>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border/50 pt-2 text-xs">
        <span className="text-fg-muted">{t.status}</span>
        <span className={cn("font-semibold", priorityTone)}>· {t.priority}</span>
        {dl && <span className={cn("font-semibold", dl.tone)}>· {dl.text}</span>}
      </div>
      {t.assignees.length > 0 && (
        <div className="truncate text-xs text-fg-muted">{t.assignees.join(", ")}</div>
      )}
      {t.latestUpdate && (
        <div className="line-clamp-3 border-t border-border/50 pt-1.5 text-[11px] text-fg-subtle">{t.latestUpdate}</div>
      )}
    </div>
  );
}

/**
 * Pushes ?task=CODE into the URL (no page navigation) so the TaskDrawer
 * picks it up via useSearchParams. Hover/focus shows a lazy-loaded preview.
 */
export function TaskDrawerLink({ code, children, className }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const open = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("task", code);
    params.delete("person"); // one drawer at a time
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <HoverPreview<TaskPreview> cacheKey={`task:${code}`} url={`/api/task-detail?code=${encodeURIComponent(code)}`} render={TaskPreviewBody} width="w-72">
      <button type="button" onClick={open} className={className}>
        {children}
      </button>
    </HoverPreview>
  );
}

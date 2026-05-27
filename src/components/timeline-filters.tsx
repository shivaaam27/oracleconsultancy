import Link from "next/link";
import { MessageSquare, GitCommitHorizontal, AlertOctagon, Layers } from "lucide-react";
import { cn } from "@/lib/cn";
import type { TimelineFilter } from "@/lib/timeline";

type ChipProps = {
  filter: TimelineFilter;
  current: TimelineFilter;
  /** Pre-built href base — the chip appends ?<param>=<filter> appropriately. */
  buildHref: (filter: TimelineFilter) => string;
  count: number;
  label: string;
  icon?: React.ComponentType<{ size?: number }>;
};

function Chip({ filter, current, buildHref, count, label, icon: Icon }: ChipProps) {
  const active = current === filter;
  const disabled = count === 0 && filter !== "all";
  const cls = active
    ? "bg-accent-soft text-fg border-accent/40"
    : disabled
      ? "border-transparent text-fg-subtle pointer-events-none"
      : "border-border text-fg-muted hover:text-fg hover:bg-bg-muted";
  return (
    <Link
      href={buildHref(filter)}
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-full border transition-colors",
        cls
      )}
    >
      {Icon && <Icon size={11} />}
      <span>{label}</span>
      {count > 0 && filter !== "all" && (
        <span className="font-semibold tabular text-[10px]">{count}</span>
      )}
    </Link>
  );
}

export function TimelineFilters({
  current,
  counts,
  buildHref,
}: {
  current: TimelineFilter;
  counts: Record<TimelineFilter, number>;
  buildHref: (filter: TimelineFilter) => string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Chip filter="all" current={current} buildHref={buildHref} count={counts.all} label={`All · ${counts.all}`} />
      <Chip filter="updates" current={current} buildHref={buildHref} count={counts.updates} label="Updates" icon={MessageSquare} />
      <Chip filter="status" current={current} buildHref={buildHref} count={counts.status} label="Status" icon={GitCommitHorizontal} />
      <Chip filter="field" current={current} buildHref={buildHref} count={counts.field} label="Field changes" />
      <Chip filter="escalation" current={current} buildHref={buildHref} count={counts.escalation} label="Escalations" icon={AlertOctagon} />
      <Chip filter="bulk" current={current} buildHref={buildHref} count={counts.bulk} label="Bulk" icon={Layers} />
    </div>
  );
}

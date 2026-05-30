import Link from "next/link";
import type { TaskRow } from "@/lib/queries";

/**
 * KPI strip for the company page — mirrors the chips on /task so single-company
 * triage is one click. Each chip deep-links into /task?view=table with company
 * + flag (or priority/owner) pre-applied.
 */
export function CompanyKpiStrip({
  rows,
  companyName,
}: {
  rows: TaskRow[];
  companyName: string;
}) {
  // Open-only base (exclude Closed; keep Completed for the "completed" count below)
  const openish = rows.filter((r) => r.status !== "Closed");

  const overdue = openish.filter((r) => r.flag === "overdue" || r.flag === "escalate-now").length;
  const dueSoon = openish.filter((r) => r.flag === "due-soon").length;
  const stalled = openish.filter((r) => r.flag === "stalled").length;
  const escalated = openish.filter((r) => r.flag === "escalated" || r.escalation === "Yes").length;
  const noDeadline = openish.filter((r) => r.flag === "no-deadline").length;
  const critical = openish.filter((r) => r.priority === "Critical" && r.status !== "Completed").length;
  const noOwner = openish.filter((r) => r.assignees.length === 0 && r.status !== "Completed").length;

  const enc = encodeURIComponent(companyName);
  // Deep-link into the hub Tasks tab pre-filtered by this company.
  const base = `/?tab=tasks&view=table&company=${enc}`;

  const chips: Array<{ label: string; count: number; tone: "danger" | "warn" | "info"; href: string }> = [
    { label: "Overdue", count: overdue, tone: "danger", href: `${base}&flag=overdue` },
    { label: "Due Soon", count: dueSoon, tone: "warn", href: `${base}&flag=due-soon` },
    { label: "Stalled", count: stalled, tone: "danger", href: `${base}&flag=stalled` },
    { label: "Escalated", count: escalated, tone: "danger", href: `${base}&flag=escalated` },
    { label: "No Deadline", count: noDeadline, tone: "warn", href: `${base}&flag=no-deadline` },
    { label: "Critical", count: critical, tone: "danger", href: `${base}&priority=Critical` },
    { label: "No Owner", count: noOwner, tone: "info", href: `${base}&noOwner=1` },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((c) => (
        <Chip key={c.label} {...c} />
      ))}
    </div>
  );
}

function Chip({
  label,
  count,
  tone,
  href,
}: {
  label: string;
  count: number;
  tone: "danger" | "warn" | "info";
  href: string;
}) {
  const dim = count === 0;
  const tint = dim
    ? "bg-bg-subtle/40 ring-1 ring-border/60 text-fg-subtle pointer-events-none"
    : tone === "danger" ? "bg-danger-soft/60 ring-1 ring-danger/30 text-danger hover:ring-2"
    : tone === "warn" ? "bg-warn-soft/60 ring-1 ring-warn/30 text-warn hover:ring-2"
    : "bg-info-soft/60 ring-1 ring-info/30 text-info hover:ring-2";
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-2 pl-2 pr-3 py-1.5 text-xs rounded-full transition-all backdrop-blur-md hover:shadow-sm ${tint}`}
    >
      <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full bg-white/30 dark:bg-black/20 font-semibold tabular">
        {count}
      </span>
      <span className="font-medium">{label}</span>
    </Link>
  );
}

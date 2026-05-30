"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { NotebookPen, StickyNote, CalendarOff } from "lucide-react";
import type { TaskRow, TaskSource } from "@/lib/queries";
import { Badge, EmptyState } from "@/components/ui";
import { Deadline } from "@/components/deadline";

type GroupBy = "origin" | "deadline" | "activity";

const GROUPS: { value: GroupBy; label: string }[] = [
  { value: "origin", label: "Origin" },
  { value: "deadline", label: "Deadline" },
  { value: "activity", label: "Last activity" },
];

function statusTone(s: string): "default" | "success" | "warn" | "danger" | "info" {
  if (s === "Completed" || s === "Closed") return "success";
  if (s === "Blocked" || s === "Escalated") return "danger";
  if (s === "Waiting External" || s === "Under Review") return "warn";
  if (s === "In Progress") return "info";
  return "default";
}

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const monthLabel = (d: Date) => d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
const dayLabel = (d: Date) => d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

/**
 * Unified, minimal activity timeline of every task across all companies — the
 * single place to track work, whoever created it (manual, meeting, or note).
 * Date axis is configurable: origin (meeting/created), deadline, or last activity.
 */
export function TimelineView({ rows, sources }: { rows: TaskRow[]; sources: Record<number, TaskSource> }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [groupBy, setGroupBy] = useState<GroupBy>("origin");

  function dateOf(r: TaskRow): Date | null {
    if (groupBy === "deadline") return r.deadline;
    if (groupBy === "activity") return r.lastUpdatedAt ?? r.createdDate;
    return r.meetingDate ?? r.createdDate; // origin
  }

  function openTask(code: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("task", code);
    params.delete("person");
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  // Group by month (newest first); undated items collected separately.
  const dated = rows.map((r) => ({ r, d: dateOf(r) }));
  const undated = dated.filter((x) => !x.d).map((x) => x.r);
  const byMonth = new Map<string, { label: string; sortD: number; items: { r: TaskRow; d: Date }[] }>();
  for (const x of dated) {
    if (!x.d) continue;
    const k = monthKey(x.d);
    if (!byMonth.has(k)) byMonth.set(k, { label: monthLabel(x.d), sortD: new Date(x.d.getFullYear(), x.d.getMonth(), 1).getTime(), items: [] });
    byMonth.get(k)!.items.push({ r: x.r, d: x.d });
  }
  const months = [...byMonth.values()].sort((a, b) => b.sortD - a.sortD);
  for (const m of months) m.items.sort((a, b) => b.d.getTime() - a.d.getTime());

  if (rows.length === 0) {
    return <EmptyState icon={<CalendarOff size={28} />} title="No tasks in scope." hint="Adjust filters or pick a different view." />;
  }

  function SourceChip({ r }: { r: TaskRow }) {
    const s = sources[r.id];
    if (!s) return null;
    const isNote = s.kind === "note";
    return (
      <Link
        href={`/workbook?tab=${isNote ? "notes" : "meetings"}`}
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center gap-1 max-w-[200px] text-[11px] text-fg-muted hover:text-accent transition-colors"
        title={`${isNote ? "From note" : "From meeting"}: ${s.title}`}
      >
        {isNote ? <StickyNote size={11} className="shrink-0" /> : <NotebookPen size={11} className="shrink-0" />}
        <span className="truncate">{s.title}</span>
      </Link>
    );
  }

  function Entry({ r, d }: { r: TaskRow; d: Date | null }) {
    return (
      <div className="relative pl-6">
        {/* node */}
        <span className="absolute left-[3px] top-[14px] w-[9px] h-[9px] rounded-full ring-2 ring-bg" style={{ backgroundColor: r.companyAccent || "var(--accent)" }} />
        <button
          type="button"
          onClick={() => openTask(r.code)}
          className="w-full text-left elevated bg-bg-elev rounded-xl p-3 mb-2 hover:shadow-md transition-shadow"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-fg-muted mb-0.5">
                <span className="font-mono">{r.code}</span>
                <span className="truncate">{r.companyName}</span>
                {d && <span className="text-fg-subtle">· {dayLabel(d)}</span>}
              </div>
              <div className="text-sm leading-snug line-clamp-2">{r.actionItem}</div>
            </div>
            <Badge tone={statusTone(r.status)}>{r.status}</Badge>
          </div>
          <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-2 text-xs text-fg-muted">
            {r.deadline && <span className="inline-flex items-center gap-1">Due <Deadline date={r.deadline} /></span>}
            {r.assignees.length > 0 && <span className="truncate max-w-[180px]">{r.assignees.join(", ")}</span>}
            <SourceChip r={r} />
          </div>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Group-by toggle */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-fg-subtle">{rows.length} task{rows.length === 1 ? "" : "s"} · all companies</div>
        <div className="inline-flex items-center rounded-full bg-bg-subtle p-0.5 text-xs">
          {GROUPS.map((g) => (
            <button
              key={g.value}
              type="button"
              onClick={() => setGroupBy(g.value)}
              className={"px-3 py-1 rounded-full transition-colors " + (groupBy === g.value ? "bg-bg-elev text-fg shadow-sm" : "text-fg-muted hover:text-fg")}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>

      {months.map((m) => (
        <section key={m.label}>
          <div className="sticky top-0 z-10 -mx-1 px-1 py-1.5 bg-bg/80 backdrop-blur-sm">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-muted">{m.label} <span className="text-fg-subtle font-normal">· {m.items.length}</span></h3>
          </div>
          <div className="relative">
            <span className="absolute left-[7px] top-1 bottom-1 w-px bg-border" />
            {m.items.map(({ r, d }) => <Entry key={r.id} r={r} d={d} />)}
          </div>
        </section>
      ))}

      {undated.length > 0 && (
        <section>
          <div className="py-1.5"><h3 className="text-xs font-semibold uppercase tracking-wider text-fg-subtle inline-flex items-center gap-1.5"><CalendarOff size={12} /> Undated · {undated.length}</h3></div>
          <div className="relative">
            <span className="absolute left-[7px] top-1 bottom-1 w-px bg-border" />
            {undated.map((r) => <Entry key={r.id} r={r} d={null} />)}
          </div>
        </section>
      )}
    </div>
  );
}

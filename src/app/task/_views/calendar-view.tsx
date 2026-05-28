import Link from "next/link";
import { ChevronLeft, ChevronRight, CalendarOff } from "lucide-react";
import type { TaskRow } from "@/lib/queries";
import { EmptyState } from "@/components/ui";

/**
 * Month-grid calendar. Tasks are bucketed by deadline (YYYY-MM-DD).
 * Tasks without a deadline are listed in a "No deadline" rail above the grid.
 * `month` is YYYY-MM (defaults to current month).
 */
export function CalendarView({
  rows,
  month,
  queryWithoutMonth,
}: {
  rows: TaskRow[];
  month: string | undefined;
  /** Current query string without the `month` param — used to build prev/next links. */
  queryWithoutMonth: string;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const m = parseMonth(month) ?? { year: today.getFullYear(), monthIdx: today.getMonth() };
  const first = new Date(m.year, m.monthIdx, 1);
  const last = new Date(m.year, m.monthIdx + 1, 0);

  // Build a 6x7 grid starting on Monday.
  const startWeekday = (first.getDay() + 6) % 7; // 0 = Monday
  const cells: { date: Date; inMonth: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(first);
    d.setDate(1 - startWeekday + i);
    cells.push({ date: d, inMonth: d.getMonth() === m.monthIdx });
  }

  // Bucket rows by YYYY-MM-DD
  const byDay = new Map<string, TaskRow[]>();
  const noDeadline: TaskRow[] = [];
  for (const r of rows) {
    if (!r.deadline) {
      noDeadline.push(r);
      continue;
    }
    const k = ymd(r.deadline);
    const list = byDay.get(k) || [];
    list.push(r);
    byDay.set(k, list);
  }
  // Sort each day by priority then code
  const ORDER = ["Critical", "High", "Medium", "Low"];
  for (const list of byDay.values()) {
    list.sort((a, b) => ORDER.indexOf(a.priority) - ORDER.indexOf(b.priority) || a.code.localeCompare(b.code));
  }

  const prev = monthString(m.year, m.monthIdx - 1);
  const next = monthString(m.year, m.monthIdx + 1);
  const buildHref = (mm: string) => {
    const params = new URLSearchParams(queryWithoutMonth);
    params.set("view", "calendar");
    params.set("month", mm);
    return `/?${params.toString()}`;
  };
  const todayHref = (() => {
    const params = new URLSearchParams(queryWithoutMonth);
    params.set("view", "calendar");
    return `/?${params.toString()}`;
  })();

  const monthLabel = first.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Link
            href={buildHref(prev)}
            className="inline-flex items-center justify-center h-7 w-7 rounded-md text-fg-muted hover:text-fg hover:bg-bg-muted"
            aria-label="Previous month"
          >
            <ChevronLeft size={14} />
          </Link>
          <Link
            href={buildHref(next)}
            className="inline-flex items-center justify-center h-7 w-7 rounded-md text-fg-muted hover:text-fg hover:bg-bg-muted"
            aria-label="Next month"
          >
            <ChevronRight size={14} />
          </Link>
          <Link
            href={todayHref}
            className="text-xs px-2 py-1 rounded-md text-fg-muted hover:text-fg hover:bg-bg-muted"
          >
            Today
          </Link>
          <div className="ml-2 text-sm font-medium">{monthLabel}</div>
        </div>
        <div className="text-xs text-fg-subtle">
          {rows.filter((r) => r.deadline && r.deadline >= first && r.deadline <= last).length} due this month
        </div>
      </div>

      {/* No-deadline rail */}
      {noDeadline.length > 0 && (
        <div className="card p-3 border-dashed">
          <div className="flex items-center gap-1.5 text-xs text-fg-muted mb-1.5">
            <CalendarOff size={12} /> No deadline · {noDeadline.length}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {noDeadline.slice(0, 20).map((r) => (
              <Link
                key={r.id}
                href={`/task/${r.code}`}
                className="text-[11px] px-2 py-0.5 rounded-md bg-bg-subtle hover:bg-bg-muted truncate max-w-[260px]"
                title={r.actionItem}
              >
                <span className="font-mono text-fg-muted mr-1">{r.code}</span>
                {r.actionItem}
              </Link>
            ))}
            {noDeadline.length > 20 && (
              <span className="text-[11px] text-fg-subtle px-2 py-0.5">+{noDeadline.length - 20} more</span>
            )}
          </div>
        </div>
      )}

      {/* Grid */}
      <div className="card overflow-hidden">
        <div className="grid grid-cols-7 border-b border-border">
          {weekdayLabels.map((w) => (
            <div key={w} className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-fg-subtle text-center">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((cell, i) => {
            const k = ymd(cell.date);
            const items = byDay.get(k) || [];
            const isToday = ymd(today) === k;
            return (
              <div
                key={i}
                className={
                  "min-h-[100px] border-b border-r border-border last:border-r-0 p-1.5 space-y-1 " +
                  (cell.inMonth ? "bg-bg" : "bg-bg-subtle/40")
                }
              >
                <div
                  className={
                    "text-[10px] tabular " +
                    (isToday
                      ? "text-accent font-semibold"
                      : cell.inMonth
                        ? "text-fg-muted"
                        : "text-fg-subtle")
                  }
                >
                  {cell.date.getDate()}
                </div>
                {items.slice(0, 4).map((r) => (
                  <Link
                    key={r.id}
                    href={`/task/${r.code}`}
                    className="block truncate text-[11px] leading-tight px-1.5 py-0.5 rounded border-l-2 hover:bg-bg-muted"
                    style={{ borderLeftColor: pillColor(r) }}
                    title={`${r.code} · ${r.actionItem}`}
                  >
                    {r.actionItem}
                  </Link>
                ))}
                {items.length > 4 && (
                  <div className="text-[10px] text-fg-subtle px-1">+{items.length - 4} more</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {rows.length === 0 && (
        <EmptyState
          icon={<CalendarOff size={28} />}
          title="No tasks in scope."
          hint="Adjust filters or pick a different view."
        />
      )}
    </div>
  );
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function parseMonth(s: string | undefined): { year: number; monthIdx: number } | null {
  if (!s) return null;
  const match = /^(\d{4})-(\d{1,2})$/.exec(s);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  const monthIdx = parseInt(match[2], 10) - 1;
  if (monthIdx < 0 || monthIdx > 11) return null;
  return { year, monthIdx };
}

function monthString(year: number, monthIdx: number): string {
  const d = new Date(year, monthIdx, 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function pillColor(r: TaskRow): string {
  if (r.flag === "overdue" || r.flag === "escalate-now" || r.flag === "escalated") return "var(--danger)";
  if (r.flag === "due-soon") return "var(--warn)";
  if (r.priority === "Critical") return "var(--danger)";
  return r.companyAccent || "var(--accent)";
}

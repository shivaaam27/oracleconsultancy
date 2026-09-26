/**
 * The Studio Tasks page (design/studio-mockup, Main board) — what the Tasks tab
 * draws when Settings → New look → Tasks is on.
 *
 * ⚠️ IT DECIDES NOTHING. Every row, count, option and link is worked out in
 * TasksSection exactly as for the old page and handed in here; this file only
 * lays it out. Two looks, one set of rules — so the numbers can never disagree.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { Archive, Sparkles, CheckSquare, LayoutGrid, Table2, CalendarDays, GitCommitVertical } from "lucide-react";
import type { TaskRow } from "@/lib/tasks/queries";
import type { IdentityStrip } from "@/components/tasks/task-filter-bar";
import type { RecordFilter } from "@/components/kit/record-list";
import { StudioScope, StudioHeader, StudioCardRow } from "@/components/studio/kit";
import { StudioPickProvider } from "./pick";
import { InsightsCard, type InsightsData } from "./insights-card";
import { UpdateCard } from "./update-card";
import { TaskPanel } from "./task-panel";
import { StudioSearchBar, StudioIdentity, type FilterSection } from "./controls";
import { TaskFilterButton } from "./filter-panel";
import { VIEW_MODES, type ViewMode } from "@/app/task/_views/view-switcher";
import { cn } from "@/lib/cn";

const VIEW_LABEL: Record<ViewMode, string> = { table: "List", board: "Board", calendar: "Calendar", timeline: "Timeline" };
const VIEW_ICON: Record<ViewMode, typeof Table2> = { table: Table2, board: LayoutGrid, calendar: CalendarDays, timeline: GitCommitVertical };

export type StudioTasksProps = {
  title: string;
  view: ViewMode;
  queryWithoutView: string;
  recurringCount: number;
  /** Every filter, in one panel (filter-panel.tsx) — the title bar and the
   *  search bar no longer carry their own copies (owner, 26 Sept 2026). */
  filterSections: FilterSection[];
  activeFilterCount: number;
  /** The list with every filter taken off. */
  clearHref: string;
  savedViews: ReactNode;
  strip: IdentityStrip | null;
  notes: ReactNode;
  insights: InsightsData;
  tableRows: TaskRow[];
  fresh: TaskRow[];
  unreadCount: number;
  updatedToday: number;
  q: string;
  searchHrefBase: string;
  quickAdd: ReactNode;
  /** The list/board/cards/calendar/timeline body, already built. */
  body: ReactNode;
};

export function StudioTasks(p: StudioTasksProps) {
  const search = (inline: boolean) => (
    <StudioSearchBar
      inline={inline}
      q={p.q}
      searchHrefBase={p.searchHrefBase}
      filter={<TaskFilterButton sections={p.filterSections} activeCount={p.activeFilterCount} clearHref={p.clearHref} extra={p.savedViews} />}
    />
  );
  return (
    <StudioScope className="space-y-5">
      <StudioPickProvider>
        <StudioHeader
          title={p.title}
          right={
            <>
              <div className="flex gap-0.5 rounded-[11px] bg-[var(--st-seg)] p-[3px]" role="tablist" aria-label="View">
                {VIEW_MODES.map((m) => {
                  const Icon = VIEW_ICON[m];
                  const params = new URLSearchParams(p.queryWithoutView);
                  if (m !== "table") params.set("view", m);
                  const active = m === p.view;
                  return (
                    <Link
                      key={m}
                      href={`/?${params.toString()}`}
                      role="tab"
                      aria-selected={active}
                      aria-label={VIEW_LABEL[m]}
                      title={VIEW_LABEL[m]}
                      className={cn(
                        "flex h-[34px] items-center gap-1.5 rounded-lg px-3 text-xs transition-colors sm:h-[30px] sm:px-2.5",
                        // A phone keeps List and Board; the wide views are for a tablet and up (owner, 25 Sept 2026).
                        m !== "table" && m !== "board" && !active && "hidden sm:flex",
                        active ? "bg-[var(--st-surface)] font-medium shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-[var(--st-sub)] hover:text-[var(--st-ink)]",
                      )}
                    >
                      <Icon size={14} />
                      <span className={active ? "hidden sm:inline" : "hidden xl:inline"}>{VIEW_LABEL[m]}</span>
                    </Link>
                  );
                })}
              </div>
            </>
          }
        />

        {p.strip && <StudioIdentity strip={p.strip} />}
        {p.notes}

        <StudioCardRow>
          <InsightsCard data={p.insights} />
          <UpdateCard fresh={p.fresh} unreadCount={p.unreadCount} postedToday={p.updatedToday} />
        </StudioCardRow>

        {/* The list keeps its floating bar; the Board, Calendar and Timeline
            take it inline, above the view, so it never sits over them. */}
        {p.view !== "table" && search(true)}
        {p.quickAdd}
        {p.body}

        {p.view === "table" && search(false)}
        <TaskPanel rows={p.tableRows} extra={p.fresh} />
      </StudioPickProvider>
    </StudioScope>
  );
}

/** The empty state, in the Studio look. */
export function StudioEmpty({ archived, done, filtered, hint }: { archived: boolean; done: boolean; filtered: boolean; hint?: string }) {
  return (
    <div className="st-tex-paper-dots flex min-h-[220px] items-center justify-center rounded-[20px] border border-dashed border-[var(--st-line)]">
      <div className="rounded-xl bg-[var(--st-page)] px-5 py-3.5 text-center">
        <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-[var(--st-surface)] text-[var(--st-muted)]">
          {archived ? <Archive size={16} /> : <CheckSquare size={16} />}
        </div>
        <div className="text-sm font-medium">
          {archived ? "No archived tasks." : done ? "Nothing completed yet." : filtered ? "No tasks match these filters." : "No open tasks."}
        </div>
        <div className="mt-0.5 text-xs text-[var(--st-muted)]">
          {hint ?? (archived ? "Archive a task to retire it without losing its history." : filtered ? "Clear a filter, or pick a different view." : "Add one with the row above.")}
        </div>
      </div>
    </div>
  );
}

/** The one-line notes the old page shows for the archived and renewals lanes. */
export function StudioLaneNote({ kind }: { kind: "archived" | "auto" }) {
  return (
    <p className="flex items-center gap-1.5 text-xs text-[var(--st-muted)]">
      {kind === "archived" ? <Archive size={12} /> : <Sparkles size={12} />}
      {kind === "archived"
        ? "Showing archived tasks — retire a task without losing its history. Switch it off in Filters to go back."
        : "Made by the system from expiring documents, probation reviews and Tax & Legal obligations. Complete or undo them like any task."}
    </p>
  );
}

export type { RecordFilter };

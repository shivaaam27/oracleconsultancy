import Link from "next/link";
import { LayoutGrid, LayoutList, Table2, CalendarDays, GitCommitVertical } from "lucide-react";
import { cn } from "@/lib/cn";

export type ViewMode = "cards" | "board" | "table" | "calendar" | "timeline";

// LIST is the default and comes first (Stage 2 of the ERPNext redesign): the
// list screen — columns, filter rail, bulk edit — is the working view, exactly
// as in ERPNext. Cards stay for the glanceable read.
export const VIEW_MODES: ViewMode[] = ["table", "cards", "board", "calendar", "timeline"];

export function parseViewMode(v: string | undefined): ViewMode {
  return v === "board" || v === "calendar" || v === "timeline" || v === "cards" ? v : "table";
}

const ICONS: Record<ViewMode, React.ComponentType<{ size?: number }>> = {
  cards: LayoutList,
  board: LayoutGrid,
  table: Table2,
  calendar: CalendarDays,
  timeline: GitCommitVertical,
};

const LABELS: Record<ViewMode, string> = {
  cards: "Cards",
  board: "Board",
  table: "List",
  calendar: "Calendar",
  timeline: "Timeline",
};

export function ViewSwitcher({
  current,
  queryWithoutView,
  basePath = "/task",
}: {
  current: ViewMode;
  /** Current query string without the `view` param. Built by the page. */
  queryWithoutView: string;
  /** Base URL for generated links. Defaults to /task; pass "/" for hub embed. */
  basePath?: string;
}) {
  return (
    /* On a phone this is a full-width segmented control: five icon-only tabs
       clustered at 34px each read as a stray toolbar, and each was a small
       target. Stretched across the row they are ~68px apiece and the control
       looks like the switch it is.

       Its track is a hairline there rather than a fill. Once the page header
       stopped being a card, a solid grey slab across the full width was the
       heaviest thing on a flat header — heavier than the page title. The
       selected tab still carries a fill, so it is the only weight in the
       control, which is the one thing the control is for.

       From `sm` up it is the same inline filled pill with labels it has always
       been. */
    <div className="flex w-full items-center rounded-full border border-border p-0.5 text-xs sm:inline-flex sm:w-auto sm:shrink-0 sm:border-0 sm:bg-bg-subtle">
      {VIEW_MODES.map((m) => {
        const Icon = ICONS[m];
        const active = m === current;
        const params = new URLSearchParams(queryWithoutView);
        // list is the default — keep URLs clean
        if (m !== "table") params.set("view", m);
        const q = params.toString();
        const href = q ? `${basePath}?${q}` : basePath;
        return (
          <Link
            key={m}
            href={href}
            aria-label={LABELS[m]}
            title={LABELS[m]}
            className={cn(
              "inline-flex flex-1 items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-1 rounded-full transition-colors sm:flex-none sm:justify-start",
              active
                ? "bg-bg-subtle text-fg sm:bg-bg-elev sm:shadow-sm"
                : "text-fg-muted hover:text-fg"
            )}
          >
            <Icon size={13} />
            <span className="hidden sm:inline">{LABELS[m]}</span>
          </Link>
        );
      })}
    </div>
  );
}

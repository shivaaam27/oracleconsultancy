import Link from "next/link";
import { LayoutGrid, Table2, CalendarDays } from "lucide-react";
import { cn } from "@/lib/cn";

export type ViewMode = "board" | "table" | "calendar";

export const VIEW_MODES: ViewMode[] = ["board", "table", "calendar"];

export function parseViewMode(v: string | undefined): ViewMode {
  return v === "table" || v === "calendar" ? v : "board";
}

const ICONS: Record<ViewMode, React.ComponentType<{ size?: number }>> = {
  board: LayoutGrid,
  table: Table2,
  calendar: CalendarDays,
};

const LABELS: Record<ViewMode, string> = {
  board: "Board",
  table: "Table",
  calendar: "Calendar",
};

export function ViewSwitcher({
  current,
  queryWithoutView,
}: {
  current: ViewMode;
  /** Current query string without the `view` param. Built by the page. */
  queryWithoutView: string;
}) {
  return (
    <div className="inline-flex items-center rounded-full bg-bg-subtle p-0.5 text-xs">
      {VIEW_MODES.map((m) => {
        const Icon = ICONS[m];
        const active = m === current;
        const params = new URLSearchParams(queryWithoutView);
        // board is the default — keep URLs clean
        if (m !== "board") params.set("view", m);
        const q = params.toString();
        const href = q ? `/task?${q}` : "/task";
        return (
          <Link
            key={m}
            href={href}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1 rounded-full transition-colors",
              active
                ? "bg-bg-elev text-fg shadow-sm"
                : "text-fg-muted hover:text-fg"
            )}
          >
            <Icon size={12} />
            <span>{LABELS[m]}</span>
          </Link>
        );
      })}
    </div>
  );
}

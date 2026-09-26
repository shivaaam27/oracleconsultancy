export type ViewMode = "board" | "table" | "calendar" | "timeline";

// LIST is the default and comes first. The Cards view was removed (owner,
// 26 Sept 2026: "just the duplication of lists"); an old ?view=cards address
// opens the list.
export const VIEW_MODES: ViewMode[] = ["table", "board", "calendar", "timeline"];

export function parseViewMode(v: string | undefined): ViewMode {
  return v === "board" || v === "calendar" || v === "timeline" ? v : "table";
}

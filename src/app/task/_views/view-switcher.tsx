export type ViewMode = "cards" | "board" | "table" | "calendar" | "timeline";

// LIST is the default and comes first (Stage 2 of the ERPNext redesign): the
// list screen — columns, filter rail, bulk edit — is the working view, exactly
// as in ERPNext. Cards stay for the glanceable read.
export const VIEW_MODES: ViewMode[] = ["table", "cards", "board", "calendar", "timeline"];

export function parseViewMode(v: string | undefined): ViewMode {
  return v === "board" || v === "calendar" || v === "timeline" || v === "cards" ? v : "table";
}

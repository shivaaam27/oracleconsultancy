/* Client-safe site-tool types, labels and tones. No server imports. */

export type ToolCondition = "good" | "needs_repair" | "retired";

export const TOOL_CONDITION_LABELS: Record<ToolCondition, string> = {
  good: "Good",
  needs_repair: "Needs repair",
  retired: "Retired",
};

export const TOOL_CONDITION_TONE: Record<ToolCondition, "default" | "success" | "warn" | "danger" | "info"> = {
  good: "success",
  needs_repair: "warn",
  retired: "danger",
};

export type SiteToolRow = {
  id: number;
  companyId: number | null;
  companyName: string | null;
  name: string;
  quantity: number;
  specification: string | null;
  location: string | null;
  condition: ToolCondition;
  purchasedDate: string | null;
  remark: string | null;
};

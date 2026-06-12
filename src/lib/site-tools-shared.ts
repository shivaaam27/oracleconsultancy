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

export type SiteToolMovementRow = {
  id: number;
  toolId: number | null;
  toolName: string;
  type: "created" | "transfer" | "condition" | "write_off" | "adjust";
  quantity: number | null;
  fromLocation: string | null;
  toLocation: string | null;
  fromCondition: string | null;
  toCondition: string | null;
  reason: string | null;
  createdAt: string;
};

export type SiteToolRow = {
  id: number;
  companyId: number | null;
  companyName: string | null;
  name: string;
  quantity: number;
  minQty: number;
  specification: string | null;
  location: string | null;
  condition: ToolCondition;
  purchasedDate: string | null;
  remark: string | null;
};

/** A tool line is low on stock when a threshold is set and quantity meets it. */
export function isLowStock(t: Pick<SiteToolRow, "minQty" | "quantity">): boolean {
  return t.minQty > 0 && t.quantity <= t.minQty;
}

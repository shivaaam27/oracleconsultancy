export type DeriveInput = {
  status: string;
  priority?: string | null;
  createdDate?: Date | null;
  deadline?: Date | null;
  closedDate?: Date | null;
};

const DAY = 86400 * 1000;
const DAR_OFFSET_MS = 3 * 3600 * 1000; // Dar es Salaam is UTC+3 all year (no DST)
const today = () => {
  // Midnight in Dar es Salaam regardless of where the server runs (Vercel is UTC).
  const shifted = new Date(Date.now() + DAR_OFFSET_MS);
  return new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - DAR_OFFSET_MS
  );
};

export const DUE_SOON_DAYS = 3;
export const AGING_CRITICAL_DAYS = 30;
export const BLOCKED_STALLED_DAYS = 14;

export type Thresholds = {
  dueSoonDays: number;
  agingDays: number;
  stalledDays: number;
};

const DEFAULT_THRESHOLDS: Thresholds = {
  dueSoonDays: DUE_SOON_DAYS,
  agingDays: AGING_CRITICAL_DAYS,
  stalledDays: BLOCKED_STALLED_DAYS,
};

export function daysOpen(t: DeriveInput): number | null {
  if (!t.createdDate) return null;
  const closed = t.status === "Completed" || t.status === "Closed";
  const end = closed && t.closedDate ? t.closedDate : today();
  return Math.floor((end.getTime() - t.createdDate.getTime()) / DAY);
}

export function daysToDeadline(t: DeriveInput): number | "done" | null {
  const closed = t.status === "Completed" || t.status === "Closed";
  if (closed) return "done";
  if (!t.deadline) return null;
  return Math.floor((t.deadline.getTime() - today().getTime()) / DAY);
}

export type Flag =
  | "closed"
  | "escalated"
  | "stalled"
  | "no-deadline"
  | "escalate-now"
  | "overdue"
  | "due-soon"
  | "aging"
  | "on-track";

export function flag(t: DeriveInput, thresholds: Thresholds = DEFAULT_THRESHOLDS): Flag {
  const closed = t.status === "Completed" || t.status === "Closed";
  if (closed) return "closed";
  if (t.status === "Escalated") return "escalated";
  const open = daysOpen(t);
  if (t.status === "Blocked" && open !== null && open > thresholds.stalledDays) return "stalled";
  if (!t.deadline) return "no-deadline";
  const dtd = (t.deadline.getTime() - today().getTime()) / DAY;
  if (t.priority === "Critical" && dtd < 0) return "escalate-now";
  if (dtd < 0) return "overdue";
  if (dtd <= thresholds.dueSoonDays) return "due-soon";
  if (open !== null && open > thresholds.agingDays) return "aging";
  return "on-track";
}

export const flagLabel: Record<Flag, string> = {
  closed: "✅ Closed",
  escalated: "🚨 Escalated",
  stalled: "⛔ Stalled",
  "no-deadline": "⚠️ No Deadline",
  "escalate-now": "🔴 Escalate Now",
  overdue: "🔴 Overdue",
  "due-soon": "🟡 Due Soon",
  aging: "🟠 Aging",
  "on-track": "🟢 On Track",
};

export const flagColor: Record<Flag, string> = {
  closed: "bg-gray-100 text-gray-700",
  escalated: "bg-amber-100 text-amber-800",
  stalled: "bg-red-100 text-red-800",
  "no-deadline": "bg-yellow-100 text-yellow-800",
  "escalate-now": "bg-red-200 text-red-900",
  overdue: "bg-red-100 text-red-800",
  "due-soon": "bg-yellow-100 text-yellow-800",
  aging: "bg-orange-100 text-orange-800",
  "on-track": "bg-green-100 text-green-800",
};

export function isOpen(status: string): boolean {
  return status !== "Completed" && status !== "Closed";
}

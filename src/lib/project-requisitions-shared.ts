// Client-safe half of project requisitions (Phase 3).
//
// Types and pure arithmetic only — no `sb`. The server half is
// `project-requisitions.ts`.

import { num } from "@/lib/projects-shared";

export type RequisitionStatus =
  | "Requested" | "Approved" | "Rejected" | "Received" | "Cancelled";

export const REQUISITION_STATUSES: RequisitionStatus[] = [
  "Requested", "Approved", "Rejected", "Received", "Cancelled",
];

/** Who pays — REQUISITIONS column K. */
export const ROUTES = ["SHAO", "SUPPLIER", "HQ", "ALANDO"] as const;
export type Route = (typeof ROUTES)[number];

export type Requisition = {
  id: number;
  projectId: number;
  itemCode: string;
  batchNo: string | null;
  requestedDate: string | null;
  qtyRequested: string | null;
  rate: string | null;
  amountRequested: string;
  route: string | null;
  supplier: string | null;
  referenceNo: string | null;
  remarks: string | null;
  /** ⚠️ null = nobody has approved it yet. NOT the same as approving zero. */
  amountApproved: string | null;
  /** ⚠️ null = nothing recorded as received. The workbook pre-filled these. */
  receivedDate: string | null;
  grnNo: string | null;
  qtyReceived: string | null;
  amountReceived: string | null;
  status: RequisitionStatus;
};

/**
 * What is left to spend on one budget item.
 *
 * The workbook shows this as REQUISITIONS column D, pulled from BUDGET DATA
 * column G (`budget value − utilised value`). Its "utilised value" is broken —
 * it sums the *Date Paid* column — so the figure site sees there is wrong.
 *
 * Phase 3 computes it from what is actually knowable now: **budget minus what
 * has been approved**. When Phase 4 adds the expenditure ledger this gains a
 * second, tighter reading (budget minus what has actually been spent), and both
 * will be shown, because "committed" and "spent" are different questions.
 *
 * ⚠️ Only APPROVED money counts against the budget. A request nobody has looked
 * at has committed nothing — and treating it as committed is exactly the
 * workbook's mistake, where column Q defaults to the requested figure.
 */
export function itemBalance(
  budgetAmount: number | null,
  requisitions: Requisition[],
  budgetQty: number | null = null,
): {
  budget: number | null;
  approved: number;
  pending: number;
  remaining: number | null;
  /** Approved is over the budget for this item. */
  overspent: boolean;
  /**
   * The same sum in units, and ONLY when a quantity was typed on the budget
   * line — REQUISITIONS column C, done honestly.
   *
   * ⚠️ This is the workbook's most expensive single bug. There the balance
   * quantity is built on PATAMELA column G, which disagrees with the priced
   * total on most lines, and on one item it told the site 15 remained while 45
   * were being requested. Null here means "no quantity was recorded", and the
   * screen must say nothing rather than show a zero.
   */
  qtyBudget: number | null;
  qtyRequestedSoFar: number;
  qtyRemaining: number | null;
} {
  let approved = 0;
  let pending = 0;
  let qtyUsed = 0;
  for (const r of requisitions) {
    if (r.status === "Rejected" || r.status === "Cancelled") continue;
    const a = num(r.amountApproved);
    if (a === null) pending += num(r.amountRequested) ?? 0;
    else approved += a;
    qtyUsed += num(r.qtyRequested) ?? 0;
  }
  const remaining = budgetAmount === null ? null : budgetAmount - approved;
  return {
    budget: budgetAmount,
    approved,
    pending,
    remaining,
    overspent: remaining !== null && remaining < 0,
    qtyBudget: budgetQty,
    qtyRequestedSoFar: qtyUsed,
    qtyRemaining: budgetQty === null ? null : budgetQty - qtyUsed,
  };
}

/**
 * The status a requisition should carry, worked out from its own fields.
 *
 * Kept in one place so a row cannot say "Approved" while having no approved
 * amount. Explicit Rejected/Cancelled are decisions, not derivable, so they win.
 */
export function deriveStatus(r: {
  amountApproved: string | number | null;
  amountReceived: string | number | null;
  status?: string | null;
}): RequisitionStatus {
  if (r.status === "Rejected") return "Rejected";
  if (r.status === "Cancelled") return "Cancelled";
  if (num(r.amountReceived) !== null) return "Received";
  if (num(r.amountApproved) !== null) return "Approved";
  return "Requested";
}

/** Tone for the status dot — worst-first colouring, as everywhere in COS. */
export function statusTone(s: RequisitionStatus): "success" | "warn" | "danger" | "muted" | "info" {
  switch (s) {
    case "Received": return "success";
    case "Approved": return "info";
    case "Requested": return "warn";     // waiting on somebody
    case "Rejected": return "danger";
    default: return "muted";
  }
}

/**
 * How much of what was approved has actually been confirmed as delivered.
 *
 * This is the number the workbook cannot tell you, because its receiving columns
 * pre-fill: there, everything always looks received. On the real Patamela data
 * the true figure is about **5%** (4,964,400 confirmed against 94,481,950
 * approved). Showing it is the point of keeping the GRN step at all.
 */
export function receivedCoverage(requisitions: Requisition[]): {
  approved: number; received: number; pct: number | null; awaiting: number;
} {
  let approved = 0, received = 0, awaiting = 0;
  for (const r of requisitions) {
    if (r.status === "Rejected" || r.status === "Cancelled") continue;
    const a = num(r.amountApproved);
    if (a === null) continue;
    approved += a;
    const got = num(r.amountReceived);
    if (got === null) awaiting += a;
    else received += got;
  }
  return { approved, received, awaiting, pct: approved > 0 ? received / approved : null };
}

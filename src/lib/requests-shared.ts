/* Request Desk — pure, client-safe types and constants (no server imports),
 * so both server code and client components can share the status machine,
 * labels, tones, recipient formatting and category suggestions. */

import type { BadgeTone } from "./badge-tones";

export type RequestStatus =
  | "open"
  | "needs_info"
  | "approved"
  | "in_progress"
  | "declined"
  | "done"
  | "noted"
  | "cancelled";

export const REQUEST_STATUSES: RequestStatus[] = [
  "open",
  "needs_info",
  "approved",
  "in_progress",
  "declined",
  "done",
  "noted",
  "cancelled",
];

/** Human label for a status (sentence case). */
export function requestStatusLabel(status: string): string {
  switch (status) {
    case "open":
      return "Open";
    case "needs_info":
      return "Needs info";
    case "approved":
      return "Approved";
    case "in_progress":
      return "In progress";
    case "declined":
      return "Declined";
    case "done":
      return "Done";
    case "noted":
      return "Noted";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

/** Badge colour for a status — one source of truth for portal + admin. */
export function requestStatusTone(status: string): BadgeTone {
  switch (status) {
    case "approved":
    case "done":
      return "success";
    case "declined":
      return "danger";
    case "needs_info":
      return "warn";
    case "in_progress":
      return "info";
    case "open":
      return "info";
    default: // noted | cancelled
      return "default";
  }
}

/** A request is "open" (still needs attention) for everything except the
 *  terminal states. Powers counts + the addressee's action affordances. */
export function isRequestOpen(status: string): boolean {
  return status !== "done" && status !== "declined" && status !== "cancelled" && status !== "noted";
}

/** Suggested type chips. Staff may also type their own value. The owner can
 *  override this list (stored in settings); this is the fallback default. */
export const REQUEST_CATEGORIES = ["Equipment", "HR", "Admin", "Finance", "Leave/Time", "Feedback", "Other"];

/** How long an OPEN request has been waiting, with a tone once it's stale.
 *  Quiet while fresh (<3 days), amber at 3+ days, red at 7+ days. Returns null
 *  for closed/done requests or fresh ones. `nowMs` is passed by the client so
 *  the calc is deterministic. */
export function requestAging(createdAt: string, status: string, nowMs: number): { days: number; tone: BadgeTone } | null {
  if (!isRequestOpen(status)) return null;
  const days = Math.floor((nowMs - new Date(createdAt).getTime()) / 86_400_000);
  if (days < 3) return null;
  return { days, tone: days >= 7 ? "danger" : "warn" };
}

/** Display name from a created_by stamp ("portal-mgr:Fatuma" → "Fatuma";
 *  "web-ui"/"admin" → the owner). Pure, so the client thread can use it. */
export function requestAuthorName(createdBy: string | null): string {
  if (!createdBy) return "Someone";
  if (createdBy === "web-ui" || createdBy === "admin" || createdBy === "ai-command") return "Oracle Consultancy";
  const idx = createdBy.indexOf(":");
  return idx >= 0 ? createdBy.slice(idx + 1) : createdBy;
}

/** A person an allowed recipient picker can offer. */
export type RequestRecipient = { id: number; name: string; relation: string };

/** A party on a request (requester or recipient). person id, or the owner. */
export type RequestParty = { id: number | null; name: string; isOwner: boolean };

/** "Amani, HR and you" — formats a recipient list for the given viewer. */
export function partiesLabel(parties: RequestParty[], viewerIsOwner: boolean): string {
  const names = parties.map((p) => (p.isOwner ? (viewerIsOwner ? "you" : "the owner") : p.name));
  if (names.length === 0) return "—";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export type RequestRow = {
  id: number;
  code: string;
  requesterId: number | null;
  requesterName: string;
  requesterIsOwner: boolean;
  recipients: RequestParty[];
  companyName: string | null;
  category: string | null;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  seen: boolean;
};

export type RequestThreadEntry = {
  id: number;
  body: string;
  createdAt: string;
  createdBy: string | null;
  kind: string | null;
  attachmentDocumentId: number | null;
  attachmentName: string | null;
};

export type RequestDetail = {
  id: number;
  code: string;
  requesterId: number | null;
  requesterName: string;
  requesterIsOwner: boolean;
  recipients: RequestParty[];
  companyName: string | null;
  category: string | null;
  title: string;
  body: string | null;
  status: string;
  decisionReason: string | null;
  decidedAt: string | null;
  seenAt: string | null;
  convertedTaskId: number | null;
  convertedTaskCode: string | null;
  createdAt: string;
  updatedAt: string;
  thread: RequestThreadEntry[];
};

export type RequestTrends = {
  total: number;
  open: number;
  approved: number;
  declined: number;
  done: number;
  approvalRate: number | null; // approved / (approved + declined)
  avgResponseHours: number | null; // raised → first decision
  byCategory: { label: string; count: number }[];
  byCompany: { label: string; count: number }[];
  byStatus: { label: string; count: number }[];
};

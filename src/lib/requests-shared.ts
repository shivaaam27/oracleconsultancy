/* Request Desk — pure, client-safe types and constants (no server imports),
 * so both server code and client components can share the status machine,
 * labels, tones and category suggestions. */

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

/** Suggested type chips. Staff may also type their own value. */
export const REQUEST_CATEGORIES = ["Equipment", "HR", "Admin", "Finance", "Leave/Time", "Feedback", "Other"];

export type RequestRecipient = { id: number; name: string; relation: string };

export type RequestRow = {
  id: number;
  code: string;
  requesterId: number;
  addresseeId: number | null;
  requesterName: string;
  addresseeName: string | null;
  toOwner: boolean;
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
  requesterId: number;
  requesterName: string;
  addresseeId: number | null;
  addresseeName: string | null;
  toOwner: boolean;
  companyName: string | null;
  category: string | null;
  title: string;
  body: string | null;
  status: string;
  decisionReason: string | null;
  decidedAt: string | null;
  seenAt: string | null;
  createdAt: string;
  updatedAt: string;
  thread: RequestThreadEntry[];
};

/** Display name from a created_by stamp ("portal-mgr:Fatuma" → "Fatuma";
 *  "web-ui"/"admin" → the owner). Pure, so the client thread can use it. */
export function requestAuthorName(createdBy: string | null): string {
  if (!createdBy) return "Someone";
  if (createdBy === "web-ui" || createdBy === "admin" || createdBy === "ai-command") return "Oracle Consultancy";
  const idx = createdBy.indexOf(":");
  return idx >= 0 ? createdBy.slice(idx + 1) : createdBy;
}

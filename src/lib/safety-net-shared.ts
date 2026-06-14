// safety-net-shared.ts — client-safe types for the data-quality "safety net".
// The engine (safety-net.ts, server) computes these findings on read from the
// live tables; nothing here imports the DB, so client components can render them.

export type FindingSeverity = "high" | "medium" | "low";

// A data-quality / integrity problem the system found on its own — something
// MISSING or INCONSISTENT, as opposed to a normal expiry/overdue alert.
export interface Finding {
  /** Stable-ish id for React keys + de-dupe (kind + entity). */
  id: string;
  severity: FindingSeverity;
  kind: FindingKind;
  title: string;
  detail: string;
  /** Where to go to fix it, if there's an obvious destination. */
  href?: string;
}

export type FindingKind =
  | "duplicate-tin"
  | "awaiting-original"
  | "stale-fact"
  | "incomplete-fact"
  | "asset-on-leaver"
  | "missing-company-id";

export const SEVERITY_RANK: Record<FindingSeverity, number> = { high: 3, medium: 2, low: 1 };

export const SEVERITY_LABEL: Record<FindingSeverity, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const SEVERITY_TONE: Record<FindingSeverity, "danger" | "warn" | "muted"> = {
  high: "danger",
  medium: "warn",
  low: "muted",
};

/** Newest/most-severe first. */
export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
}

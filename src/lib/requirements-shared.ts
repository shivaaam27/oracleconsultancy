// Client-safe helpers for the HR requirement checklist. No server imports.

export type RequirementStatus = "missing" | "requested" | "received" | "verified" | "waived";

// "expired" is a DERIVED state (a verified document that has since lapsed); it is
// never stored — the stored status stays "verified" but the effective view shows
// it needs renewal and it stops counting toward the score.
export type EffectiveStatus = RequirementStatus | "expired" | "expiring";

export const REQUIREMENT_STATUS_LABELS: Record<EffectiveStatus, string> = {
  missing: "Missing",
  requested: "Requested",
  received: "Received",
  verified: "Verified",
  waived: "Waived",
  expired: "Expired",
  expiring: "Expiring",
};

export type StatusTone = "default" | "success" | "warn" | "danger" | "info";

export const REQUIREMENT_STATUS_TONE: Record<EffectiveStatus, StatusTone> = {
  missing: "danger",
  requested: "info",
  received: "warn",
  verified: "success",
  waived: "default",
  expired: "danger",
  expiring: "warn",
};

export type ComplianceBand = "Good" | "Watch" | "Risk";

/** Band from a 0-100 score, treating any expired mandatory item as Risk. */
export function complianceBand(score: number, hasExpiredMandatory: boolean): ComplianceBand {
  if (hasExpiredMandatory || score < 60) return "Risk";
  if (score < 100) return "Watch";
  return "Good";
}

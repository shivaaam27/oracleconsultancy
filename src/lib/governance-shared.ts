// governance-shared.ts — client-safe types + pure helpers for the board-level
// Governance & Risk layer. No DB imports.

export type Holder = { holder: string; shares: number | null; pct: number | null; holderType: string | null; note: string | null };
export type CapTable = { authorised: number | null; issued: number | null; holders: Holder[] };
export type Signatory = { id: number; name: string; scope: string | null; note: string | null };
export type Resolution = { id: number; date: string | null; type: string | null; summary: string; documentId: number | null };

export type CompanyGovernance = {
  capTable: CapTable;
  signatories: Signatory[];
  resolutions: Resolution[];
};

export type Ubo = { id: number; personName: string; interests: string | null; flag: string | null; complete: boolean };
export type KeyPerson = {
  id: number; name: string;
  directorOf: number | null; secretaryOf: number | null; shareholderOf: number | null; signatoryOf: number | null;
  risk: string | null; note: string | null;
};

export type RiskBand = "Critical" | "High" | "Medium" | "Low";
export type Risk = {
  id: number; code: string; category: string | null; title: string; description: string | null;
  likelihood: number | null; impact: number | null; score: number; band: RiskBand;
  owner: string | null; mitigation: string | null; status: string; linked: string | null;
};

export type Decision = {
  id: number; code: string; title: string; companyId: number | null; companyName: string | null;
  type: string | null; raisedBy: string | null; due: string | null; status: string;
  context: string | null; decision: string | null; decidedOn: string | null;
};

/** L×I → score and band (matches the local engine: ≥9 Critical, ≥6 High, ≥3 Medium). */
export function riskScore(likelihood: number | null, impact: number | null): { score: number; band: RiskBand } {
  const score = (likelihood ?? 0) * (impact ?? 0);
  const band: RiskBand = score >= 9 ? "Critical" : score >= 6 ? "High" : score >= 3 ? "Medium" : "Low";
  return { score, band };
}

export const RISK_BAND_TONE: Record<RiskBand, "danger" | "warn" | "accent" | "muted"> = {
  Critical: "danger",
  High: "danger",
  Medium: "warn",
  Low: "muted",
};

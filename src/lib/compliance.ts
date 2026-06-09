import type { DocStatus } from "@/lib/documents-shared";
import type { PersonType } from "@/lib/person-types";

// Shared compliance types + ranking. The actual scoring lives in the DB-backed
// modules: people in `src/lib/requirements.ts`, companies in
// `src/lib/company-requirements.ts`. This file only holds the common shapes and
// the worst-first selector they all feed (Home, Documents, Director Brief).

export type ComplianceOwnerType = "company" | "person";

export type ComplianceRequirement = {
  id: string;
  label: string;
  categories: string[];
  ownerType: ComplianceOwnerType;
  appliesTo: "all" | PersonType;
  weight: number;
};

export type ComplianceGap = ComplianceRequirement & {
  ownerId: number;
  ownerName: string;
};

export type ComplianceDocumentIssue = {
  id: number;
  title: string;
  category: string | null;
  status: Extract<DocStatus, "Expired" | "Expiring">;
  expiryLabel: string | null;
};

export type ComplianceScore = {
  ownerId: number;
  ownerName: string;
  ownerType: ComplianceOwnerType;
  score: number;
  required: number;
  present: number;
  missing: number;
  expired: number;
  expiring: number;
  monitoredDocuments: number;
  status: "Good" | "Watch" | "Risk";
  gaps: ComplianceGap[];
  documentIssues: ComplianceDocumentIssue[];
};

export function worstComplianceScores(scores: ComplianceScore[], limit = 5): ComplianceScore[] {
  return scores
    .filter((score) => score.status !== "Good" && (score.required > 0 || score.monitoredDocuments > 0))
    .sort((a, b) => a.score - b.score || b.expired - a.expired || b.missing - a.missing)
    .slice(0, limit);
}

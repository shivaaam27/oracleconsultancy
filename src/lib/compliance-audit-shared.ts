// Client-safe types + labels for the compliance audit trail. No server imports,
// so this can be used from client components (the checklist History panel).

export type ComplianceAction =
  | "verified"
  | "unverified"
  | "waived"
  | "unwaived"
  | "linked"
  | "unlinked"
  | "requested"
  | "added"
  | "edited"
  | "removed";

export const COMPLIANCE_ACTION_LABEL: Record<ComplianceAction, string> = {
  verified: "Verified",
  unverified: "Unverified",
  waived: "Waived",
  unwaived: "Restored",
  linked: "Linked a document",
  unlinked: "Unlinked the document",
  requested: "Marked as requested",
  added: "Added requirement",
  edited: "Edited requirement",
  removed: "Removed requirement",
};

export type ComplianceEvent = {
  id: number;
  action: ComplianceAction;
  label: string;
  detail: string | null;
  documentId: number | null;
  createdAt: string;
  createdBy: string | null;
};

/** Friendly actor name from a stored createdBy token. */
export function complianceActor(createdBy: string | null): string {
  if (!createdBy || createdBy === "web-ui") return "You";
  if (createdBy === "auto-link") return "Auto-link";
  if (createdBy.startsWith("portal:")) return createdBy.slice("portal:".length);
  return createdBy;
}

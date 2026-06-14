// pipeline-shared.ts — client-safe types + the stage model for the in-flight
// bureaucracy pipeline (permits/visas/licences moving through government stages).

export const PIPELINE_STAGES = [
  "To Apply",
  "Applied",
  "Control No. Issued",
  "Paid",
  "Receipt Received",
  "Issued",
] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

/** Normalise a free-text stage to a known one (the local engine had variants). */
export function normalizeStage(s: string | null | undefined): PipelineStage {
  const v = (s ?? "").toLowerCase();
  if (v.includes("issued") && v.includes("control")) return "Control No. Issued";
  if (v.includes("receipt")) return "Receipt Received";
  if (v.includes("paid") || v.includes("payment")) return "Paid";
  if (v.includes("applied")) return "Applied";
  if (v === "issued" || v.includes("complete") || v.includes("granted")) return "Issued";
  return "To Apply";
}

export type PipelineItem = {
  id: number;
  subject: string;
  subjectType: string | null;
  companyId: number | null;
  companyName: string | null;
  personId: number | null;
  type: string;
  stage: PipelineStage;
  controlNo: string | null;
  amount: string | null;
  lastUpdate: string | null;
  deadline: string | null;
  nextAction: string | null;
  owner: string | null;
  notes: string | null;
  documentId: number | null;
};

/** Stage → tone for the kanban column / chip. "Issued" is done (success). */
export const STAGE_TONE: Record<PipelineStage, "muted" | "accent" | "warn" | "success"> = {
  "To Apply": "muted",
  Applied: "accent",
  "Control No. Issued": "warn",
  Paid: "accent",
  "Receipt Received": "accent",
  Issued: "success",
};

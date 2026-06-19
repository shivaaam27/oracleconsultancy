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
  /** The task that drives this case; completing it auto-advances the stage. */
  taskId: number | null;
  taskCode: string | null;
};

const normLower = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Which pipeline stage a document implies (a receipt → Receipt Received, etc.).
 *  Null when the document doesn't clearly map to a stage — the automation layer
 *  only advances a stage on a clear signal, never a guess. Pure + unit-tested. */
export function inferPipelineStage(doc: { title?: string | null; docType?: string | null; notes?: string | null; category?: string | null }): PipelineStage | null {
  const hay = normLower(`${doc.title ?? ""} ${doc.docType ?? ""} ${doc.notes ?? ""}`);
  if (/\breceipt\b/.test(hay)) return "Receipt Received";
  if (/\bcontrol\b|assessment|control no/.test(hay)) return "Control No. Issued";
  if (/\bpaid\b|payment|proof of payment/.test(hay)) return "Paid";
  // The actual issued permit/licence/visa itself.
  if (["Immigration", "Permit", "Licence", "Passport"].includes(doc.category ?? "")) return "Issued";
  return null;
}

/** Stage → tone for the kanban column / chip. "Issued" is done (success). */
export const STAGE_TONE: Record<PipelineStage, "muted" | "accent" | "warn" | "success"> = {
  "To Apply": "muted",
  Applied: "accent",
  "Control No. Issued": "warn",
  Paid: "accent",
  "Receipt Received": "accent",
  Issued: "success",
};

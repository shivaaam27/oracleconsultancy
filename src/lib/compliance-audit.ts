import { sb } from "@/db/supabase";
import type { ComplianceAction, ComplianceEvent } from "@/lib/compliance-audit-shared";

// Append-only audit trail for document-compliance actions on a person's or a
// company's checklist. Writing never blocks the user action (best-effort).
// Client-safe types/labels live in compliance-audit-shared.ts.
export type { ComplianceAction, ComplianceEvent } from "@/lib/compliance-audit-shared";
export { COMPLIANCE_ACTION_LABEL, complianceActor } from "@/lib/compliance-audit-shared";

type LogOpts = {
  detail?: string | null;
  documentId?: number | null;
  createdBy?: string;
  /** Pass when already known, to skip the context lookup. */
  label?: string;
  ownerId?: number;
};

async function insert(row: Record<string, unknown>): Promise<void> {
  try {
    await sb.from("compliance_events").insert({ ...row, created_at: new Date().toISOString() });
  } catch {
    /* never block the user action on an audit write */
  }
}

/** Log an action on a person_requirements row (looks up owner + label if needed). */
export async function logPersonRequirementEvent(
  requirementId: number,
  action: ComplianceAction,
  opts: LogOpts = {}
): Promise<void> {
  let personId = opts.ownerId ?? null;
  let label = opts.label ?? null;
  if (personId == null || label == null) {
    const { data } = await sb
      .from("person_requirements")
      .select("person_id,label")
      .eq("id", requirementId)
      .maybeSingle();
    personId = personId ?? ((data?.person_id as number | null) ?? null);
    label = label ?? ((data?.label as string | null) ?? null);
  }
  if (personId == null || !label) return;
  await insert({
    owner_type: "person",
    person_id: personId,
    requirement_id: requirementId,
    label,
    action,
    detail: opts.detail ?? null,
    document_id: opts.documentId ?? null,
    created_by: opts.createdBy ?? "web-ui",
  });
}

/** Log an action on a company_requirements row (looks up owner + label if needed). */
export async function logCompanyRequirementEvent(
  requirementId: number,
  action: ComplianceAction,
  opts: LogOpts = {}
): Promise<void> {
  let companyId = opts.ownerId ?? null;
  let label = opts.label ?? null;
  if (companyId == null || label == null) {
    const { data } = await sb
      .from("company_requirements")
      .select("company_id,label")
      .eq("id", requirementId)
      .maybeSingle();
    companyId = companyId ?? ((data?.company_id as number | null) ?? null);
    label = label ?? ((data?.label as string | null) ?? null);
  }
  if (companyId == null || !label) return;
  await insert({
    owner_type: "company",
    company_id: companyId,
    requirement_id: requirementId,
    label,
    action,
    detail: opts.detail ?? null,
    document_id: opts.documentId ?? null,
    created_by: opts.createdBy ?? "web-ui",
  });
}

/** Read the audit trail for one owner, newest first. */
export async function listComplianceEvents(
  owner: { type: "person" | "company"; id: number },
  limit = 50
): Promise<ComplianceEvent[]> {
  const col = owner.type === "person" ? "person_id" : "company_id";
  const { data } = await sb
    .from("compliance_events")
    .select("id,action,label,detail,document_id,created_at,created_by")
    .eq(col, owner.id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r) => ({
    id: r.id as number,
    action: r.action as ComplianceAction,
    label: r.label as string,
    detail: (r.detail as string | null) ?? null,
    documentId: (r.document_id as number | null) ?? null,
    createdAt: r.created_at as string,
    createdBy: (r.created_by as string | null) ?? null,
  }));
}

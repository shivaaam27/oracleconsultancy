import { sb } from "@/db/supabase";
import { deriveDocStatus, expiryLabel, type DocStatus } from "@/lib/documents-shared";
import { complianceBand, type ComplianceBand, type EffectiveStatus, type RequirementStatus } from "@/lib/requirements-shared";
import type { ComplianceScore, ComplianceGap, ComplianceDocumentIssue } from "@/lib/compliance";

/* ------------------------------------------------------------------ */
/* Per-company document compliance checklist (DB-backed).              */
/* Unlike people (shared type templates), each company owns its list.  */
/* Seeded with the core statutory documents, then fully editable per   */
/* company — add VRN, extra registrations, remove what doesn't apply.  */
/* ------------------------------------------------------------------ */

type SeedItem = { key: string; label: string; category: string; mandatory?: boolean };

// The statutory registration checklist (per the COS Command Centre handover —
// one row per authority a Tanzanian company must be current with). VAT and the
// sector permit are optional ("if applicable"); the rest are mandatory. The
// operator can still add/remove per company.
export const COMPANY_DEFAULT_ITEMS: SeedItem[] = [
  { key: "company-registration", label: "Certificate of Incorporation (BRELA)", category: "Registration" },
  { key: "tax-registration", label: "TIN (Taxpayer ID)", category: "Tax" },
  { key: "vat-registration", label: "VAT registration (if applicable)", category: "Tax", mandatory: false },
  { key: "business-licence", label: "Business / trading licence", category: "Licence" },
  { key: "sector-permit", label: "Sector / specific permit (e.g. food, TFDA)", category: "Permit", mandatory: false },
  { key: "paye-sdl-registration", label: "PAYE / SDL employer registration", category: "Registration" },
  { key: "nssf-registration", label: "NSSF employer registration", category: "Registration" },
  { key: "wcf-registration", label: "WCF employer registration", category: "Registration" },
  { key: "bank-account", label: "Company bank account & signatories", category: "Registration" },
  { key: "statutory-registers", label: "Statutory registers up to date", category: "Registration" },
];

/** Categories specific enough to auto-link a saved company document to its item. */
const SPECIFIC_CATEGORIES = new Set([
  "Registration", "Tax", "Licence", "Permit", "Insurance", "Lease",
  "Contract", "Certificate", "Immigration", "Passport",
]);

/* ------------------------------------------------------------------ */
/* Seeding / reconciliation                                            */
/* ------------------------------------------------------------------ */
/**
 * Insert any missing seed items for a company. Items the operator removed are
 * kept hidden (status "removed") so they aren't resurrected. Idempotent.
 */
export async function ensureCompanyRequirements(companyId: number): Promise<void> {
  const { data: rows } = await sb
    .from("company_requirements")
    .select("source_key")
    .eq("company_id", companyId);
  const haveKeys = new Set((rows ?? []).map((r) => r.source_key as string | null).filter(Boolean));
  const now = new Date().toISOString();
  const toInsert = COMPANY_DEFAULT_ITEMS.filter((it) => !haveKeys.has(it.key)).map((it) => ({
    company_id: companyId,
    source_key: it.key,
    label: it.label,
    category: it.category,
    mandatory: it.mandatory ?? true,
    expiry_tracked: true,
    status: "missing",
    created_at: now,
    updated_at: now,
  }));
  if (toInsert.length) await sb.from("company_requirements").insert(toInsert);
}

/* ------------------------------------------------------------------ */
/* Reading the checklist + scoring                                     */
/* ------------------------------------------------------------------ */
export type CompanyChecklistRow = {
  id: number;
  label: string;
  category: string | null;
  mandatory: boolean;
  expiryTracked: boolean;
  status: RequirementStatus;
  effectiveStatus: EffectiveStatus;
  documentId: number | null;
  documentTitle: string | null;
  docStatus: DocStatus | null;
  expiryLabel: string | null;
  verifiedAt: string | null;
  isCustom: boolean;
};

export type CompanyChecklist = {
  companyId: number;
  score: number;
  band: ComplianceBand;
  mandatoryTotal: number;
  mandatoryVerified: number;
  missingMandatory: number;
  expiredMandatory: number;
  items: CompanyChecklistRow[];
};

type CompanyDocRow = {
  id: number;
  title: string;
  category: string | null;
  expiryDate: Date | null;
  reminderLeadDays: number;
  status: DocStatus;
};

async function loadCompanyDocuments(companyId: number): Promise<CompanyDocRow[]> {
  const { data } = await sb
    .from("documents")
    .select("id,title,category,expiry_date,reminder_lead_days,archived")
    .eq("company_id", companyId)
    .eq("archived", false);
  return (data ?? []).map((d) => {
    const expiryDate = d.expiry_date ? new Date(d.expiry_date as string) : null;
    const reminderLeadDays = (d.reminder_lead_days as number | null) ?? 30;
    return {
      id: d.id as number,
      title: d.title as string,
      category: (d.category as string | null) ?? null,
      expiryDate,
      reminderLeadDays,
      status: deriveDocStatus({ expiryDate, reminderLeadDays, archived: false }),
    };
  });
}

export function effectiveStatus(status: RequirementStatus, docStatus: DocStatus | null): EffectiveStatus {
  if (status === "waived") return "waived";
  if (status === "verified") {
    if (docStatus === "Expired") return "expired";
    if (docStatus === "Expiring") return "expiring";
    return "verified";
  }
  return status;
}

/** Generate (if needed), auto-link saved company documents, derive status, score. */
export async function getCompanyChecklist(companyId: number): Promise<CompanyChecklist> {
  await ensureCompanyRequirements(companyId);

  const [{ data: rows }, docs] = await Promise.all([
    sb
      .from("company_requirements")
      .select("id,source_key,label,category,mandatory,expiry_tracked,status,document_id,verified_at,auto_link")
      .eq("company_id", companyId),
    loadCompanyDocuments(companyId),
  ]);

  const liveRows = (rows ?? []).filter((r) => (r.status as string) !== "removed");
  const docById = new Map(docs.map((d) => [d.id, d]));
  const linkedDocIds = new Set(
    liveRows.map((r) => r.document_id as number | null).filter((x): x is number => x != null)
  );

  // Auto-link an un-actioned item to a saved document of the same category.
  const now = new Date().toISOString();
  for (const r of liveRows) {
    if (r.document_id) continue;
    if ((r.auto_link as boolean | null) === false) continue;
    if (r.status !== "missing" && r.status !== "requested") continue;
    const cat = r.category as string | null;
    if (!cat || !SPECIFIC_CATEGORIES.has(cat)) continue;
    const match = docs.find((d) => d.category === cat && !linkedDocIds.has(d.id));
    if (!match) continue;
    linkedDocIds.add(match.id);
    r.document_id = match.id;
    r.status = "received";
    await sb
      .from("company_requirements")
      .update({ document_id: match.id, status: "received", received_at: now, updated_at: now })
      .eq("id", r.id as number);
  }

  const items: CompanyChecklistRow[] = liveRows
    .map((r) => {
      const status = (r.status as RequirementStatus) ?? "missing";
      const doc = r.document_id ? docById.get(r.document_id as number) ?? null : null;
      const docStatus = doc?.status ?? null;
      return {
        id: r.id as number,
        label: r.label as string,
        category: (r.category as string | null) ?? null,
        mandatory: (r.mandatory as boolean | null) ?? true,
        expiryTracked: (r.expiry_tracked as boolean | null) ?? true,
        status,
        effectiveStatus: effectiveStatus(status, docStatus),
        documentId: (r.document_id as number | null) ?? null,
        documentTitle: doc?.title ?? null,
        docStatus,
        expiryLabel: doc?.expiryDate ? expiryLabel({ expiryDate: doc.expiryDate, reminderLeadDays: doc.reminderLeadDays }) : null,
        verifiedAt: (r.verified_at as string | null) ?? null,
        isCustom: (r.source_key as string | null) == null,
      };
    })
    .sort((a, b) => {
      const rank = (it: CompanyChecklistRow) =>
        (it.mandatory ? 0 : 100) +
        (it.effectiveStatus === "missing" ? 0 : it.effectiveStatus === "expired" ? 1 : it.effectiveStatus === "requested" ? 2 : it.effectiveStatus === "received" ? 3 : it.effectiveStatus === "expiring" ? 4 : it.effectiveStatus === "verified" ? 5 : 6);
      return rank(a) - rank(b);
    });

  const mandatory = items.filter((it) => it.mandatory && it.effectiveStatus !== "waived");
  const mandatoryVerified = mandatory.filter((it) => it.effectiveStatus === "verified" || it.effectiveStatus === "expiring").length;
  const missingMandatory = mandatory.filter((it) => it.effectiveStatus === "missing").length;
  const expiredMandatory = mandatory.filter((it) => it.effectiveStatus === "expired").length;
  const score = mandatory.length === 0 ? 100 : Math.round((mandatoryVerified / mandatory.length) * 100);

  return {
    companyId,
    score,
    band: complianceBand(score, expiredMandatory > 0),
    mandatoryTotal: mandatory.length,
    mandatoryVerified,
    missingMandatory,
    expiredMandatory,
    items,
  };
}

/* ------------------------------------------------------------------ */
/* Bulk read-only scoring — for Documents centre, Home and Brief.      */
/* Reads stored company_requirements + company documents WITHOUT       */
/* writing. Returns ComplianceScore-shaped objects so existing panels  */
/* (ComplianceSummaryCard, worstComplianceScores, …) work unchanged.   */
/* ------------------------------------------------------------------ */
type DocSummary = { id: number; title: string; category: string | null; status: DocStatus; expiryLabel: string | null };

/** Score an unseeded company against the synthesized default checklist. */
function synthDefaultScore(
  c: { id: number; name: string },
  companyDocs: DocSummary[],
  _docStatusById: Map<number, DocStatus>
): ComplianceScore {
  let mandatoryTotal = 0;
  let verified = 0;
  let expired = 0;
  let expiring = 0;
  const gaps: ComplianceGap[] = [];
  for (const def of COMPANY_DEFAULT_ITEMS) {
    if (def.mandatory === false) continue; // optional items don't affect the score
    mandatoryTotal++;
    const matches = companyDocs.filter((d) => d.category === def.category);
    const best =
      matches.find((d) => d.status === "Valid" || d.status === "No expiry") ??
      matches.find((d) => d.status === "Expiring") ??
      matches.find((d) => d.status === "Expired") ??
      null;
    if (!best) {
      gaps.push({ id: `creq-${c.id}-${def.label}`, label: def.label, categories: [def.category], ownerType: "company", appliesTo: "all", weight: 1, ownerId: c.id, ownerName: c.name });
      continue;
    }
    if (best.status === "Expired") {
      expired++;
      gaps.push({ id: `creq-${c.id}-${def.label}`, label: def.label, categories: [def.category], ownerType: "company", appliesTo: "all", weight: 1, ownerId: c.id, ownerName: c.name });
    } else {
      verified++;
      if (best.status === "Expiring") expiring++;
    }
  }
  const documentIssues: ComplianceDocumentIssue[] = companyDocs
    .filter((d) => d.status === "Expired" || d.status === "Expiring")
    .map((d) => ({ id: d.id, title: d.title, category: d.category, status: d.status as "Expired" | "Expiring", expiryLabel: d.expiryLabel }));
  const score = mandatoryTotal === 0 ? 100 : Math.round((verified / mandatoryTotal) * 100);
  return {
    ownerId: c.id, ownerName: c.name, ownerType: "company", score,
    required: mandatoryTotal, present: verified, missing: gaps.length, expired, expiring,
    monitoredDocuments: companyDocs.length, status: complianceBand(score, expired > 0), gaps, documentIssues,
  };
}

export async function buildCompanyRequirementScores(
  companies: Array<{ id: number; name: string }>
): Promise<ComplianceScore[]> {
  const ids = companies.map((c) => c.id);
  if (ids.length === 0) return [];
  const [{ data: reqRows }, { data: docRows }] = await Promise.all([
    sb.from("company_requirements").select("company_id,label,category,mandatory,status,document_id").in("company_id", ids),
    sb.from("documents").select("id,company_id,title,category,expiry_date,reminder_lead_days,archived").in("company_id", ids),
  ]);

  type Doc = { id: number; title: string; category: string | null; status: DocStatus; expiryLabel: string | null };
  const docsByCompany = new Map<number, Doc[]>();
  const docStatusById = new Map<number, DocStatus>();
  for (const d of docRows ?? []) {
    if (d.company_id == null || (d.archived as boolean)) continue;
    const expiryDate = d.expiry_date ? new Date(d.expiry_date as string) : null;
    const reminderLeadDays = (d.reminder_lead_days as number | null) ?? 30;
    const status = deriveDocStatus({ expiryDate, reminderLeadDays, archived: false });
    docStatusById.set(d.id as number, status);
    const list = docsByCompany.get(d.company_id as number) ?? [];
    list.push({ id: d.id as number, title: d.title as string, category: (d.category as string | null) ?? null, status, expiryLabel: expiryDate ? expiryLabel({ expiryDate, reminderLeadDays }) : null });
    docsByCompany.set(d.company_id as number, list);
  }

  // Companies that have any stored requirement row (even removed) are "seeded";
  // unseeded companies are scored against the synthesized default checklist so
  // their compliance isn't falsely 100% before anyone opens the File tab.
  const seededCompanies = new Set((reqRows ?? []).map((r) => r.company_id as number));
  const reqsByCompany = new Map<number, NonNullable<typeof reqRows>>();
  for (const r of reqRows ?? []) {
    if ((r.status as string) === "removed") continue;
    const cid = r.company_id as number;
    const list = reqsByCompany.get(cid) ?? [];
    list.push(r);
    reqsByCompany.set(cid, list);
  }

  return companies.map((c) => {
    const companyDocs = docsByCompany.get(c.id) ?? [];
    if (!seededCompanies.has(c.id)) {
      return synthDefaultScore(c, companyDocs, docStatusById);
    }
    const rows = reqsByCompany.get(c.id) ?? [];

    let mandatoryTotal = 0;
    let verified = 0;
    let expired = 0;
    let expiring = 0;
    const gaps: ComplianceGap[] = [];

    for (const r of rows) {
      const status = (r.status as RequirementStatus) ?? "missing";
      if (status === "waived") continue;
      const mandatory = (r.mandatory as boolean | null) ?? true;
      if (!mandatory) continue;
      mandatoryTotal++;
      const docStatus = r.document_id ? docStatusById.get(r.document_id as number) ?? null : null;
      const eff = effectiveStatus(status, docStatus);
      if (eff === "verified" || eff === "expiring") verified++;
      if (eff === "expiring") expiring++;
      if (eff === "expired") expired++;
      if (eff === "missing" || eff === "requested" || eff === "received" || eff === "expired") {
        gaps.push({
          id: `creq-${c.id}-${r.label as string}`,
          label: r.label as string,
          categories: r.category ? [r.category as string] : [],
          ownerType: "company",
          appliesTo: "all",
          weight: 1,
          ownerId: c.id,
          ownerName: c.name,
        });
      }
    }

    const documentIssues: ComplianceDocumentIssue[] = companyDocs
      .filter((d) => d.status === "Expired" || d.status === "Expiring")
      .map((d) => ({ id: d.id, title: d.title, category: d.category, status: d.status as "Expired" | "Expiring", expiryLabel: d.expiryLabel }));

    const score = mandatoryTotal === 0 ? 100 : Math.round((verified / mandatoryTotal) * 100);

    return {
      ownerId: c.id,
      ownerName: c.name,
      ownerType: "company",
      score,
      required: mandatoryTotal,
      present: verified,
      missing: gaps.length,
      expired,
      expiring,
      monitoredDocuments: companyDocs.length,
      status: complianceBand(score, expired > 0),
      gaps,
      documentIssues,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Mutations (called from server actions)                             */
/* ------------------------------------------------------------------ */
async function patch(id: number, fields: Record<string, unknown>) {
  const { error } = await sb
    .from("company_requirements")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function markCompanyRequirementRequested(id: number) {
  await patch(id, { status: "requested", requested_at: new Date().toISOString() });
}

export async function linkCompanyRequirementDocument(id: number, documentId: number) {
  await patch(id, { document_id: documentId, status: "received", received_at: new Date().toISOString() });
}

export async function unlinkCompanyRequirementDocument(id: number) {
  await patch(id, { document_id: null, status: "missing", verified_at: null, verified_by: null, auto_link: false });
}

export async function verifyCompanyRequirement(id: number) {
  await patch(id, { status: "verified", verified_at: new Date().toISOString(), verified_by: "web-ui" });
}

export async function unverifyCompanyRequirement(id: number) {
  await patch(id, { status: "received" });
}

export async function waiveCompanyRequirement(id: number, reason: string | null) {
  await patch(id, { status: "waived", waived_reason: reason });
}

export async function unwaiveCompanyRequirement(id: number) {
  await patch(id, { status: "missing", waived_reason: null });
}

/** Add a custom required document to one company's checklist (source_key null). */
export async function addCompanyRequirement(
  companyId: number,
  input: { label: string; category: string | null; mandatory: boolean }
) {
  const label = input.label.trim();
  if (!label) throw new Error("A name is required.");
  const now = new Date().toISOString();

  const { data: rows } = await sb
    .from("company_requirements")
    .select("id,label,status")
    .eq("company_id", companyId);
  const match = (rows ?? []).find((r) => (r.label as string).trim().toLowerCase() === label.toLowerCase());
  if (match) {
    if ((match.status as string) === "removed") {
      await patch(match.id as number, { status: "missing" });
      return;
    }
    throw new Error("That document is already on this company's checklist.");
  }

  const { error } = await sb.from("company_requirements").insert({
    company_id: companyId,
    source_key: null,
    label,
    category: input.category,
    mandatory: input.mandatory,
    expiry_tracked: true,
    status: "missing",
    created_at: now,
    updated_at: now,
  });
  if (error) throw new Error(error.message);
}

export async function editCompanyRequirement(
  id: number,
  input: { label: string; category: string | null; mandatory: boolean }
) {
  const label = input.label.trim();
  if (!label) throw new Error("A name is required.");
  await patch(id, { label, category: input.category, mandatory: input.mandatory });
}

/** Remove an item: custom items hard-delete; seeded items hide (status "removed"). */
export async function removeCompanyRequirement(id: number) {
  const { data: row } = await sb.from("company_requirements").select("source_key").eq("id", id).maybeSingle();
  if (!row) return;
  if ((row.source_key as string | null) == null) {
    const { error } = await sb.from("company_requirements").delete().eq("id", id);
    if (error) throw new Error(error.message);
  } else {
    await patch(id, { status: "removed", document_id: null });
  }
}

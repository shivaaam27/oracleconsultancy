import { sb } from "@/db/supabase";
import { deriveDocStatus, expiryLabel, worstDocStatus, DEFAULT_LEAD_DAYS, DOC_SHELVES, SHELF_CODE, shelfForCategory, type DocStatus } from "@/lib/documents-shared";
import { complianceBand, type ComplianceBand, type EffectiveStatus, type RequirementStatus } from "@/lib/requirements-shared";
import type { ComplianceScore, ComplianceGap, ComplianceDocumentIssue, ShelfCompliance } from "@/lib/compliance";

/** Roll a company's mandatory requirement items up into the 8 shelves — one pip
 *  per shelf for the compliance cards. A shelf with no required item is "na". */
function rollUpShelves(items: Array<{ category: string | null; eff: EffectiveStatus }>): ShelfCompliance[] {
  const unsatisfied = (e: EffectiveStatus) => e === "missing" || e === "requested" || e === "expired";
  return DOC_SHELVES.map((shelf) => {
    const mine = items.filter((it) => shelfForCategory(it.category) === shelf);
    const missing = mine.filter((it) => unsatisfied(it.eff)).length;
    const expiring = mine.some((it) => it.eff === "expiring");
    const status: ShelfCompliance["status"] =
      mine.length === 0 ? "na" : missing > 0 ? "missing" : expiring ? "expiring" : "complete";
    return { shelf, code: SHELF_CODE[shelf], status, missing, total: mine.length };
  });
}
import { matchDocumentsToItems } from "@/lib/requirement-match";
import { deriveFiling, CATALOGUE_COMPANY_REQ_KEYS } from "@/lib/doc-catalog";
import { logCompanyRequirementEvent } from "@/lib/compliance-audit";

/* ------------------------------------------------------------------ */
/* Per-company document compliance checklist (DB-backed).              */
/* Unlike people (shared type templates), each company owns its list.  */
/* Seeded with the core statutory documents, then fully editable per   */
/* company — add VRN, extra registrations, remove what doesn't apply.  */
/* ------------------------------------------------------------------ */

// `applies`: undefined = every company; "vat" = only VAT-registered (has a VRN);
// "sector" = only sector-regulated companies (construction/industrial, e.g. PES).
// Non-applicable items are simply not on that company's checklist — so a company
// is never marked short of a document it doesn't need.
type SeedItem = { key: string; label: string; category: string; mandatory?: boolean; applies?: "vat" | "sector" };

// The statutory registration checklist (per the COS Command Centre handover —
// one row per authority a Tanzanian company must be current with). VAT and the
// sector permit are optional ("if applicable"); the rest are mandatory. The
// operator can still add/remove per company.
export const COMPANY_DEFAULT_ITEMS: SeedItem[] = [
  { key: "company-registration", label: "Certificate of Incorporation (BRELA)", category: "Registration" },
  { key: "memarts", label: "Memorandum & Articles (MEMARTS)", category: "Legal" },
  { key: "tax-registration", label: "TIN (Taxpayer ID)", category: "Tax" },
  { key: "vat-registration", label: "VAT Certificate", category: "Tax", applies: "vat" },
  { key: "business-licence", label: "Business / trading licence", category: "Licence" },
  { key: "tax-clearance", label: "Tax Clearance Certificate (TRA)", category: "Tax" },
  { key: "ubo-register", label: "Beneficial Ownership (UBO) register — BRELA", category: "Registration" },
  { key: "annual-return", label: "BRELA Annual Return (filed)", category: "Registration" },
  // Employer registrations → People & HR shelf.
  { key: "paye-sdl-registration", label: "PAYE / SDL employer registration", category: "HR" },
  { key: "nssf-registration", label: "NSSF employer registration", category: "HR" },
  { key: "wcf-registration", label: "WCF employer registration", category: "HR" },
  // Sector-regulated (construction/industrial, e.g. PES) only → Licences & Permits.
  { key: "contractor-registration", label: "Contractor registration (CRB)", category: "Permit", applies: "sector" },
  { key: "local-content", label: "Local Content Plan approval", category: "Permit", applies: "sector" },
  { key: "osha-registration", label: "OSHA certificate", category: "Permit", applies: "sector" },
  { key: "fire-certificate", label: "Fire safety certificate", category: "Permit", applies: "sector" },
  { key: "audited-accounts", label: "Annual audited accounts + income-tax return", category: "Tax", mandatory: false },
  { key: "premises-lease", label: "Premises lease / title (current)", category: "Lease", mandatory: false },
  { key: "bank-account", label: "Company bank account & signatories", category: "Banking" },
  { key: "statutory-registers", label: "Statutory registers up to date", category: "Registration" },
];

/* ------------------------------------------------------------------ */
/* Seeding / reconciliation                                            */
/* ------------------------------------------------------------------ */
/**
 * Insert any missing seed items for a company. Items the operator removed are
 * kept hidden (status "removed") so they aren't resurrected. Idempotent.
 */
/** The default items that APPLY to a company given its VAT/sector status — so a
 *  non-VAT company never carries a VAT requirement, and only sector-regulated
 *  companies carry the contractor/OSHA/local-content/fire set. */
export function applicableCompanyItems(company: { vrn?: string | null; sectorRegulated?: boolean | null }): SeedItem[] {
  const hasVat = !!(company.vrn && String(company.vrn).trim());
  const isSector = !!company.sectorRegulated;
  return COMPANY_DEFAULT_ITEMS.filter((it) =>
    it.applies === "vat" ? hasVat : it.applies === "sector" ? isSector : true,
  );
}

/**
 * Sync a company's checklist to its CURRENT VAT/sector status (call after the
 * profile toggle changes): add any newly-applicable statutory items, hide seeded
 * items that no longer apply (only when nothing is filed against them), and
 * re-surface a previously-hidden item that applies again. Custom items and items
 * with a linked document are never touched. Idempotent.
 */
export async function syncCompanyRequirementApplicability(companyId: number): Promise<void> {
  await ensureCompanyRequirements(companyId); // add any newly-applicable items
  const { data: co } = await sb.from("companies").select("vrn,sector_regulated").eq("id", companyId).maybeSingle();
  const applicable = new Set(
    applicableCompanyItems({ vrn: co?.vrn as string | null, sectorRegulated: co?.sector_regulated as boolean | null }).map((it) => it.key),
  );
  const { data: rows } = await sb
    .from("company_requirements")
    .select("id,source_key,status,document_id")
    .eq("company_id", companyId);
  const now = new Date().toISOString();
  for (const r of rows ?? []) {
    const key = r.source_key as string | null;
    if (!key || r.document_id != null) continue; // custom or already-filed → leave it
    const status = r.status as string;
    if (!applicable.has(key) && status !== "removed") {
      await sb.from("company_requirements").update({ status: "removed", document_id: null, updated_at: now }).eq("id", r.id as number);
    } else if (applicable.has(key) && status === "removed") {
      await sb.from("company_requirements").update({ status: "missing", updated_at: now }).eq("id", r.id as number);
    }
  }
}

export async function ensureCompanyRequirements(companyId: number): Promise<void> {
  const [{ data: rows }, { data: co }] = await Promise.all([
    sb.from("company_requirements").select("source_key").eq("company_id", companyId),
    sb.from("companies").select("vrn,sector_regulated").eq("id", companyId).maybeSingle(),
  ]);
  const haveKeys = new Set((rows ?? []).map((r) => r.source_key as string | null).filter(Boolean));
  const now = new Date().toISOString();
  const items = applicableCompanyItems({ vrn: co?.vrn as string | null, sectorRegulated: co?.sector_regulated as boolean | null });
  const toInsert = items.filter((it) => !haveKeys.has(it.key)).map((it) => ({
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

/**
 * Seed the statutory checklist for any company that has no requirement rows yet.
 * One query to find which companies are already seeded, then ensure only the
 * rest — so companies score from stored rows consistently (not the synthesized
 * default) before anyone first opens their File tab. Cheap + idempotent: after
 * the first run every company is seeded and this just does the one lookup.
 */
export async function ensureAllCompanyRequirements(companyIds: number[]): Promise<{ seeded: number }> {
  if (companyIds.length === 0) return { seeded: 0 };
  // Top-up EVERY company with any default item it doesn't have a row for (by
  // source_key) — so newly-added statutory items (e.g. UBO register, annual
  // return) appear on existing companies too, not just brand-new ones. A removed
  // item keeps its source_key row, so it is never resurrected. One read + one write.
  const [{ data }, { data: cos }] = await Promise.all([
    sb.from("company_requirements").select("company_id,source_key").in("company_id", companyIds),
    sb.from("companies").select("id,vrn,sector_regulated").in("id", companyIds),
  ]);
  const have = new Set((data ?? []).map((r) => `${r.company_id}:${r.source_key ?? ""}`));
  const coById = new Map((cos ?? []).map((c) => [c.id as number, c]));
  const now = new Date().toISOString();
  const toInsert: Record<string, unknown>[] = [];
  for (const cid of companyIds) {
    const co = coById.get(cid);
    const items = applicableCompanyItems({ vrn: co?.vrn as string | null, sectorRegulated: co?.sector_regulated as boolean | null });
    for (const it of items) {
      if (have.has(`${cid}:${it.key}`)) continue;
      toInsert.push({
        company_id: cid, source_key: it.key, label: it.label, category: it.category,
        mandatory: it.mandatory ?? true, expiry_tracked: true, status: "missing",
        created_at: now, updated_at: now,
      });
    }
  }
  if (toInsert.length) await sb.from("company_requirements").insert(toInsert);
  return { seeded: toInsert.length };
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
  reviewDate: string | null;
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
  fileName: string | null;
  category: string | null;
  docType: string | null;
  expiryDate: Date | null;
  reminderLeadDays: number;
  status: DocStatus;
};

async function loadCompanyDocuments(companyId: number): Promise<CompanyDocRow[]> {
  const { data } = await sb
    .from("documents")
    .select("id,title,file_name,category,doc_type,expiry_date,reminder_lead_days,archived")
    .eq("company_id", companyId)
    .eq("archived", false);
  return (data ?? []).map((d) => {
    const expiryDate = d.expiry_date ? new Date(d.expiry_date as string) : null;
    const reminderLeadDays = (d.reminder_lead_days as number | null) ?? 30;
    return {
      id: d.id as number,
      title: d.title as string,
      fileName: (d.file_name as string | null) ?? null,
      category: (d.category as string | null) ?? null,
      docType: (d.doc_type as string | null) ?? null,
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

/** The catalogue company-requirement key a document satisfies (deterministically),
 *  or null — trying the filename/title first, then the STORED doc_type captured at
 *  intake, so a correctly-classified but badly-named scan ("Scan_2093.pdf" whose
 *  type is "Business Licence") still links + auto-verifies. Also reports the
 *  filename EXP date and whether it's an -OLD copy. */
function docCatalogueReqKey(doc: { fileName: string | null; title: string; docType: string | null }): { reqKey: string | null; isOld: boolean; expiry: Date | null } {
  const f = deriveFiling(doc.fileName, doc.title);
  const expiry = f.expiry ? new Date(`${f.expiry}T00:00:00Z`) : null;
  if (f.isOld) return { reqKey: null, isOld: true, expiry };
  if (f.companyReqKey) return { reqKey: f.companyReqKey, isOld: false, expiry };
  // Filename/title gave no type → trust the catalogue type captured at intake.
  if (doc.docType) {
    const byType = deriveFiling(doc.docType, null);
    if (byType.companyReqKey && !byType.isOld) return { reqKey: byType.companyReqKey, isOld: false, expiry };
  }
  return { reqKey: null, isOld: false, expiry };
}

type LinkItem = { id: number; sourceKey: string | null; label: string; category: string | null };
type LinkDoc = { id: number; fileName: string | null; title: string; category: string | null; docType: string | null; expiryDate: Date | null };

/** ONE linker shared by the per-company checklist AND the bulk portfolio/Home/Brief
 *  scores, so the two ALWAYS agree (they used to use different matchers → different
 *  numbers). DETERMINISTIC catalogue-type pass first (confident → the caller marks
 *  it verified); then a fuzzy fallback ONLY for requirements the catalogue doesn't
 *  own (→ received). A catalogue-owned requirement with no matching type stays
 *  missing rather than grabbing a loosely-related document. Each doc + item used once. */
function linkDocsToRequirements(items: LinkItem[], docs: LinkDoc[]): Map<number, { docId: number; confident: boolean }> {
  const out = new Map<number, { docId: number; confident: boolean }>();
  const used = new Set<number>();
  for (const item of items) {
    if (!item.sourceKey) continue;
    const hit = docs.find((d) => {
      if (used.has(d.id)) return false;
      const { reqKey, isOld, expiry } = docCatalogueReqKey(d);
      if (isOld || reqKey !== item.sourceKey) return false;
      const exp = expiry ?? d.expiryDate;
      return !exp || exp.getTime() > Date.now();
    });
    if (hit) { out.set(item.id, { docId: hit.id, confident: true }); used.add(hit.id); }
  }
  const remainingItems = items.filter((i) => !out.has(i.id) && !(i.sourceKey && CATALOGUE_COMPANY_REQ_KEYS.has(i.sourceKey)));
  const remainingDocs = docs.filter((d) => !used.has(d.id)).map((d) => ({ id: d.id, title: d.title, category: d.category, docType: d.docType }));
  for (const [reqId, docId] of matchDocumentsToItems(remainingItems.map((i) => ({ id: i.id, label: i.label, category: i.category })), remainingDocs)) {
    if (!out.has(reqId) && !used.has(docId)) { out.set(reqId, { docId, confident: false }); used.add(docId); }
  }
  return out;
}

/** Generate (if needed), auto-link saved company documents, derive status, score. */
export async function getCompanyChecklist(companyId: number): Promise<CompanyChecklist> {
  await ensureCompanyRequirements(companyId);

  const [{ data: rows }, docs] = await Promise.all([
    sb
      .from("company_requirements")
      .select("id,source_key,label,category,mandatory,expiry_tracked,status,document_id,verified_at,auto_link,review_date")
      .eq("company_id", companyId),
    loadCompanyDocuments(companyId),
  ]);

  const liveRows = (rows ?? []).filter((r) => (r.status as string) !== "removed");
  const docById = new Map(docs.map((d) => [d.id, d]));
  const linkedDocIds = new Set(
    liveRows.map((r) => r.document_id as number | null).filter((x): x is number => x != null)
  );

  // Auto-link un-actioned items to saved documents by label + title/type,
  // assigned globally best-first so several same-category items (e.g. the six
  // statutory "Registration" rows) each grab the right document, not a random one.
  const now = new Date().toISOString();
  const candidateItems = liveRows
    .filter(
      (r) =>
        !r.document_id &&
        (r.auto_link as boolean | null) !== false &&
        (r.status === "missing" || r.status === "requested")
    )
    .map((r) => ({ id: r.id as number, sourceKey: (r.source_key as string | null) ?? null, label: r.label as string, category: (r.category as string | null) ?? null }));
  const availableDocs = docs.filter((d) => !linkedDocIds.has(d.id));

  // Link by KNOWN document type (catalogue) first, then a fuzzy fallback for the
  // non-catalogue items — the one shared linker the portfolio scores use too, so
  // a business licence satisfies "Business / trading licence" (never "VAT") and an
  // expired/-OLD copy never verifies anything.
  const links = linkDocsToRequirements(
    candidateItems.map((i) => ({ id: i.id, sourceKey: i.sourceKey, label: i.label, category: i.category })),
    availableDocs.map((d) => ({ id: d.id, fileName: d.fileName, title: d.title, category: d.category, docType: d.docType, expiryDate: d.expiryDate })),
  );
  for (const r of liveRows) {
    const link = links.get(r.id as number);
    if (!link) continue;
    const docId = link.docId;
    linkedDocIds.add(docId);
    r.document_id = docId;
    // A deterministic (exact catalogue-type) match is high-confidence → auto-VERIFY
    // it (green, no manual tick needed). A fuzzy match only reaches "received", so
    // it still asks for a human confirmation.
    const confident = link.confident;
    r.status = confident ? "verified" : "received";
    await sb
      .from("company_requirements")
      .update(
        confident
          ? { document_id: docId, status: "verified", received_at: now, verified_at: now, verified_by: "auto-catalogue", updated_at: now }
          : { document_id: docId, status: "received", received_at: now, updated_at: now },
      )
      .eq("id", r.id as number);
    await logCompanyRequirementEvent(r.id as number, confident ? "verified" : "linked", {
      documentId: docId,
      detail: docById.get(docId)?.title ?? null,
      ownerId: companyId,
      label: r.label as string,
      createdBy: "auto-link",
    });
  }

  const items: CompanyChecklistRow[] = liveRows
    .map((r) => {
      const status = (r.status as RequirementStatus) ?? "missing";
      const doc = r.document_id ? docById.get(r.document_id as number) ?? null : null;
      const cat = (r.category as string | null) ?? null;
      const reviewDate = r.review_date ? new Date(r.review_date as string) : null;
      const reviewLead = (cat && DEFAULT_LEAD_DAYS[cat]) || 30;
      const reviewStatus = reviewDate ? deriveDocStatus({ expiryDate: reviewDate, reminderLeadDays: reviewLead }) : null;
      const combinedStatus = worstDocStatus(doc?.status ?? null, reviewStatus);
      const labelSource =
        reviewStatus && combinedStatus === reviewStatus && reviewStatus !== "Valid" && reviewStatus !== "No expiry"
          ? { expiryDate: reviewDate!, reminderLeadDays: reviewLead }
          : doc?.expiryDate
          ? { expiryDate: doc.expiryDate, reminderLeadDays: doc.reminderLeadDays }
          : reviewDate
          ? { expiryDate: reviewDate, reminderLeadDays: reviewLead }
          : null;
      return {
        id: r.id as number,
        label: r.label as string,
        category: cat,
        mandatory: (r.mandatory as boolean | null) ?? true,
        expiryTracked: (r.expiry_tracked as boolean | null) ?? true,
        status,
        effectiveStatus: effectiveStatus(status, combinedStatus),
        documentId: (r.document_id as number | null) ?? null,
        documentTitle: doc?.title ?? null,
        docStatus: combinedStatus,
        expiryLabel: labelSource ? expiryLabel(labelSource) : null,
        verifiedAt: (r.verified_at as string | null) ?? null,
        reviewDate: reviewDate ? reviewDate.toISOString() : null,
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
  // "received" (a compulsory doc auto-linked on upload) counts toward the score —
  // filing a required document raises company compliance on its own; the manual
  // "Verify" tick is an optional audit confirmation, not a gate.
  const mandatoryVerified = mandatory.filter((it) => it.effectiveStatus === "verified" || it.effectiveStatus === "expiring" || it.effectiveStatus === "received").length;
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
type DocSummary = { id: number; title: string; fileName: string | null; category: string | null; docType: string | null; status: DocStatus; expiryLabel: string | null; expiryDate: Date | null };

/**
 * Score a company that has no stored requirement rows yet against its APPLICABLE
 * default checklist (respecting VAT/sector — not the whole generic list) using the
 * SAME deterministic catalogue linker as the seeded path. So an unseeded company's
 * portfolio score matches what it will show once its File tab is opened, and a
 * filed business licence counts by TYPE (not a broad category guess).
 */
function synthDefaultScore(
  c: { id: number; name: string },
  meta: { vrn: string | null; sectorRegulated: boolean | null } | undefined,
  companyDocs: DocSummary[]
): ComplianceScore {
  const items = applicableCompanyItems({ vrn: meta?.vrn ?? null, sectorRegulated: meta?.sectorRegulated ?? null })
    .map((it, i) => ({ id: i + 1, sourceKey: it.key, label: it.label, category: it.category, mandatory: it.mandatory ?? true }));
  const links = linkDocsToRequirements(items, companyDocs);
  const docById = new Map(companyDocs.map((d) => [d.id, d]));
  let mandatoryTotal = 0;
  let verified = 0;
  let expired = 0;
  let expiring = 0;
  const gaps: ComplianceGap[] = [];
  const shelfItems: Array<{ category: string | null; eff: EffectiveStatus }> = [];
  const gap = (label: string, category: string) => gaps.push({ id: `creq-${c.id}-${label}`, label, categories: [category], ownerType: "company", appliesTo: "all", weight: 1, ownerId: c.id, ownerName: c.name });
  for (const it of items) {
    if (!it.mandatory) continue; // optional items don't affect the score
    mandatoryTotal++;
    const link = links.get(it.id);
    const doc = link ? docById.get(link.docId) ?? null : null;
    if (!doc) { gap(it.label, it.category); shelfItems.push({ category: it.category, eff: "missing" }); continue; }
    if (doc.status === "Expired") { expired++; gap(it.label, it.category); shelfItems.push({ category: it.category, eff: "expired" }); }
    else { verified++; if (doc.status === "Expiring") expiring++; shelfItems.push({ category: it.category, eff: doc.status === "Expiring" ? "expiring" : "verified" }); }
  }
  const documentIssues: ComplianceDocumentIssue[] = companyDocs
    .filter((d) => d.status === "Expired" || d.status === "Expiring")
    .map((d) => ({ id: d.id, title: d.title, category: d.category, status: d.status as "Expired" | "Expiring", expiryLabel: d.expiryLabel }));
  const score = mandatoryTotal === 0 ? 100 : Math.round((verified / mandatoryTotal) * 100);
  return {
    ownerId: c.id, ownerName: c.name, ownerType: "company", shelves: rollUpShelves(shelfItems), score,
    required: mandatoryTotal, present: verified, missing: Math.max(0, gaps.length - expired), inProgress: 0, expired, expiring,
    monitoredDocuments: companyDocs.length, status: complianceBand(score, expired > 0), gaps, documentIssues,
  };
}

export async function buildCompanyRequirementScores(
  companies: Array<{ id: number; name: string }>
): Promise<ComplianceScore[]> {
  const ids = companies.map((c) => c.id);
  if (ids.length === 0) return [];
  const [{ data: reqRows }, { data: docRows }, { data: coMeta }] = await Promise.all([
    sb.from("company_requirements").select("id,company_id,source_key,label,category,mandatory,status,document_id,auto_link,review_date").in("company_id", ids),
    sb.from("documents").select("id,company_id,title,file_name,category,doc_type,expiry_date,reminder_lead_days,archived").in("company_id", ids),
    sb.from("companies").select("id,vrn,sector_regulated").in("id", ids),
  ]);
  const metaById = new Map((coMeta ?? []).map((c) => [c.id as number, { vrn: c.vrn as string | null, sectorRegulated: c.sector_regulated as boolean | null }]));

  type Doc = { id: number; title: string; fileName: string | null; category: string | null; docType: string | null; status: DocStatus; expiryLabel: string | null; expiryDate: Date | null };
  const docsByCompany = new Map<number, Doc[]>();
  const docStatusById = new Map<number, DocStatus>();
  for (const d of docRows ?? []) {
    if (d.company_id == null || (d.archived as boolean)) continue;
    const expiryDate = d.expiry_date ? new Date(d.expiry_date as string) : null;
    const reminderLeadDays = (d.reminder_lead_days as number | null) ?? 30;
    const status = deriveDocStatus({ expiryDate, reminderLeadDays, archived: false });
    docStatusById.set(d.id as number, status);
    const list = docsByCompany.get(d.company_id as number) ?? [];
    list.push({ id: d.id as number, title: d.title as string, fileName: (d.file_name as string | null) ?? null, category: (d.category as string | null) ?? null, docType: (d.doc_type as string | null) ?? null, status, expiryLabel: expiryDate ? expiryLabel({ expiryDate, reminderLeadDays }) : null, expiryDate });
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

  // PURE READ: auto-link un-actioned rows to saved documents IN MEMORY ONLY so
  // the bulk scores (Documents centre / Home / Brief / cron) reflect uploaded
  // documents immediately — but DO NOT persist here. These scores are read from
  // render/GET/cron paths, so writing (link rows + audit inserts) would make a
  // "read" mutate state and double-write under concurrent renders (ACTDOCS-02).
  // The persisted auto-link lives at save time only: reconcileOwnerCompliance →
  // getCompanyChecklist runs on every document create/update/archive, mirroring
  // the person side. Here we only mirror the same matching so scoring agrees.
  for (const c of companies) {
    const rows = reqsByCompany.get(c.id);
    if (!rows || rows.length === 0) continue;
    const companyDocs = docsByCompany.get(c.id) ?? [];
    const linkedDocIds = new Set(
      rows.map((r) => r.document_id as number | null).filter((x): x is number => x != null)
    );
    const candidateItems: LinkItem[] = rows
      .filter(
        (r) =>
          !r.document_id &&
          (r.auto_link as boolean | null) !== false &&
          (r.status === "missing" || r.status === "requested")
      )
      .map((r) => ({ id: r.id as number, sourceKey: (r.source_key as string | null) ?? null, label: r.label as string, category: (r.category as string | null) ?? null }));
    if (candidateItems.length === 0) continue;
    const candidateDocs: LinkDoc[] = companyDocs
      .filter((d) => !linkedDocIds.has(d.id))
      .map((d) => ({ id: d.id, fileName: d.fileName, title: d.title, category: d.category, docType: d.docType, expiryDate: d.expiryDate }));
    // The SAME linker the detail checklist uses — deterministic (verified) + fuzzy
    // for non-catalogue (received). No DB write; persistence is at save time.
    const links = linkDocsToRequirements(candidateItems, candidateDocs);
    for (const r of rows) {
      const link = links.get(r.id as number);
      if (!link) continue;
      linkedDocIds.add(link.docId);
      r.document_id = link.docId;
      r.status = link.confident ? "verified" : "received";
    }
  }

  return companies.map((c) => {
    const companyDocs = docsByCompany.get(c.id) ?? [];
    if (!seededCompanies.has(c.id)) {
      return synthDefaultScore(c, metaById.get(c.id), companyDocs);
    }
    const rows = reqsByCompany.get(c.id) ?? [];

    let mandatoryTotal = 0;
    let verified = 0;
    let expired = 0;
    let expiring = 0;
    let inProgress = 0;
    const gaps: ComplianceGap[] = [];
    const shelfItems: Array<{ category: string | null; eff: EffectiveStatus }> = [];

    for (const r of rows) {
      const status = (r.status as RequirementStatus) ?? "missing";
      if (status === "waived") continue;
      const mandatory = (r.mandatory as boolean | null) ?? true;
      if (!mandatory) continue;
      mandatoryTotal++;
      const docStatus = r.document_id ? docStatusById.get(r.document_id as number) ?? null : null;
      const cat = r.category as string | null;
      const reviewDate = r.review_date ? new Date(r.review_date as string) : null;
      const reviewStatus = reviewDate
        ? deriveDocStatus({ expiryDate: reviewDate, reminderLeadDays: (cat && DEFAULT_LEAD_DAYS[cat]) || 30 })
        : null;
      const eff = effectiveStatus(status, worstDocStatus(docStatus, reviewStatus));
      shelfItems.push({ category: cat, eff });
      // "received" (auto-linked compulsory doc) counts as present — mirrors the
      // per-company scorer, so filing a required document raises compliance on its own.
      if (eff === "verified" || eff === "expiring" || eff === "received") verified++;
      if (eff === "expiring") expiring++;
      if (eff === "expired") expired++;
      if (eff === "requested") inProgress++;
      if (eff === "missing" || eff === "requested" || eff === "expired") {
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
      shelves: rollUpShelves(shelfItems),
      score,
      required: mandatoryTotal,
      present: verified,
      // Genuinely absent only — expired is shown separately, so don't double-count.
      missing: Math.max(0, gaps.length - inProgress - expired),
      inProgress,
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
  await logCompanyRequirementEvent(id, "requested");
}

export async function linkCompanyRequirementDocument(id: number, documentId: number) {
  await patch(id, { document_id: documentId, status: "received", received_at: new Date().toISOString() });
  const { data: doc } = await sb.from("documents").select("title").eq("id", documentId).maybeSingle();
  await logCompanyRequirementEvent(id, "linked", { documentId, detail: (doc?.title as string | null) ?? null });
}

export async function unlinkCompanyRequirementDocument(id: number) {
  await patch(id, { document_id: null, status: "missing", verified_at: null, verified_by: null, auto_link: false });
  await logCompanyRequirementEvent(id, "unlinked");
}

export async function verifyCompanyRequirement(id: number) {
  await patch(id, { status: "verified", verified_at: new Date().toISOString(), verified_by: "web-ui" });
  await logCompanyRequirementEvent(id, "verified");
}

export async function unverifyCompanyRequirement(id: number) {
  await patch(id, { status: "received" });
  await logCompanyRequirementEvent(id, "unverified");
}

export async function waiveCompanyRequirement(id: number, reason: string | null) {
  await patch(id, { status: "waived", waived_reason: reason });
  await logCompanyRequirementEvent(id, "waived", { detail: reason });
}

export async function unwaiveCompanyRequirement(id: number) {
  await patch(id, { status: "missing", waived_reason: null });
  await logCompanyRequirementEvent(id, "unwaived");
}

/** Set or clear the requirement's own "valid until / review by" date (ISO or null). */
export async function setCompanyRequirementReviewDate(id: number, reviewDate: string | null) {
  await patch(id, { review_date: reviewDate });
  await logCompanyRequirementEvent(id, "edited", {
    detail: reviewDate ? `Review date set to ${reviewDate.slice(0, 10)}` : "Review date cleared",
  });
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
      await logCompanyRequirementEvent(match.id as number, "added", { ownerId: companyId, label });
      return;
    }
    throw new Error("That document is already on this company's checklist.");
  }

  const { data: inserted, error } = await sb
    .from("company_requirements")
    .insert({
      company_id: companyId,
      source_key: null,
      label,
      category: input.category,
      mandatory: input.mandatory,
      expiry_tracked: true,
      status: "missing",
      created_at: now,
      updated_at: now,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await logCompanyRequirementEvent(inserted.id as number, "added", { ownerId: companyId, label });
}

export async function editCompanyRequirement(
  id: number,
  input: { label: string; category: string | null; mandatory: boolean }
) {
  const label = input.label.trim();
  if (!label) throw new Error("A name is required.");
  await patch(id, { label, category: input.category, mandatory: input.mandatory });
  await logCompanyRequirementEvent(id, "edited", { label });
}

/** Remove an item: custom items hard-delete; seeded items hide (status "removed"). */
export async function removeCompanyRequirement(id: number) {
  const { data: row } = await sb
    .from("company_requirements")
    .select("source_key,company_id,label")
    .eq("id", id)
    .maybeSingle();
  if (!row) return;
  await logCompanyRequirementEvent(id, "removed", {
    ownerId: (row.company_id as number | null) ?? undefined,
    label: (row.label as string | null) ?? undefined,
  });
  if ((row.source_key as string | null) == null) {
    const { error } = await sb.from("company_requirements").delete().eq("id", id);
    if (error) throw new Error(error.message);
  } else {
    await patch(id, { status: "removed", document_id: null });
  }
}

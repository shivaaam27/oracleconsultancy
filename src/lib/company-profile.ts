import { sb } from "@/db/supabase";
import { deriveDocStatus, expiryLabel, type DocStatus, type DocumentRow } from "@/lib/documents-shared";
import { reindexEntity } from "@/lib/index-hooks";

/* ------------------------------------------------------------------ */
/* Company profile auto-fill + key-document derivation.                */
/* Filing a company document backfills the matching BLANK profile      */
/* field (never overwrites). The Key documents panel is derived live   */
/* from the filed documents, so anything on file shows in the profile. */
/* ------------------------------------------------------------------ */

const VRN_RE = /\b(vrn|vat)\b/i;

type DocFacts = {
  category: string | null;
  title: string | null;
  referenceNo: string | null;
  issueDate: Date | string | null;
};

/**
 * Fill blank company profile fields from a just-saved company document.
 * Registration → registration_no (+ incorporation_date from issue date);
 * Tax titled VRN/VAT → vrn; other Tax → tin. Blanks-only, never overwrites.
 */
export async function backfillCompanyProfileFromDocument(companyId: number, doc: DocFacts): Promise<void> {
  const cat = (doc.category ?? "").toLowerCase();
  const ref = doc.referenceNo?.trim() || null;
  const patch: Record<string, unknown> = {};

  if (cat === "registration") {
    if (ref) patch.registration_no = ref;
    if (doc.issueDate) patch.incorporation_date = doc.issueDate instanceof Date ? doc.issueDate.toISOString() : doc.issueDate;
  } else if (cat === "tax") {
    if (ref) {
      if (VRN_RE.test(doc.title ?? "")) patch.vrn = ref;
      else patch.tin = ref;
    }
  }
  if (Object.keys(patch).length === 0) return;

  // Only fill columns that are currently blank.
  const { data: company } = await sb
    .from("companies")
    .select("registration_no,tin,vrn,incorporation_date")
    .eq("id", companyId)
    .maybeSingle();
  if (!company) return;

  const blanks: Record<string, unknown> = {};
  if (patch.registration_no && !company.registration_no) blanks.registration_no = patch.registration_no;
  if (patch.incorporation_date && !company.incorporation_date) blanks.incorporation_date = patch.incorporation_date;
  if (patch.tin && !company.tin) blanks.tin = patch.tin;
  if (patch.vrn && !company.vrn) blanks.vrn = patch.vrn;
  if (Object.keys(blanks).length === 0) return;

  await sb.from("companies").update(blanks).eq("id", companyId);
  // The company is now searchable by its just-filled TIN/VRN/registration —
  // reindex immediately instead of waiting for the nightly catch-all. Best-effort.
  void reindexEntity("company", companyId);
}

/* ------------------------------------------------------------------ */
/* Key documents panel (derived, read-only)                            */
/* ------------------------------------------------------------------ */
export type KeyDocumentRow = {
  key: string;
  label: string;
  /** The headline number (typed profile value, or the document's reference). */
  value: string | null;
  documentId: number | null;
  documentTitle: string | null;
  status: DocStatus | null;
  expiryLabel: string | null;
};

export type CompanyProfileNumbers = {
  registrationNo: string | null;
  tin: string | null;
  vrn: string | null;
};

function pickDoc(docs: DocumentRow[], match: (d: DocumentRow) => boolean): DocumentRow | null {
  const hits = docs.filter(match);
  if (hits.length === 0) return null;
  // Prefer a valid/non-expired one, else the first.
  return (
    hits.find((d) => { const s = deriveDocStatus(d); return s === "Valid" || s === "No expiry"; }) ??
    hits.find((d) => deriveDocStatus(d) === "Expiring") ??
    hits[0]
  );
}

const isCat = (d: DocumentRow, c: string) => (d.category ?? "").toLowerCase() === c;

/** Build the named key-document rows from this company's filed documents. */
export function buildCompanyKeyDocuments(docs: DocumentRow[], numbers: CompanyProfileNumbers): KeyDocumentRow[] {
  const row = (key: string, label: string, doc: DocumentRow | null, typed: string | null): KeyDocumentRow => ({
    key,
    label,
    value: typed || doc?.referenceNo || null,
    documentId: doc?.id ?? null,
    documentTitle: doc?.title ?? null,
    status: doc ? deriveDocStatus(doc) : null,
    expiryLabel: doc ? expiryLabel(doc) : null,
  });

  // Match on what the owner typed — the document's own type, title and category.
  // The auto-classifying catalogue went with the rest of the intake brain, so
  // "which document is the TIN certificate" is now a plain text match.
  const byWords = (re: RegExp) =>
    pickDoc(docs, (d) => re.test(`${d.docType ?? ""} ${d.title} ${d.category ?? ""}`));
  const registration = byWords(/incorporat|registration certificate/i);
  const vrnDoc = byWords(/\bvrn\b|\bvat\b/i);
  const tinDoc = byWords(/\btin\b/i);
  const licence = byWords(/licen[cs]e/i);
  const lease = byWords(/lease/i);

  return [
    row("registration", "Registration", registration, numbers.registrationNo),
    row("tin", "TIN", tinDoc, numbers.tin),
    row("vrn", "VRN / VAT", vrnDoc, numbers.vrn),
    row("licence", "Business licence", licence, null),
    row("lease", "Lease agreement", lease, null),
  ];
}

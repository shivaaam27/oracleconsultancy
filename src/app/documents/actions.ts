"use server";

import { GROQ_FAST, GROQ_VISION } from "@/lib/ai-models";
import { revalidatePath, updateTag } from "next/cache";
import { sb } from "@/db/supabase";
import {
  createDocument,
  updateDocument,
  setDocumentArchived,
  linkDocumentTask,
  uploadDocumentFile,
  removeDocumentFile,
  signDocumentFile,
  type DocumentInput,
} from "@/lib/documents";
import { sb as supa } from "@/db/supabase";
import { insertTaskWithUniqueCodeSb } from "@/lib/db-helpers";
import { getGroqKey } from "@/lib/settings";
import { DOC_CATEGORIES, deriveDocStatus, expiryLabel } from "@/lib/documents-shared";
import { backfillCompanyProfileFromDocument } from "@/lib/company-profile";
import { buildCompanyRequirementScores, getCompanyChecklist } from "@/lib/company-requirements";
import { buildPersonRequirementScores, getPersonChecklist } from "@/lib/requirements";
import { buildComplianceCsv, complianceCsvFilename } from "@/lib/compliance-export";
import type { PersonProfileFields } from "@/app/people/actions";
import type { CompanyProfileFields } from "@/app/companies/[id]/actions";

export type OwnerDocMatch = {
  id: number;
  title: string;
  status: "Valid" | "Expiring" | "Expired" | "No expiry" | "Archived";
  expiryLabel: string | null;
  expiryDate: string | null;
};

/**
 * Existing (non-archived) documents for an owner + category — used to warn
 * about duplicates before saving, so a re-sent/older copy never silently
 * replaces a newer one.
 */
export async function findOwnerDocuments(
  owner: { kind: "company" | "person"; id: number },
  category: string
): Promise<OwnerDocMatch[]> {
  if (!category || !owner?.id) return [];
  const col = owner.kind === "company" ? "company_id" : "person_id";
  const { data } = await supa
    .from("documents")
    .select("id,title,expiry_date,reminder_lead_days,archived")
    .eq(col, owner.id)
    .eq("category", category)
    .eq("archived", false)
    .order("expiry_date", { ascending: false, nullsFirst: false });
  return (data ?? []).map((d) => {
    const expiryDate = d.expiry_date ? new Date(d.expiry_date as string) : null;
    const reminderLeadDays = (d.reminder_lead_days as number | null) ?? 30;
    return {
      id: d.id as number,
      title: d.title as string,
      status: deriveDocStatus({ expiryDate, reminderLeadDays, archived: false }),
      expiryLabel: expiryDate ? expiryLabel({ expiryDate, reminderLeadDays }) : null,
      expiryDate: expiryDate ? expiryDate.toISOString() : null,
    };
  });
}

type Result = { ok: true; id?: number; code?: string } | { ok: false; error: string };

// Pull an uploaded file out of the form (if the user picked one).
function fileFromForm(fd: FormData): File | null {
  const f = fd.get("file");
  return f instanceof File && f.size > 0 ? f : null;
}

// "YYYY-MM-DD" → a Date at UTC midnight (all-day, matching task deadline convention).
function dateFromInput(s: FormDataEntryValue | null): Date | null {
  const v = (s ?? "").toString().trim();
  if (!v) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return isNaN(d.getTime()) ? null : d;
}

function str(fd: FormData, key: string): string | null {
  const v = (fd.get(key) ?? "").toString().trim();
  return v || null;
}

function intOrNull(fd: FormData, key: string): number | null {
  const values = fd.getAll(key);
  const raw = values.length ? values[values.length - 1] : fd.get(key);
  const v = (raw ?? "").toString().trim();
  if (!v) return null;
  const n = parseInt(v, 10);
  return isNaN(n) ? null : n;
}

function inputFromForm(fd: FormData): DocumentInput | { error: string } {
  const title = str(fd, "title");
  if (!title) return { error: "A document title is required." };
  const lead = intOrNull(fd, "reminderLeadDays");
  return {
    title,
    companyId: intOrNull(fd, "companyId"),
    personId: intOrNull(fd, "personId"),
    // Only touch vendor_id when the form actually carries it (vendor-contract
    // create flow). Omitting preserves the existing link on normal edits.
    ...(fd.has("vendorId") ? { vendorId: intOrNull(fd, "vendorId") } : {}),
    category: str(fd, "category"),
    docType: str(fd, "docType"),
    issuer: str(fd, "issuer"),
    referenceNo: str(fd, "referenceNo"),
    issueDate: dateFromInput(fd.get("issueDate")),
    expiryDate: dateFromInput(fd.get("expiryDate")),
    reminderLeadDays: lead ?? undefined,
    fileUrl: str(fd, "fileUrl"),
    notes: str(fd, "notes"),
    ...(fd.has("supersedesId") ? { supersedesId: intOrNull(fd, "supersedesId") } : {}),
  };
}

function revalidateDocs() {
  revalidatePath("/documents");
  revalidatePath("/");
  // Filing a person's document changes their compliance — refresh the People
  // list too (the person drawer reads its checklist live, but the list caches).
  revalidatePath("/people");
}

/**
 * Persist auto-links for the affected owner as soon as a document is saved, so the
 * compliance score on the Documents panel / Home / Brief (which read STORED links,
 * not the live checklist) reflects the new document immediately — not only after
 * someone opens that person's/company's checklist. Best-effort.
 */
async function reconcileOwnerCompliance(personId: number | null, companyId: number | null) {
  try {
    if (personId) await getPersonChecklist(personId);
    if (companyId) await getCompanyChecklist(companyId);
  } catch {
    /* never block the save on reconciliation */
  }
}

export async function createDocumentAction(fd: FormData): Promise<Result> {
  const parsed = inputFromForm(fd);
  if ("error" in parsed) return { ok: false, error: parsed.error };
  try {
    const id = await createDocument(parsed);
    const file = fileFromForm(fd);
    if (file) await uploadDocumentFile(id, file);
    if (parsed.companyId) {
      await backfillCompanyProfileFromDocument(parsed.companyId, {
        category: parsed.category ?? null,
        title: parsed.title ?? null,
        referenceNo: parsed.referenceNo ?? null,
        issueDate: parsed.issueDate ?? null,
      });
      revalidatePath(`/companies/${parsed.companyId}`);
    }
    await reconcileOwnerCompliance(parsed.personId ?? null, parsed.companyId ?? null);
    revalidateDocs();
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save the document." };
  }
}

export async function updateDocumentAction(id: number, fd: FormData): Promise<Result> {
  const parsed = inputFromForm(fd);
  if ("error" in parsed) return { ok: false, error: parsed.error };
  try {
    await updateDocument(id, parsed);
    const file = fileFromForm(fd);
    if (file) await uploadDocumentFile(id, file);
    else if (fd.get("removeFile") === "1") await removeDocumentFile(id);
    if (parsed.companyId) {
      await backfillCompanyProfileFromDocument(parsed.companyId, {
        category: parsed.category ?? null,
        title: parsed.title ?? null,
        referenceNo: parsed.referenceNo ?? null,
        issueDate: parsed.issueDate ?? null,
      });
      revalidatePath(`/companies/${parsed.companyId}`);
    }
    await reconcileOwnerCompliance(parsed.personId ?? null, parsed.companyId ?? null);
    revalidateDocs();
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save changes." };
  }
}

/** Short-lived signed URL to view/download a document's stored file. */
export async function getDocumentFileLinkAction(id: number): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    const { data, error } = await supa.from("documents").select("storage_path").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    const path = (data?.storage_path as string | null) ?? null;
    if (!path) return { ok: false, error: "No file is attached to this document." };
    const url = await signDocumentFile(path);
    if (!url) return { ok: false, error: "Could not open the file." };
    return { ok: true, url };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not open the file." };
  }
}

/* ---------------------------------------------------------------------- */
/* AI auto-fill: extract document fields from pasted text                 */
/* ---------------------------------------------------------------------- */

export type ExtractedFields = {
  title?: string;
  category?: string;
  docType?: string;
  issuer?: string;
  referenceNo?: string;
  issueDate?: string; // YYYY-MM-DD
  expiryDate?: string; // YYYY-MM-DD
  // Resolved against existing records so the form can select them directly.
  companyId?: number;
  companyName?: string;
  personId?: number;
  personName?: string;
  // Overflow: anything useful that doesn't fit a labelled field, for the Notes box.
  notes?: string;
  // V3 unified intake: profile details about the named individual, read straight
  // from the document (e.g. DOB/nationality/passport no on a passport scan). The
  // form uses this to offer "also update {person}'s profile" — fill-blanks-only.
  person?: PersonProfileFields;
  // V3 Phase 5: company identity details read from a company document (legal
  // name, address, etc.), for the "also update {company}'s profile" banner.
  company?: CompanyProfileFields;
};

type Entity = { id: number; name: string };

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

// Find dates in free text → [{ iso, context }]. Handles 2027-03-12, 12/03/2027,
// and "12 March 2027" / "March 12, 2027".
function findDates(text: string): { iso: string; idx: number }[] {
  const out: { iso: string; idx: number }[] = [];
  const push = (y: number, m: number, d: number, idx: number) => {
    if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return;
    out.push({ iso: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`, idx });
  };
  let m: RegExpExecArray | null;
  const iso = /(\d{4})-(\d{2})-(\d{2})/g;
  while ((m = iso.exec(text))) push(+m[1], +m[2], +m[3], m.index);
  const dmy = /\b(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})\b/g;
  while ((m = dmy.exec(text))) { let y = +m[3]; if (y < 100) y += 2000; push(y, +m[2], +m[1], m.index); }
  const named = /\b(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4})\b|\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})\b/g;
  while ((m = named.exec(text))) {
    if (m[2]) { const mo = MONTHS[m[2].slice(0, 3).toLowerCase()]; if (mo) push(+m[3], mo, +m[1], m.index); }
    else { const mo = MONTHS[m[4].slice(0, 3).toLowerCase()]; if (mo) push(+m[6], mo, +m[5], m.index); }
  }
  return out;
}

function ruleExtract(text: string): ExtractedFields {
  const fields: ExtractedFields = {};
  const lower = text.toLowerCase();
  // Title = first non-empty line; if the text is flattened (no line breaks, e.g.
  // from a PDF), cut before the first metadata keyword so we don't grab the lot.
  const firstLine = text.split(/\r?\n/).map((l) => l.trim()).find(Boolean);
  if (firstLine) {
    let t = firstLine;
    const cut = t.search(/\b(issued|reference|ref\b|date of|dated|valid|expir|no[:.]|certificate no)/i);
    if (cut > 3) t = t.slice(0, cut).trim();
    fields.title = t.slice(0, 80).trim();
  }
  // Category by keyword.
  for (const c of DOC_CATEGORIES) if (lower.includes(c.toLowerCase())) { fields.category = c; break; }
  if (!fields.category) {
    if (/passport/.test(lower)) fields.category = "Passport";
    else if (/visa|permit|immigration|residence/.test(lower)) fields.category = "Immigration";
    else if (/insurance|policy/.test(lower)) fields.category = "Insurance";
    else if (/licen[cs]e/.test(lower)) fields.category = "Licence";
  }
  // Reference number. Whole-word keyword (so "Reference" isn't split), optional
  // "No"/"number", then the value — which must contain a digit.
  const ref = text.match(/\b(?:reference|certificate|ref|number|no)\b\.?\s*(?:no\.?|number)?\s*[:#]?\s*([A-Z0-9][A-Z0-9/-]{3,})/i);
  if (ref && /\d/.test(ref[1])) fields.referenceNo = ref[1];
  // Dates: expiry near "expir/valid until/renew"; issue near "issue/dated".
  const dates = findDates(text);
  if (dates.length) {
    const expHint = lower.search(/expir|valid until|valid till|renew|due/);
    const issHint = lower.search(/issue|dated|granted|effective/);
    if (expHint >= 0) fields.expiryDate = dates.reduce((a, b) => (Math.abs(b.idx - expHint) < Math.abs(a.idx - expHint) ? b : a)).iso;
    if (issHint >= 0) fields.issueDate = dates.reduce((a, b) => (Math.abs(b.idx - issHint) < Math.abs(a.idx - issHint) ? b : a)).iso;
    // Fallbacks: latest date = expiry, earliest = issue.
    const sorted = [...dates].sort((a, b) => a.iso.localeCompare(b.iso));
    if (!fields.expiryDate) fields.expiryDate = sorted[sorted.length - 1].iso;
    if (!fields.issueDate && sorted.length > 1 && sorted[0].iso !== fields.expiryDate) fields.issueDate = sorted[0].iso;
  }
  return fields;
}

// Load the companies + active people so extraction can match names to records.
async function loadEntities(): Promise<{ companies: Entity[]; people: Entity[] }> {
  const [{ data: c }, { data: p }] = await Promise.all([
    supa.from("companies").select("id,name"),
    supa.from("people").select("id,name").eq("active", true),
  ]);
  return {
    companies: (c ?? []).map((r) => ({ id: r.id as number, name: r.name as string })),
    people: (p ?? []).map((r) => ({ id: r.id as number, name: r.name as string })),
  };
}

// Match a free-text name to a known entity: exact (case-insensitive), then a
// contains-either-way match, preferring the longest name.
function resolveEntity(name: string | undefined, list: Entity[]): Entity | null {
  if (!name) return null;
  const q = name.trim().toLowerCase();
  if (!q) return null;
  const exact = list.find((e) => e.name.toLowerCase() === q);
  if (exact) return exact;
  const partial = list
    .filter((e) => { const n = e.name.toLowerCase(); return n.includes(q) || q.includes(n); })
    .sort((a, b) => b.name.length - a.name.length)[0];
  return partial ?? null;
}

// Scan raw text for any known company/person name appearing verbatim (used in
// the AI-off path and to backfill).
function scanEntities(text: string, companies: Entity[], people: Entity[]): Partial<ExtractedFields> {
  const lower = text.toLowerCase();
  const out: Partial<ExtractedFields> = {};
  const co = companies.filter((c) => lower.includes(c.name.toLowerCase())).sort((a, b) => b.name.length - a.name.length)[0];
  if (co) { out.companyId = co.id; out.companyName = co.name; }
  const pe = people.filter((p) => lower.includes(p.name.toLowerCase())).sort((a, b) => b.name.length - a.name.length)[0];
  if (pe) { out.personId = pe.id; out.personName = pe.name; }
  return out;
}

// Validate + normalise a parsed JSON object into ExtractedFields, resolving the
// company/person names against records and backfilling from text when present.
function coerceFields(
  parsed: Record<string, unknown>,
  companies: Entity[],
  people: Entity[],
  fallbackText?: string
): ExtractedFields {
  const f: ExtractedFields = {};
  const s = (v: unknown, n: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : undefined);
  f.title = s(parsed.title, 120);
  const cat = s(parsed.category, 40);
  if (cat && (DOC_CATEGORIES as readonly string[]).includes(cat)) f.category = cat;
  f.docType = s(parsed.docType, 80);
  f.issuer = s(parsed.issuer, 80);
  f.referenceNo = s(parsed.referenceNo, 80);
  const id = s(parsed.issueDate, 10); if (id && /^\d{4}-\d{2}-\d{2}$/.test(id)) f.issueDate = id;
  const ed = s(parsed.expiryDate, 10); if (ed && /^\d{4}-\d{2}-\d{2}$/.test(ed)) f.expiryDate = ed;
  const co = resolveEntity(s(parsed.company, 80), companies);
  if (co) { f.companyId = co.id; f.companyName = co.name; }
  const pe = resolveEntity(s(parsed.person, 80), people);
  if (pe) { f.personId = pe.id; f.personName = pe.name; }
  f.notes = s(parsed.notes, 600);
  // Person profile sub-object (unified intake) — read straight from the doc.
  // Keyed as "personProfile" so it never collides with the "person" name string
  // used above for owner matching. (Older prompts returned an object under
  // "person"; fall back to it so historical/edge responses still parse.)
  const p = parsed.personProfile ?? (typeof parsed.person === "object" ? parsed.person : undefined);
  if (p && typeof p === "object") {
    const pr = p as Record<string, unknown>;
    const date10 = (v: unknown) => { const x = s(v, 10); return x && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : undefined; };
    const person: PersonProfileFields = {
      dateOfBirth: date10(pr.dateOfBirth),
      nationality: s(pr.nationality, 60),
      nationalId: s(pr.nationalId, 40),
      passportNo: s(pr.passportNo, 40),
      address: s(pr.address, 300),
      emergencyContactName: s(pr.emergencyContactName, 120),
      emergencyContactPhone: s(pr.emergencyContactPhone, 40),
      role: s(pr.role, 120),
      startDate: date10(pr.startDate),
      probationEndDate: date10(pr.probationEndDate),
      department: s(pr.department, 60),
      supervisorName: s(pr.supervisorName, 120),
      companyName: s(pr.companyName, 80),
    };
    // Keep only the keys we actually found.
    const trimmed = Object.fromEntries(Object.entries(person).filter(([, v]) => v != null)) as PersonProfileFields;
    if (Object.keys(trimmed).length) f.person = trimmed;
  }
  // Company profile sub-object (Phase 5) — identity details read from a company
  // document (legal name, address, contacts, reg numbers).
  const cp = parsed.companyProfile;
  if (cp && typeof cp === "object") {
    const cr = cp as Record<string, unknown>;
    const date10 = (v: unknown) => { const x = s(v, 10); return x && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : undefined; };
    const company: CompanyProfileFields = {
      legalName: s(cr.legalName, 120),
      registrationNo: s(cr.registrationNo, 80),
      tin: s(cr.tin, 60),
      vrn: s(cr.vrn, 60),
      incorporationDate: date10(cr.incorporationDate),
      address: s(cr.address, 300),
      phone: s(cr.phone, 60),
      email: s(cr.email, 120),
    };
    const trimmed = Object.fromEntries(Object.entries(company).filter(([, v]) => v != null)) as CompanyProfileFields;
    if (Object.keys(trimmed).length) f.company = trimmed;
  }
  // Backfill anything missing from the rule extractor + entity scan.
  if (fallbackText) {
    const ruled = ruleExtract(fallbackText);
    const scanned = scanEntities(fallbackText, companies, people);
    return { ...ruled, ...scanned, ...Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined)) };
  }
  return f;
}

function safeJson(content: string | null): Record<string, unknown> {
  if (!content) return {};
  try { return JSON.parse(content) as Record<string, unknown>; } catch { return {}; }
}

function extractPrompt(companies: Entity[], people: Entity[]): string {
  const cNames = companies.map((c) => c.name).join(", ") || "(none)";
  const pNames = people.map((p) => p.name).slice(0, 150).join(", ") || "(none)";
  return `You are reading a business/compliance document (it may be a licence, certificate, permit, passport, visa, insurance policy, lease, contract or tax document). It may be a clean scan, a phone photo, a faded/old/dirty page, or rough handwritten notes, possibly at an angle or in mixed languages (English/Swahili). Read it as carefully as you can; transcribe uncertain text rather than dropping it. Extract the key details and return ONLY a JSON object with these optional keys (omit any you genuinely cannot find):
- title: a short human label for the document
- category: one of [${DOC_CATEGORIES.join(", ")}]
- docType: the specific type (e.g. "Work Permit", "Class C Driving Licence", "TIN Certificate")
- issuer: the authority/organisation that issued it
- referenceNo: the document/certificate/serial number
- issueDate: YYYY-MM-DD
- expiryDate: YYYY-MM-DD (the validity end / renewal-by date)
- company: the related business — choose the closest match from: ${cNames}
- person: the named individual the document is about — choose the closest match from: ${pNames} (only if clearly named)
- notes: a brief plain-text summary of ANY other useful information that does not fit the fields above — extra reference/serial numbers, conditions, amounts/fees, addresses, named officials, remarks, or anything handwritten. Keep it concise. Omit if there is nothing extra.
- personProfile: IF the document is about a specific individual (e.g. passport, ID, CV, contract, permit), a nested JSON object with any of these you can read about THAT person: { dateOfBirth (YYYY-MM-DD), nationality, nationalId, passportNo, address, emergencyContactName, emergencyContactPhone, role, startDate (YYYY-MM-DD), probationEndDate (YYYY-MM-DD), department, supervisorName, companyName }. Omit the whole "personProfile" object for company-only documents. (Note: "person" above is just the matched name; "personProfile" is the detail object — keep them separate.)
- companyProfile: IF the document is about a BUSINESS/COMPANY (e.g. certificate of incorporation, business licence, TIN/VRN certificate, tax document, lease), a nested JSON object with any of these you can read about THAT company: { legalName (the full registered name), registrationNo, tin, vrn (VAT/VRN number), incorporationDate (YYYY-MM-DD), address, phone, email }. Omit the whole "companyProfile" object for personal documents.
Resolve relative or worded dates to YYYY-MM-DD. British English. Do not invent values you cannot see.`;
}

async function groqJson(messages: unknown[], model: string, apiKey: string): Promise<string | null> {
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, temperature: 0, max_tokens: 400, response_format: { type: "json_object" } }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  }
}

/**
 * Extract document fields from pasted text (renewal email / certificate text).
 * Groq text model when configured, rule-based fallback when AI is off.
 */
export async function extractDocumentFields(text: string): Promise<{ ok: boolean; fields: ExtractedFields; source: "ai" | "rules" }> {
  const trimmed = (text ?? "").toString().trim();
  if (!trimmed) return { ok: false, fields: {}, source: "rules" };
  const { companies, people } = await loadEntities();
  const apiKey = await getGroqKey();
  if (!apiKey) {
    return { ok: true, fields: { ...ruleExtract(trimmed), ...scanEntities(trimmed, companies, people) }, source: "rules" };
  }
  const content = await groqJson(
    [
      { role: "system", content: "You extract structured data and reply with strict JSON only." },
      { role: "user", content: `${extractPrompt(companies, people)}\n\nDOCUMENT TEXT:\n${trimmed.slice(0, 6000)}` },
    ],
    GROQ_FAST,
    apiKey
  );
  if (!content) return { ok: true, fields: { ...ruleExtract(trimmed), ...scanEntities(trimmed, companies, people) }, source: "rules" };
  return { ok: true, fields: coerceFields(safeJson(content), companies, people, trimmed), source: "ai" };
}

// Rough base64-length ceiling for Groq's 4 MB-per-image limit.
const MAX_IMAGE_DATAURL = 5_400_000;

/**
 * Rasterise the first pages of a (scanned/image-only) PDF to PNG data URLs so
 * the vision model can read them. Uses unpdf's renderer backed by @napi-rs/canvas.
 * Returns [] if rendering isn't possible (so callers can fall back gracefully).
 */
async function renderPdfPages(base: Buffer, maxPages = 2): Promise<string[]> {
  try {
    const { renderPageAsImage } = await import("unpdf");
    const urls: string[] = [];
    for (let i = 1; i <= maxPages; i++) {
      try {
        const url = await renderPageAsImage(Uint8Array.from(base), i, {
          canvasImport: () => import("@napi-rs/canvas"),
          width: 1400,
          toDataURL: true,
        });
        if (typeof url === "string" && url.length <= MAX_IMAGE_DATAURL) urls.push(url);
      } catch {
        break; // no further pages, or render failed
      }
    }
    return urls;
  } catch {
    return [];
  }
}

/** Read one or more images with the Groq vision model. */
async function groqVision(imageUrls: string[], prompt: string, apiKey: string): Promise<string | null> {
  const content = [
    { type: "text", text: prompt },
    ...imageUrls.map((url) => ({ type: "image_url", image_url: { url } })),
  ];
  return groqJson([{ role: "user", content }], GROQ_VISION, apiKey);
}

async function fieldsFromText(
  text: string,
  companies: Entity[],
  people: Entity[],
  apiKey: string | undefined
): Promise<{ ok: boolean; fields: ExtractedFields; source: "ai" | "rules" }> {
  if (!text.trim()) return { ok: false, fields: {}, source: "rules" };
  if (!apiKey) {
    return { ok: true, fields: { ...ruleExtract(text), ...scanEntities(text, companies, people) }, source: "rules" };
  }
  const content = await groqJson(
    [
      { role: "system", content: "You extract structured data and reply with strict JSON only." },
      { role: "user", content: `${extractPrompt(companies, people)}\n\nDOCUMENT TEXT:\n${text.slice(0, 6000)}` },
    ],
    GROQ_FAST,
    apiKey
  );
  if (!content) return { ok: true, fields: { ...ruleExtract(text), ...scanEntities(text, companies, people) }, source: "rules" };
  return { ok: true, fields: coerceFields(safeJson(content), companies, people, text), source: "ai" };
}

async function extractOfficeText(file: File): Promise<string> {
  const lower = file.name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  if (lower.endsWith(".docx") || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value ?? "";
  }

  if (
    lower.endsWith(".xlsx") ||
    lower.endsWith(".xls") ||
    lower.endsWith(".csv") ||
    file.type.includes("spreadsheet") ||
    file.type === "text/csv"
  ) {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    return workbook.SheetNames.slice(0, 6)
      .map((name) => {
        const sheet = workbook.Sheets[name];
        const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
        return [`Sheet: ${name}`, csv].join("\n");
      })
      .join("\n\n")
      .slice(0, 12000);
  }

  return "";
}

/**
 * Extract document fields from an uploaded file. Text-layer PDFs are parsed with
 * unpdf and read by the text model; images AND scanned/image-only PDFs are read
 * by the Groq vision model (scanned PDFs are rasterised to images first). Never
 * throws.
 */
export async function extractDocumentFromFile(
  fd: FormData
): Promise<{ ok: boolean; fields: ExtractedFields; source: "ai" | "rules" | "vision"; note?: string }> {
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, fields: {}, source: "rules", note: "No file provided." };

  const apiKey = await getGroqKey();
  const { companies, people } = await loadEntities();
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const lowerName = file.name.toLowerCase();
  const isOffice =
    lowerName.endsWith(".docx") ||
    lowerName.endsWith(".xlsx") ||
    lowerName.endsWith(".xls") ||
    lowerName.endsWith(".csv") ||
    file.type.includes("spreadsheet") ||
    file.type === "text/csv" ||
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  if (isOffice) {
    try {
      const text = await extractOfficeText(file);
      if (text.trim().length < 20) {
        return { ok: false, fields: {}, source: "rules", note: "Couldn't read useful text from that Word/Excel file." };
      }
      const result = await fieldsFromText(text, companies, people, apiKey);
      return { ...result, note: result.source === "rules" ? "Read the file text with rule-based extraction." : undefined };
    } catch {
      return { ok: false, fields: {}, source: "rules", note: "Couldn't read that Word/Excel file. Try saving it as PDF or paste the text." };
    }
  }

  if (isPdf) {
    const base = Buffer.from(await file.arrayBuffer());
    let text = "";
    try {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(Uint8Array.from(base));
      const r = await extractText(pdf, { mergePages: true });
      text = Array.isArray(r.text) ? r.text.join("\n") : r.text;
    } catch {
      text = "";
    }

    // Text-layer PDF → read the embedded text.
    if (text.trim().length >= 40) {
      return fieldsFromText(text, companies, people, apiKey);
    }

    // Scanned / image-only PDF → rasterise the pages and read with the vision model.
    if (!apiKey) {
      return { ok: false, fields: {}, source: "rules", note: "This looks like a scanned PDF and AI is off. Type the details, or paste the document text." };
    }
    const images = await renderPdfPages(base, 2);
    if (!images.length) {
      return { ok: false, fields: {}, source: "vision", note: "Couldn't render this PDF to read it. Try uploading a clear photo of the document instead." };
    }
    const content = await groqVision(images, extractPrompt(companies, people), apiKey);
    if (!content) return { ok: false, fields: {}, source: "vision", note: "Couldn't read that scan. Try a clearer copy or a well-lit photo." };
    return { ok: true, fields: coerceFields(safeJson(content), companies, people), source: "vision" };
  }

  if (file.type.startsWith("image/")) {
    if (!apiKey) return { ok: false, fields: {}, source: "rules", note: "AI is off, so images can't be read automatically. Type the details, or paste the document text." };
    // Groq base64 image limit is 4 MB; the client downscales before sending.
    if (file.size > 4 * 1024 * 1024) {
      return { ok: false, fields: {}, source: "vision", note: "Image is too large (max 4 MB). Try a smaller photo." };
    }
    const b64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const dataUrl = `data:${file.type};base64,${b64}`;
    const content = await groqVision([dataUrl], extractPrompt(companies, people), apiKey);
    if (!content) return { ok: false, fields: {}, source: "vision", note: "Couldn't read that image. Try a clearer, well-lit photo." };
    return { ok: true, fields: coerceFields(safeJson(content), companies, people), source: "vision" };
  }

  return { ok: false, fields: {}, source: "rules", note: "Unsupported file type. Upload a PDF, Word, Excel/CSV or an image (PNG/JPG)." };
}

/**
 * Draft an Outbox "renewal / chase" message for an expiring or expired document.
 * No real dispatch — it persists a Draft the operator can review and send via the
 * channel deep-links (mirrors the rest of Outbox). De-duped per document per day.
 */
export async function draftDocumentRenewalAction(
  id: number
): Promise<{ ok: true; created: boolean } | { ok: false; error: string }> {
  try {
    const { data: doc, error } = await sb
      .from("documents")
      .select("id,title,expiry_date,reminder_lead_days,company_id,person_id")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!doc) return { ok: false, error: "Document not found." };

    // Resolve the owner (company or person) for the recipient line.
    let ownerName = "the team";
    let companyLabel: string | null = null;
    if (doc.company_id) {
      const { data: c } = await sb.from("companies").select("name").eq("id", doc.company_id).maybeSingle();
      ownerName = (c?.name as string | null) ?? ownerName;
      companyLabel = ownerName;
    } else if (doc.person_id) {
      const { data: p } = await sb.from("people").select("name").eq("id", doc.person_id).maybeSingle();
      ownerName = (p?.name as string | null) ?? ownerName;
    }

    const expiryDate = doc.expiry_date ? new Date(doc.expiry_date as string) : null;
    const reminderLeadDays = (doc.reminder_lead_days as number | null) ?? 30;
    const status = deriveDocStatus({ expiryDate, reminderLeadDays, archived: false });
    const phrase = expiryDate
      ? status === "Expired"
        ? `expired (${expiryLabel({ expiryDate, reminderLeadDays })})`
        : `is due to expire ${expiryLabel({ expiryDate, reminderLeadDays })}`
      : "needs renewing";

    const title = doc.title as string;
    const body =
      `Hello,\n\nA quick reminder that "${title}"${doc.person_id ? ` for ${ownerName}` : ""} ${phrase}. ` +
      `Please arrange its renewal and share the updated copy so we can keep our records current.\n\nThank you.`;

    const source = `doc-renewal:${id}`;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { data: existing } = await sb
      .from("outbox")
      .select("id")
      .eq("status", "Draft")
      .eq("source", source)
      .gte("created_at", today.toISOString())
      .limit(1);
    if ((existing ?? []).length > 0) return { ok: true, created: false };

    const { error: insErr } = await sb.from("outbox").insert({
      channel: "WHATSAPP",
      recipient_name: ownerName,
      recipient_contact: null,
      company: companyLabel,
      subject: `Renewal: ${title}`,
      body,
      message_type: "DOCUMENT RENEWAL",
      status: "Draft",
      source,
      person_id: doc.person_id ?? null,
      created_at: new Date().toISOString(),
    });
    if (insErr) throw new Error(insErr.message);

    revalidatePath("/outbox");
    updateTag("outbox");
    return { ok: true, created: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not draft the renewal message." };
  }
}

/**
 * Build a portfolio compliance sheet (CSV) — one row per company and per person,
 * worst score first, with each owner's outstanding items. For handing a director
 * or auditor a clean status snapshot.
 */
export async function exportComplianceCsvAction(): Promise<
  { ok: true; filename: string; csv: string } | { ok: false; error: string }
> {
  try {
    const { data: companiesRaw } = await supa.from("companies").select("id,name").order("name");
    const companies = (companiesRaw ?? []).map((c) => ({ id: c.id as number, name: c.name as string }));
    const [companyScores, personScores] = await Promise.all([
      buildCompanyRequirementScores(companies),
      buildPersonRequirementScores(),
    ]);
    const csv = buildComplianceCsv(companyScores, personScores);
    return { ok: true, filename: complianceCsvFilename(), csv };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not build the compliance export." };
  }
}

export async function removeDocumentFileAction(id: number): Promise<Result> {
  try {
    await removeDocumentFile(id);
    revalidateDocs();
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not remove the file." };
  }
}

export async function archiveDocumentAction(id: number, archived: boolean): Promise<Result> {
  try {
    // Who owns this document — so we can fix up their compliance link.
    const { data: doc } = await supa.from("documents").select("person_id,company_id").eq("id", id).maybeSingle();
    const personId = (doc?.person_id as number | null) ?? null;
    const companyId = (doc?.company_id as number | null) ?? null;

    await setDocumentArchived(id, archived);

    // An archived document must not keep ticking a checklist item. Release any
    // requirement linked to it (back to "missing", auto-link on) so a replacement
    // re-links on the reconcile below. This is what makes "Replace + archive"
    // (renewal) hand the checklist over from the old document to the new one.
    if (archived) {
      const now = new Date().toISOString();
      await supa
        .from("person_requirements")
        .update({ document_id: null, status: "missing", verified_at: null, verified_by: null, auto_link: true, updated_at: now })
        .eq("document_id", id);
      await supa
        .from("company_requirements")
        .update({ document_id: null, status: "missing", verified_at: null, verified_by: null, auto_link: true, updated_at: now })
        .eq("document_id", id);
    }

    await reconcileOwnerCompliance(personId, companyId);
    revalidateDocs();
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not update the document." };
  }
}

/**
 * Turn a document into a tracked renewal task and link them. The task lands in
 * the document's company (required for a task code); if the document has no
 * company, this is rejected with a friendly message.
 */
export async function renewDocumentAction(id: number): Promise<Result> {
  try {
    const { data: doc, error } = await sb
      .from("documents")
      .select("id,title,company_id,expiry_date")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!doc) return { ok: false, error: "Document not found." };
    if (!doc.company_id) {
      return { ok: false, error: "Assign this document to a company first, then create a renewal task." };
    }

    const { data: links, error: linkError } = await sb
      .from("document_links")
      .select("tasks(code,status)")
      .eq("document_id", id);
    if (linkError) throw new Error(linkError.message);

    const openLink = (links ?? [])
      .map((row) => row.tasks as { code?: string | null; status?: string | null } | null)
      .find((task) => task?.code && task.status !== "Completed" && task.status !== "Closed");
    if (openLink?.code) return { ok: true, code: openLink.code };

    const { data: company } = await sb
      .from("companies")
      .select("code")
      .eq("id", doc.company_id)
      .maybeSingle();

    const now = new Date();
    const task = await insertTaskWithUniqueCodeSb(doc.company_id as number, (company?.code as string) || "", {
      actionItem: `Renew: ${doc.title}`,
      status: "Not Started",
      priority: "High",
      category: "Admin",
      deadline: doc.expiry_date ? new Date(doc.expiry_date as string) : null,
      createdDate: now,
      lastUpdatedAt: now,
      archived: false,
    });

    await sb.from("audit_log").insert({
      task_id: task.id,
      task_code: task.code,
      company_id: doc.company_id,
      entry_type: "CREATE",
      field: "Task",
      old_value: null,
      new_value: `Renew: ${doc.title}`,
      change_reason: "Created from a document renewal",
      created_at: now.toISOString(),
      created_by: "web-ui",
    });

    await linkDocumentTask(id, task.id);

    revalidateDocs();
    updateTag("tasks");
    return { ok: true, code: task.code };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not create the renewal task." };
  }
}

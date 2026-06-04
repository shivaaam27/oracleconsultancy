"use server";

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
import { DOC_CATEGORIES } from "@/lib/documents-shared";

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
  const v = (fd.get(key) ?? "").toString().trim();
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
    category: str(fd, "category"),
    docType: str(fd, "docType"),
    issuer: str(fd, "issuer"),
    referenceNo: str(fd, "referenceNo"),
    issueDate: dateFromInput(fd.get("issueDate")),
    expiryDate: dateFromInput(fd.get("expiryDate")),
    reminderLeadDays: lead ?? undefined,
    fileUrl: str(fd, "fileUrl"),
    notes: str(fd, "notes"),
  };
}

function revalidateDocs() {
  revalidatePath("/documents");
  revalidatePath("/");
}

export async function createDocumentAction(fd: FormData): Promise<Result> {
  const parsed = inputFromForm(fd);
  if ("error" in parsed) return { ok: false, error: parsed.error };
  try {
    const id = await createDocument(parsed);
    const file = fileFromForm(fd);
    if (file) await uploadDocumentFile(id, file);
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
};

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
  // Title = first non-empty line, trimmed.
  const firstLine = text.split(/\r?\n/).map((l) => l.trim()).find(Boolean);
  if (firstLine) fields.title = firstLine.slice(0, 120);
  // Category by keyword.
  for (const c of DOC_CATEGORIES) if (lower.includes(c.toLowerCase())) { fields.category = c; break; }
  if (!fields.category) {
    if (/visa|permit|passport|immigration/.test(lower)) fields.category = "Immigration";
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

/**
 * Extract document fields from pasted text (e.g. a renewal email or the text on
 * a certificate). Uses Groq when configured, with a rule-based fallback so it
 * still works AI-off. Never throws — returns {} on failure.
 */
export async function extractDocumentFields(text: string): Promise<{ ok: boolean; fields: ExtractedFields; source: "ai" | "rules" }> {
  const trimmed = (text ?? "").toString().trim();
  if (!trimmed) return { ok: false, fields: {}, source: "rules" };

  const apiKey = await getGroqKey();
  if (!apiKey) return { ok: true, fields: ruleExtract(trimmed), source: "rules" };

  try {
    const prompt = `Extract document metadata from the text below. Return ONLY a JSON object with these optional keys (omit any you cannot find): title (short label), category (one of: ${DOC_CATEGORIES.join(", ")}), docType (specific type e.g. "Work Permit"), issuer, referenceNo, issueDate (YYYY-MM-DD), expiryDate (YYYY-MM-DD). British English. Do not invent values.\n\nTEXT:\n${trimmed.slice(0, 4000)}`;
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: "You extract structured data and reply with strict JSON only." },
          { role: "user", content: prompt },
        ],
        temperature: 0,
        max_tokens: 300,
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) return { ok: true, fields: ruleExtract(trimmed), source: "rules" };
    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as ExtractedFields;
    const fields: ExtractedFields = {};
    if (parsed.title) fields.title = String(parsed.title).slice(0, 120);
    if (parsed.category && (DOC_CATEGORIES as readonly string[]).includes(parsed.category)) fields.category = parsed.category;
    if (parsed.docType) fields.docType = String(parsed.docType).slice(0, 80);
    if (parsed.issuer) fields.issuer = String(parsed.issuer).slice(0, 80);
    if (parsed.referenceNo) fields.referenceNo = String(parsed.referenceNo).slice(0, 80);
    if (parsed.issueDate && /^\d{4}-\d{2}-\d{2}$/.test(parsed.issueDate)) fields.issueDate = parsed.issueDate;
    if (parsed.expiryDate && /^\d{4}-\d{2}-\d{2}$/.test(parsed.expiryDate)) fields.expiryDate = parsed.expiryDate;
    // Backfill any missing field with the rule extractor.
    const ruled = ruleExtract(trimmed);
    return { ok: true, fields: { ...ruled, ...fields }, source: "ai" };
  } catch {
    return { ok: true, fields: ruleExtract(trimmed), source: "rules" };
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
    await setDocumentArchived(id, archived);
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

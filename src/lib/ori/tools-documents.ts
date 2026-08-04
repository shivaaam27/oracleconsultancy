import "server-only";
import { sb } from "@/db/supabase";
import type { ToolDef } from "@/lib/ori/tools";
import {
  str,
  resolveCompany,
  resolvePerson,
  resolveDocument,
} from "@/lib/ori/tools";

import {
  createDocumentAction,
  updateDocumentAction,
  archiveDocumentAction,
  renewDocumentAction,
} from "@/app/documents/actions";
import {
  recordFactAction,
  verifyFactAction,
} from "@/app/facts/actions";
import type { FactEntityType } from "@/lib/facts-shared";

/** Coerce a planner arg to a positive integer id, else null. */
function intArg(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

/** Turn a plain object of string fields into a FormData for the doc actions. */
function toForm(fields: Record<string, string | number | null | undefined>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v === null || v === undefined || v === "") continue;
    fd.set(k, String(v));
  }
  return fd;
}

/** Resolve an owner reference to a companyId OR personId (company wins if both). */
async function resolveOwner(
  companyRef: unknown,
  personRef: unknown
): Promise<{ companyId: number | null; personId: number | null; error?: string }> {
  let companyId: number | null = null;
  let personId: number | null = null;
  const c = str(companyRef);
  const p = str(personRef);
  if (c) {
    const co = await resolveCompany(c);
    if (!co) return { companyId: null, personId: null, error: `Couldn't find a company matching "${c}".` };
    companyId = co.id;
  }
  if (!companyId && p) {
    const pe = await resolvePerson(p);
    if (!pe) return { companyId: null, personId: null, error: `Couldn't find a person matching "${p}".` };
    personId = pe.id;
  }
  return { companyId, personId };
}

/** Columns updateDocument writes — snapshot these BEFORE an edit for a clean undo. */
const DOC_EDIT_COLS =
  "title,company_id,person_id,category,doc_type,issuer,reference_no,issue_date,expiry_date,notes" as const;

export const DOCUMENT_TOOLS: ToolDef[] = [
  // ── Documents ──────────────────────────────────────────────────────────────
  {
    name: "create_document",
    tier: 2,
    description:
      "File a new document record (title + optional owner, category, type, issuer, reference, dates). Reuses the Documents create path.",
    params: {
      title: { type: "string", required: true, description: "The document title." },
      company: { type: "string", required: false, description: "Owning company — name or id (company wins if a person is also given)." },
      person: { type: "string", required: false, description: "Owning person — name or id." },
      category: { type: "string", required: false, description: "Filing category (e.g. Finance, Legal, HR)." },
      docType: { type: "string", required: false, description: "Document type label (e.g. Certificate, Invoice)." },
      issuer: { type: "string", required: false, description: "Who issued the document." },
      referenceNo: { type: "string", required: false, description: "Reference / control number." },
      issueDate: { type: "date", required: false, description: "Issue date (YYYY-MM-DD)." },
      expiryDate: { type: "date", required: false, description: "Expiry date (YYYY-MM-DD)." },
      notes: { type: "string", required: false, description: "Free-text notes." },
    },
    async run(args) {
      const title = str(args.title);
      if (!title) return { ok: false, message: "Give the document a title." };
      const owner = await resolveOwner(args.company, args.person);
      if (owner.error) return { ok: false, message: owner.error };
      const fd = toForm({
        title,
        companyId: owner.companyId ?? undefined,
        personId: owner.personId ?? undefined,
        category: str(args.category),
        docType: str(args.docType),
        issuer: str(args.issuer),
        referenceNo: str(args.referenceNo),
        issueDate: str(args.issueDate),
        expiryDate: str(args.expiryDate),
        notes: str(args.notes),
      });
      const res = await createDocumentAction(fd);
      if (!res.ok) return { ok: false, message: res.error };
      // Newly-created doc → undo archives it (soft, reversible), the clean inverse of "created".
      return {
        ok: true,
        message: `Filed "${title}".`,
        redirect: `/documents`,
        undo: res.id ? { kind: "ori.document.archive", payload: { documentId: res.id, before: false } } : undefined,
      };
    },
  },
  {
    name: "update_document",
    tier: 2,
    description: "Edit a document's fields (title, owner, category, type, issuer, reference, dates, notes).",
    params: {
      document: { type: "string", required: true, description: "The document — its id or current title." },
      title: { type: "string", required: false, description: "New title." },
      company: { type: "string", required: false, description: "New owning company — name or id." },
      person: { type: "string", required: false, description: "New owning person — name or id." },
      category: { type: "string", required: false, description: "New category." },
      docType: { type: "string", required: false, description: "New document type." },
      issuer: { type: "string", required: false, description: "New issuer." },
      referenceNo: { type: "string", required: false, description: "New reference / control number." },
      issueDate: { type: "date", required: false, description: "New issue date (YYYY-MM-DD)." },
      expiryDate: { type: "date", required: false, description: "New expiry date (YYYY-MM-DD)." },
      notes: { type: "string", required: false, description: "New notes." },
    },
    async run(args) {
      const doc = await resolveDocument(str(args.document));
      if (!doc) return { ok: false, message: `Couldn't find a document matching "${str(args.document)}".` };
      const owner = await resolveOwner(args.company, args.person);
      if (owner.error) return { ok: false, message: owner.error };

      // Snapshot the editable columns BEFORE the write, so the undo restores them exactly.
      const { data: before } = await sb.from("documents").select(DOC_EDIT_COLS).eq("id", doc.id).maybeSingle();

      const fields: Record<string, string | number | null | undefined> = {
        // updateDocumentAction re-parses the WHOLE form via inputFromForm, so title
        // must be present or it errors — fall back to the current title.
        title: str(args.title) || doc.title,
        category: str(args.category),
        docType: str(args.docType),
        issuer: str(args.issuer),
        referenceNo: str(args.referenceNo),
        issueDate: str(args.issueDate),
        expiryDate: str(args.expiryDate),
        notes: str(args.notes),
      };
      if (owner.companyId) fields.companyId = owner.companyId;
      if (owner.personId) fields.personId = owner.personId;

      const res = await updateDocumentAction(doc.id, toForm(fields));
      if (!res.ok) return { ok: false, message: res.error };
      return {
        ok: true,
        message: `Updated "${str(args.title) || doc.title}".`,
        redirect: `/documents`,
        // ⚠️ needs a sibling-registered handler `ori.document.update` in undo-handlers/ori.ts.
        undo: before ? { kind: "ori.document.update", payload: { documentId: doc.id, before } } : undefined,
      };
    },
  },
  {
    name: "archive_document",
    tier: 2,
    description: "Archive a document (hides it from the library; reversible).",
    params: {
      document: { type: "string", required: true, description: "The document — its id or title." },
    },
    async run(args) {
      const doc = await resolveDocument(str(args.document));
      if (!doc) return { ok: false, message: `Couldn't find a document matching "${str(args.document)}".` };
      const res = await archiveDocumentAction(doc.id, true);
      if (!res.ok) return { ok: false, message: res.error };
      return {
        ok: true,
        message: `Archived "${doc.title}".`,
        redirect: `/documents`,
        undo: { kind: "ori.document.archive", payload: { documentId: doc.id, before: false } },
      };
    },
  },
  {
    name: "renew_document",
    tier: 2,
    description: "Create (or find the open) renewal task for an expiring document assigned to a company.",
    params: {
      document: { type: "string", required: true, description: "The document — its id or title." },
    },
    async run(args) {
      const doc = await resolveDocument(str(args.document));
      if (!doc) return { ok: false, message: `Couldn't find a document matching "${str(args.document)}".` };
      const res = await renewDocumentAction(doc.id);
      if (!res.ok) return { ok: false, message: res.error };
      // renewDocumentAction is idempotent (returns the existing open task if any) and
      // creates a normal task; no undo needed here.
      return {
        ok: true,
        message: res.code ? `Renewal task ${res.code} ready for "${doc.title}".` : `Renewal ready for "${doc.title}".`,
        redirect: res.code ? `/task/${res.code}` : `/documents`,
      };
    },
  },
  {
    name: "record_fact",
    tier: 2,
    description:
      "Append a fact to the (append-only) ledger for a person or company (salary, shareholding, director, bank, passport, contract, etc.).",
    params: {
      entityType: { type: "string", required: true, description: '"person" or "company".' },
      entity: { type: "string", required: true, description: "The person or company — name or id." },
      field: { type: "string", required: true, description: "The fact field (e.g. salary, shareholding, director)." },
      value: { type: "string", required: true, description: "The fact value." },
      effectiveDate: { type: "date", required: false, description: "When the fact takes effect (YYYY-MM-DD); defaults to today." },
      source: { type: "string", required: false, description: "Where the fact came from (document/note)." },
      note: { type: "string", required: false, description: "Optional note." },
    },
    async run(args) {
      const entityType = str(args.entityType) as FactEntityType | undefined;
      if (entityType !== "person" && entityType !== "company") {
        return { ok: false, message: 'entityType must be "person" or "company".' };
      }
      const entityRef = str(args.entity);
      if (!entityRef) return { ok: false, message: "Say which person or company this fact is about." };
      const resolved =
        entityType === "company" ? await resolveCompany(entityRef) : await resolvePerson(entityRef);
      if (!resolved) return { ok: false, message: `Couldn't find a ${entityType} matching "${entityRef}".` };
      const field = str(args.field);
      const value = str(args.value);
      if (!field) return { ok: false, message: "Say which fact to record." };
      if (!value) return { ok: false, message: "Give the fact's value." };
      const res = await recordFactAction({
        entityType,
        entityId: resolved.id,
        field,
        valueText: value,
        effectiveDate: str(args.effectiveDate) || undefined,
        source: str(args.source) || undefined,
        note: str(args.note) || undefined,
        verified: false,
      });
      if (!res.ok) return { ok: false, message: res.error ?? "Couldn't record that fact." };
      // The ledger is append-only; recordFactAction returns no id, so no clean single-row
      // undo is emitted (deleting the latest fact would be a hard delete — forbidden).
      return {
        ok: true,
        message: `Recorded ${field} for ${resolved.name}.`,
        redirect: entityType === "company" ? `/companies/${resolved.id}` : `/people`,
      };
    },
  },
  {
    name: "verify_fact",
    tier: 2,
    description: "Mark a ledger fact as verified (or unverified).",
    params: {
      factId: { type: "number", required: true, description: "The fact's id." },
      entityType: { type: "string", required: true, description: `"person" or "company" (the fact's owner).` },
      entity: { type: "string", required: true, description: "The owning person or company — name or id." },
      verified: { type: "string", required: false, description: 'Pass "0" to un-verify; defaults to verified.' },
    },
    async run(args) {
      const id = intArg(args.factId);
      if (!id) return { ok: false, message: "Give the fact's id." };
      const entityType = str(args.entityType) as FactEntityType | undefined;
      if (entityType !== "person" && entityType !== "company") {
        return { ok: false, message: 'entityType must be "person" or "company".' };
      }
      const entityRef = str(args.entity);
      if (!entityRef) return { ok: false, message: "Say which person or company the fact belongs to." };
      const resolved =
        entityType === "company" ? await resolveCompany(entityRef) : await resolvePerson(entityRef);
      if (!resolved) return { ok: false, message: `Couldn't find a ${entityType} matching "${entityRef}".` };
      const verified = str(args.verified) !== "0";
      const res = await verifyFactAction(id, verified, entityType, resolved.id);
      if (!res.ok) return { ok: false, message: "Couldn't update that fact." };
      return {
        ok: true,
        message: `Fact #${id} marked ${verified ? "verified" : "unverified"}.`,
        redirect: entityType === "company" ? `/companies/${resolved.id}` : `/people`,
      };
    },
  },
  // NOTE: delete_fact (deleteFactAction) is intentionally OMITTED — see changelog SKIPPED.
];

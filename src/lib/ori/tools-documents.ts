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
  markDocumentVettedAction,
  renewDocumentAction,
  splitDocumentAction,
  rescanDocumentAction,
  confirmSortItemAction,
  trashIntakeDocAction,
} from "@/app/documents/actions";
import {
  createInboxBundle,
  markInboxFiled,
  dismissInboxItem,
} from "@/app/inbox/actions";
import {
  acceptSuggestionAction,
  dismissSuggestionAction,
} from "@/app/suggestions/actions";
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
  "title,company_id,person_id,category,doc_type,issuer,reference_no,issue_date,expiry_date,notes,review_status" as const;

export const DOCUMENT_TOOLS: ToolDef[] = [
  // ── Documents ──────────────────────────────────────────────────────────────
  {
    name: "create_document",
    tier: 2,
    description:
      "File a new document record (title + optional owner, category, type, issuer, reference, dates). Reuses the Documents create path so compliance and facts update.",
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
    name: "mark_document_vetted",
    tier: 2,
    description: "Mark a document as vetted/confirmed so re-scan leaves it alone.",
    params: {
      document: { type: "string", required: true, description: "The document — its id or title." },
    },
    async run(args) {
      const doc = await resolveDocument(str(args.document));
      if (!doc) return { ok: false, message: `Couldn't find a document matching "${str(args.document)}".` };
      const res = await markDocumentVettedAction(doc.id);
      if (!res.ok) return { ok: false, message: res.error };
      // No undo: "vetted" carries no meaningful inverse (un-vetting isn't a user action).
      return { ok: true, message: `Marked "${doc.title}" as vetted.`, redirect: `/documents` };
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
    name: "rescan_document",
    tier: 2,
    description:
      "Re-read a stored document with the intake brain and PROPOSE field corrections. Read-only proposal — it does not apply changes on its own.",
    params: {
      document: { type: "string", required: true, description: "The document — its id or title." },
      force: { type: "string", required: false, description: "Pass \"1\" to re-OCR even a scanner-watermarked file." },
    },
    async run(args) {
      const doc = await resolveDocument(str(args.document));
      if (!doc) return { ok: false, message: `Couldn't find a document matching "${str(args.document)}".` };
      const res = await rescanDocumentAction(doc.id, str(args.force) === "1");
      if (!res.ok) return { ok: false, message: res.error ?? "Couldn't re-read the file." };
      const n = res.changes?.length ?? 0;
      return {
        ok: true,
        message: n
          ? `Re-read "${doc.title}" — ${n} suggested change${n === 1 ? "" : "s"} ready to review on the document.`
          : `Re-read "${doc.title}" — no changes suggested.`,
        redirect: `/documents`,
      };
    },
  },
  {
    name: "split_document",
    tier: 2,
    description:
      "Split one compiled/multi-part document into separate records. Provide the parts as a JSON array of segments (title/category/etc.); at least two parts.",
    params: {
      document: { type: "string", required: true, description: "The document to split — its id or title." },
      segments: { type: "string", required: true, description: "JSON array (≥2) of segment objects {title, category?, docType?, issuer?, referenceNo?, pageRange?}." },
    },
    async run(args) {
      const doc = await resolveDocument(str(args.document));
      if (!doc) return { ok: false, message: `Couldn't find a document matching "${str(args.document)}".` };
      let segments: unknown;
      try {
        segments = JSON.parse(str(args.segments) ?? "");
      } catch {
        return { ok: false, message: "The segments must be a valid JSON array." };
      }
      if (!Array.isArray(segments) || segments.length < 2) {
        return { ok: false, message: "Provide at least two parts to split the document into." };
      }
      // splitDocumentAction expects ExtractedSegment[]; pass through the planner array.
      const res = await splitDocumentAction(doc.id, segments as never);
      if (!res.ok) return { ok: false, message: res.error };
      // No clean single-step inverse (the original row is re-purposed as part 1 and
      // new rows are created); leave undo to the manual merge flow.
      return {
        ok: true,
        message: `Split "${doc.title}" into ${res.created.length + 1} documents.`,
        redirect: `/documents`,
      };
    },
  },
  {
    name: "confirm_sort_item",
    tier: 2,
    description:
      "Confirm a To-Sort (quarantined) document — accept it into the library, optionally correcting owner/category/expiry. Rebuilds the house-format title.",
    params: {
      document: { type: "string", required: true, description: "The queued document — its id or title." },
      company: { type: "string", required: false, description: "Correct owning company — name or id." },
      person: { type: "string", required: false, description: "Correct owning person — name or id." },
      category: { type: "string", required: false, description: "Correct category." },
      expiryDate: { type: "date", required: false, description: "Correct expiry date (YYYY-MM-DD)." },
    },
    async run(args) {
      const doc = await resolveDocument(str(args.document));
      if (!doc) return { ok: false, message: `Couldn't find a document matching "${str(args.document)}".` };
      const owner = await resolveOwner(args.company, args.person);
      if (owner.error) return { ok: false, message: owner.error };
      const patch: { companyId?: number | null; personId?: number | null; category?: string | null; expiryDate?: string | null } = {};
      if (owner.companyId) patch.companyId = owner.companyId;
      if (owner.personId) patch.personId = owner.personId;
      const cat = str(args.category);
      if (cat) patch.category = cat;
      const exp = str(args.expiryDate);
      if (exp) patch.expiryDate = exp;
      const res = await confirmSortItemAction(doc.id, Object.keys(patch).length ? patch : undefined);
      if (!res.ok) return { ok: false, message: res.error ?? "Couldn't confirm this document." };
      return { ok: true, message: `Filed "${res.title ?? doc.title}" into the library.`, redirect: `/documents` };
    },
  },

  // ── Inbox ────────────────────────────────────────────────────────────────
  {
    name: "create_inbox_bundle",
    tier: 2,
    description: "Create a text bundle in the intake inbox (for later Processing/sorting). Text-only — file uploads go through the UI.",
    params: {
      subject: { type: "string", required: false, description: "Optional subject/label for the bundle." },
      body: { type: "string", required: true, description: "The text to capture." },
    },
    async run(args) {
      const body = str(args.body);
      if (!body) return { ok: false, message: "Give the bundle some text to capture." };
      const fd = new FormData();
      const subject = str(args.subject);
      if (subject) fd.set("subject", subject);
      fd.set("body", body);
      const res = await createInboxBundle(fd);
      if (!res.ok) return { ok: false, message: res.error };
      return { ok: true, message: `Added to the inbox.`, redirect: `/inbox` };
    },
  },
  {
    name: "mark_inbox_filed",
    tier: 2,
    description: "Mark an inbox bundle as filed against a task, note or document(s).",
    params: {
      inboxId: { type: "number", required: true, description: "The inbox bundle's id." },
      filedKind: { type: "string", required: true, description: 'What it was filed as: "task", "note" or "documents".' },
      filedRef: { type: "string", required: true, description: "Reference of what it was filed to (e.g. task code or document id)." },
    },
    async run(args) {
      const id = intArg(args.inboxId);
      if (!id) return { ok: false, message: "Give the inbox bundle's id." };
      const kind = str(args.filedKind);
      if (kind !== "task" && kind !== "note" && kind !== "documents") {
        return { ok: false, message: 'filedKind must be "task", "note" or "documents".' };
      }
      const ref = str(args.filedRef);
      if (!ref) return { ok: false, message: "Give the reference it was filed to." };
      await markInboxFiled(id, kind, ref);
      return { ok: true, message: `Marked inbox bundle #${id} as filed.`, redirect: `/inbox` };
    },
  },
  {
    name: "dismiss_inbox_item",
    tier: 2,
    description: "Dismiss an inbox bundle (removes it from the pending queue; its uploaded copies are cleaned up).",
    params: {
      inboxId: { type: "number", required: true, description: "The inbox bundle's id." },
    },
    async run(args) {
      const id = intArg(args.inboxId);
      if (!id) return { ok: false, message: "Give the inbox bundle's id." };
      await dismissInboxItem(id);
      // No undo: dismiss removes the bundle's stored attachments; not cleanly reversible.
      return { ok: true, message: `Dismissed inbox bundle #${id}.`, redirect: `/inbox` };
    },
  },

  // ── Profile suggestions ──────────────────────────────────────────────────
  {
    name: "accept_suggestion",
    tier: 2,
    description: "Accept a pending profile suggestion (applies the suggested field to the person/company record).",
    params: {
      suggestionId: { type: "number", required: true, description: "The profile-suggestion id." },
    },
    async run(args) {
      const id = intArg(args.suggestionId);
      if (!id) return { ok: false, message: "Give the suggestion's id." };
      const res = await acceptSuggestionAction(id);
      if (!res.ok) return { ok: false, message: res.error ?? "Couldn't accept that suggestion." };
      // Reversible via the app's own undoSuggestionAction, but that needs a dedicated
      // handler kind — left to the suggestions UI for now (no ori.* undo emitted).
      return { ok: true, message: `Applied suggestion #${id}.` };
    },
  },
  {
    name: "dismiss_suggestion",
    tier: 2,
    description: "Dismiss a pending profile suggestion without applying it.",
    params: {
      suggestionId: { type: "number", required: true, description: "The profile-suggestion id." },
    },
    async run(args) {
      const id = intArg(args.suggestionId);
      if (!id) return { ok: false, message: "Give the suggestion's id." };
      const res = await dismissSuggestionAction(id);
      if (!res.ok) return { ok: false, message: "Couldn't dismiss that suggestion." };
      return { ok: true, message: `Dismissed suggestion #${id}.` };
    },
  },

  // ── Facts ledger ─────────────────────────────────────────────────────────
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

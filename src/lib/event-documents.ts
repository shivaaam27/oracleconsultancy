import "server-only";

// event-documents.ts — the papers attached to a diary entry.
//
// An attachment is a normal row in the documents library plus a link row. That
// is the whole design: nothing about an event attachment is special-cased in
// storage, so a ticket you attach today is findable in /documents tomorrow, can
// be re-used on the return leg, and obeys the same archive/expiry rules as
// everything else. See migration 0117.

import { sb } from "@/db/supabase";
import { DOCUMENTS_BUCKET, getDocument, type DocumentRow } from "@/lib/documents";
import { emailAssetBaseUrl } from "@/lib/app-url";

export type EventDocument = DocumentRow & {
  /** Does this file ride along on the invitation email? */
  sendWithInvite: boolean;
  sortOrder: number;
};

const DOC_COLUMNS =
  "id,title,company_id,person_id,vendor_id,category,doc_type,issuer,reference_no,issue_date," +
  "expiry_date,reminder_lead_days,file_url,storage_path,file_name,notes,archived,created_at," +
  "updated_at,created_by";

type LinkRow = {
  document_id: number;
  send_with_invite: boolean;
  sort_order: number;
  documents: Record<string, unknown> | null;
};

const d = (s: unknown): Date | null => (typeof s === "string" && s ? new Date(s) : null);

function mapJoined(r: LinkRow): EventDocument | null {
  const doc = r.documents;
  if (!doc) return null;
  return {
    id: doc.id as number,
    title: doc.title as string,
    companyId: (doc.company_id as number) ?? null,
    personId: (doc.person_id as number) ?? null,
    vendorId: (doc.vendor_id as number) ?? null,
    category: (doc.category as string) ?? null,
    docType: (doc.doc_type as string) ?? null,
    issuer: (doc.issuer as string) ?? null,
    referenceNo: (doc.reference_no as string) ?? null,
    issueDate: d(doc.issue_date),
    expiryDate: d(doc.expiry_date),
    reminderLeadDays: (doc.reminder_lead_days as number) ?? 30,
    fileUrl: (doc.file_url as string) ?? null,
    storagePath: (doc.storage_path as string) ?? null,
    fileName: (doc.file_name as string) ?? null,
    notes: (doc.notes as string) ?? null,
    archived: !!doc.archived,
    createdAt: d(doc.created_at) ?? new Date(),
    updatedAt: d(doc.updated_at) ?? new Date(),
    createdBy: (doc.created_by as string) ?? "web-ui",
    sendWithInvite: r.send_with_invite !== false,
    sortOrder: (r.sort_order as number) ?? 0,
  };
}

/** Documents attached to an event, in the order they were added. */
export async function listEventDocuments(eventId: number): Promise<EventDocument[]> {
  const { data, error } = await sb
    .from("event_documents")
    .select(`document_id,send_with_invite,sort_order,documents(${DOC_COLUMNS})`)
    .eq("event_id", eventId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as LinkRow[])
    .map(mapJoined)
    .filter((x): x is EventDocument => x !== null)
    // An archived document stays linked (the history is real) but is not offered
    // up as a live attachment.
    .filter((x) => !x.archived);
}

/** Attachment counts for a set of events — one query, for list/grid views. */
export async function countEventDocuments(eventIds: number[]): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  const ids = [...new Set(eventIds.filter((n) => Number.isFinite(n)))];
  if (!ids.length) return out;
  const { data, error } = await sb.from("event_documents").select("event_id").in("event_id", ids);
  if (error) return out;
  for (const r of (data ?? []) as Array<{ event_id: number }>) {
    out.set(r.event_id, (out.get(r.event_id) ?? 0) + 1);
  }
  return out;
}

/** Attach an already-filed document to an event. Idempotent. */
export async function linkEventDocument(
  eventId: number,
  documentId: number,
  opts?: { sendWithInvite?: boolean; sortOrder?: number; createdBy?: string }
): Promise<void> {
  const { error } = await sb.from("event_documents").upsert(
    {
      event_id: eventId,
      document_id: documentId,
      send_with_invite: opts?.sendWithInvite ?? true,
      sort_order: opts?.sortOrder ?? 0,
      created_at: new Date().toISOString(),
      created_by: opts?.createdBy ?? "web-ui",
    },
    { onConflict: "event_id,document_id", ignoreDuplicates: true }
  );
  if (error) throw new Error(error.message);
}

/** Take a document off an event. The document itself is untouched — it stays in
 *  the library, exactly as removing a task's link never deletes the file. */
export async function unlinkEventDocument(eventId: number, documentId: number): Promise<void> {
  const { error } = await sb
    .from("event_documents")
    .delete()
    .eq("event_id", eventId)
    .eq("document_id", documentId);
  if (error) throw new Error(error.message);
}

export async function setEventDocumentSendFlag(
  eventId: number,
  documentId: number,
  sendWithInvite: boolean
): Promise<void> {
  const { error } = await sb
    .from("event_documents")
    .update({ send_with_invite: sendWithInvite })
    .eq("event_id", eventId)
    .eq("document_id", documentId);
  if (error) throw new Error(error.message);
}

/** True when this document is attached to this event — the authorisation check
 *  behind the per-event file link. Never trust an id from a URL alone.
 *
 *  `sharedOnly` is the check the PUBLIC route uses: `send_with_invite` means
 *  "the guests may have this", so it governs the public link exactly as it
 *  governs the email. A reference-only attachment is invisible outside the
 *  admin side, and un-ticking the box withdraws it from both at once. */
export async function isDocumentOnEvent(
  eventId: number,
  documentId: number,
  opts?: { sharedOnly?: boolean }
): Promise<boolean> {
  let q = sb
    .from("event_documents")
    .select("document_id")
    .eq("event_id", eventId)
    .eq("document_id", documentId);
  if (opts?.sharedOnly) q = q.eq("send_with_invite", true);
  const { data } = await q.maybeSingle();
  return !!data;
}

/* ---------------------------------------------------------------------- */
/* Permanent links                                                         */
/* ---------------------------------------------------------------------- */

/**
 * The forever-URL for one attachment: /e/<event token>/doc/<document id>.
 *
 * `emailAssetBaseUrl()` rather than `appBaseUrl()` on purpose. This link is read
 * on someone else's phone, months later, from a calendar entry — the same
 * reasoning that made the email masthead borrow the production host. A
 * localhost link in an .ics is a dead paperclip.
 */
export function eventDocumentUrl(publicToken: string, documentId: number): string {
  return `${emailAssetBaseUrl()}/e/${publicToken}/doc/${documentId}`;
}

export type EventAttachmentLink = {
  documentId: number;
  title: string;
  fileName: string | null;
  url: string;
  mimeType: string | null;
};

/** Guess a MIME type from the file name — clients use it to pick an icon, and
 *  storage does not always give us one back. */
function guessMime(fileName: string | null): string | null {
  const ext = (fileName ?? "").toLowerCase().split(".").pop() ?? "";
  const map: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", heic: "image/heic", webp: "image/webp",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    csv: "text/csv", txt: "text/plain", zip: "application/zip",
  };
  return map[ext] ?? null;
}

/** Shareable links for the papers a guest is allowed to see. */
export async function eventAttachmentLinks(
  eventId: number,
  publicToken: string
): Promise<EventAttachmentLink[]> {
  const docs = await listEventDocuments(eventId);
  return docs
    .filter((d) => d.sendWithInvite && d.storagePath)
    .map((d) => ({
      documentId: d.id,
      title: d.title,
      fileName: d.fileName,
      url: eventDocumentUrl(publicToken, d.id),
      mimeType: guessMime(d.fileName),
    }));
}

/* ---------------------------------------------------------------------- */
/* Bytes                                                                   */
/* ---------------------------------------------------------------------- */

export type LoadedAttachment = {
  documentId: number;
  fileName: string;
  contentType: string;
  bytes: Buffer;
};

/** Mailbox ceiling. Gmail rejects a message over ~25 MB including encoding
 *  overhead, and base64 adds a third — so the real budget for raw bytes is
 *  smaller than the number people quote. Over this, the email carries the
 *  permanent link instead and the caller SAYS SO rather than silently dropping
 *  the file. Override with EVENT_ATTACH_MAX_BYTES if a provider allows more. */
export const EMAIL_ATTACH_BUDGET_BYTES = (() => {
  const raw = process.env.EVENT_ATTACH_MAX_BYTES;
  const n = raw ? parseInt(raw, 10) : NaN;
  if (Number.isFinite(n) && n > 0) return Math.min(n, 40 * 1024 * 1024);
  return 15 * 1024 * 1024;
})();

/** Pull an attachment's bytes out of storage. Null when the row has no file. */
export async function loadAttachmentBytes(doc: DocumentRow): Promise<LoadedAttachment | null> {
  if (!doc.storagePath) return null;
  const { data, error } = await sb.storage.from(DOCUMENTS_BUCKET).download(doc.storagePath);
  if (error || !data) return null;
  const bytes = Buffer.from(await data.arrayBuffer());
  return {
    documentId: doc.id,
    fileName: doc.fileName || `${doc.title}`,
    contentType: data.type || "application/octet-stream",
    bytes,
  };
}

export type AttachmentSelection = {
  /** Files small enough to ride on the email. */
  attach: LoadedAttachment[];
  /** Files left off because the mailbox would bounce the message. */
  tooLarge: Array<{ documentId: number; title: string; fileName: string; bytes: number }>;
};

/**
 * Decide what actually goes on the invitation email, newest-first within the
 * shared budget. Anything that doesn't fit is REPORTED, not dropped quietly:
 * the caller tells the owner "the ticket was too big to attach, the link is in
 * the email", which is a fact he can act on.
 */
export async function selectEmailAttachments(eventId: number): Promise<AttachmentSelection> {
  const docs = (await listEventDocuments(eventId)).filter((d) => d.sendWithInvite && d.storagePath);
  const attach: LoadedAttachment[] = [];
  const tooLarge: AttachmentSelection["tooLarge"] = [];
  let budget = EMAIL_ATTACH_BUDGET_BYTES;

  for (const doc of docs) {
    const loaded = await loadAttachmentBytes(doc);
    if (!loaded) continue;
    if (loaded.bytes.length > budget) {
      tooLarge.push({ documentId: doc.id, title: doc.title, fileName: loaded.fileName, bytes: loaded.bytes.length });
      continue;
    }
    budget -= loaded.bytes.length;
    attach.push(loaded);
  }

  return { attach, tooLarge };
}

/** One document, checked to be genuinely attached to the event. Pass
 *  `sharedOnly` from any public path so a reference-only file is never served. */
export async function getEventDocument(
  eventId: number,
  documentId: number,
  opts?: { sharedOnly?: boolean }
): Promise<DocumentRow | null> {
  if (!(await isDocumentOnEvent(eventId, documentId, opts))) return null;
  const doc = await getDocument(documentId);
  return doc && !doc.archived ? doc : null;
}

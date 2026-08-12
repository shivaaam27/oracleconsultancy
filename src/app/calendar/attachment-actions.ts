"use server";

// The door between the event form and the papers attached to an event.
//
// Two jobs, kept apart on purpose:
//
//   FILE IT   — a dropped file becomes a normal `documents` row (the browser has
//               already put the bytes in the bucket, so nothing large travels
//               through a serverless request body) and is linked to the event.
//   READ IT   — the same file is read for what event it describes, and the
//               fields are HANDED BACK to the form. Nothing is saved from a
//               read: the owner sees what was found, corrects it, and presses
//               Save. Intelligence may read and suggest; it never files.
//
// ── Who may call these ────────────────────────────────────────────────────
// A server action is a POST to whatever page invoked it, so the admin edge gate
// in src/proxy.ts does NOT cover an action a PORTAL page imports. Every action
// here therefore checks for itself:
//
//   • uploading + reading a file you just staged — admin OR a portal user who
//     is allowed to create events (they supplied the file; nothing existing is
//     exposed);
//   • anything that reaches INTO the library, or edits an existing event's
//     attachments — ADMIN ONLY. Otherwise a company-scoped director could link
//     any document in the system to an event and then read it off the public
//     page. The portal form deliberately offers upload only.

import { revalidatePath } from "next/cache";
import { readEventFile, type EventReadResult } from "@/lib/event-read";
import {
  createDocument,
  attachUploadedFile,
  deleteDocumentForever,
  downloadStoredFile,
  getDocument,
  listDocuments,
  type DocumentRow,
} from "@/lib/documents";
import { sb } from "@/db/supabase";
import {
  linkEventDocument,
  unlinkEventDocument,
  setEventDocumentSendFlag,
  listEventDocuments,
  type EventDocument,
} from "@/lib/event-documents";
import { isAdminSession } from "@/lib/admin-auth";
import { getPortalPerson } from "@/lib/portal-auth";
import { recordEvent } from "@/lib/system-events";

/** Where a browser upload lands before it belongs to anything. Mirrors the
 *  STAGING constant in documents/upload-actions.ts. */
const STAGING_PREFIX = "uploads/";

type Denied = { ok: false; error: string };
const DENIED: Denied = { ok: false, error: "You don't have permission to do that." };

/**
 * Who is asking, resolved from the session — never from the client. The stamp
 * this returns is written to `documents.created_by`, and the portal event path
 * uses it to check that a submitted document id is one THIS person uploaded
 * (see `attachableDocumentIds` in portal/actions.ts). A client-supplied stamp
 * would make that check meaningless.
 */
async function resolveAttacher(): Promise<{ allowed: boolean; stamp: string; isOwner: boolean }> {
  if (await isAdminSession()) return { allowed: true, stamp: "web-ui", isOwner: true };
  const me = await getPortalPerson();
  if (me?.caps.createEvents) return { allowed: true, stamp: `portal:${me.name}`, isOwner: false };
  return { allowed: false, stamp: "", isOwner: false };
}

/** Admin, or a portal user allowed to create events. Both genuinely need to
 *  attach a ticket to something they are creating. */
async function canAttach(): Promise<boolean> {
  return (await resolveAttacher()).allowed;
}

/** The owner only — anything that reads or rearranges the existing library. */
async function isOwner(): Promise<boolean> {
  return isAdminSession();
}

/* ---------------------------------------------------------------------- */
/* Reading                                                                 */
/* ---------------------------------------------------------------------- */

const readFailure = (note: string): EventReadResult => ({
  ok: false, read: null, title: null, source: "none", confidence: null, note,
});

/**
 * Read a STAGED upload as an event — what it is, when, where, and (for a ticket)
 * the flight details. Read-only: it writes nothing at all.
 *
 * Deliberately restricted to `uploads/` paths. The caller passes a path, and an
 * unrestricted version would happily read any document in the bucket back to
 * whoever asked. A staged path is one this person has just been handed a signed
 * upload slot for, so "read the file I just gave you" is the only thing it can
 * ever mean. That is also why the form reads BEFORE filing: filing moves the
 * object out of `uploads/`, and the narrow rule is worth the ordering.
 */
export async function readEventFileAction(input: {
  path: string;
  fileName: string;
  mimeType?: string;
}): Promise<EventReadResult> {
  if (!(await canAttach())) return readFailure("You don't have permission to do that.");

  const { path, fileName, mimeType } = input;
  if (!path) return readFailure("No file provided.");
  if (!path.startsWith(STAGING_PREFIX) || path.includes("..")) {
    return readFailure("That file can't be read from here.");
  }

  let result: EventReadResult;
  const file = await downloadStoredFile(path, fileName, mimeType);
  if (!file) {
    result = readFailure("Couldn't fetch the uploaded file to read it. It's still there — fill the details in yourself.");
  } else {
    result = await readEventFile(file);
  }

  // One line per read, so "why did this come back blank" is answerable later.
  try {
    await recordEvent("event-read", result.ok ? "ok" : "error", {
      file: fileName,
      source: result.source,
      confidence: result.confidence,
      kind: result.read?.fields.kind ?? null,
      gaps: result.read?.gaps ?? null,
      note: result.note ?? null,
    });
  } catch { /* never blocks */ }

  return result;
}

/* ---------------------------------------------------------------------- */
/* Filing                                                                  */
/* ---------------------------------------------------------------------- */

export type FiledDocument = {
  id: number;
  title: string;
  fileName: string | null;
};

type FileResult = { ok: true; document: FiledDocument } | Denied;

/**
 * Turn a staged upload into a filed document.
 *
 * It lands in the library under its OWN file name, category "Attachment", with
 * no owner — exactly the convention chat and task attachments already follow.
 * Nothing is guessed: no company, no person, no renaming. Edit it in /documents
 * later if it deserves a proper home.
 *
 * `eventId` is optional so the form can file a document BEFORE the event exists
 * (a new event has no id until it saves); the form then submits the ids and
 * `createEventAction` links them.
 */
export async function fileEventAttachmentAction(input: {
  path: string;
  fileName: string;
  /** Overrides the title. Defaults to the file's own name. */
  title?: string | null;
  companyId?: number | null;
  eventId?: number | null;
}): Promise<FileResult> {
  const who = await resolveAttacher();
  if (!who.allowed) return DENIED;

  const { path, fileName } = input;
  if (!path || !fileName) return { ok: false, error: "No file to attach." };
  if (!path.startsWith(STAGING_PREFIX) || path.includes("..")) {
    return { ok: false, error: "That file can't be attached from here." };
  }
  // Linking to an EXISTING event is an owner action (see the header note).
  if (input.eventId && !who.isOwner) return DENIED;

  try {
    const title = (input.title ?? "").trim() || fileName.replace(/\.[a-z0-9]{1,8}$/i, "") || fileName;
    const documentId = await createDocument(
      {
        title,
        companyId: input.companyId ?? null,
        category: "Attachment",
      },
      who.stamp
    );
    await attachUploadedFile(documentId, path, fileName);

    if (input.eventId) {
      await linkEventDocument(input.eventId, documentId, { createdBy: who.stamp });
    }

    revalidatePath("/documents");
    if (input.eventId) revalidatePath("/calendar");
    return { ok: true, document: { id: documentId, title, fileName } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save that file." };
  }
}

/* ---------------------------------------------------------------------- */
/* Linking — owner only                                                    */
/* ---------------------------------------------------------------------- */

type Ok = { ok: true } | Denied;

export async function linkEventDocumentAction(eventId: number, documentId: number): Promise<Ok> {
  if (!(await isOwner())) return DENIED;
  try {
    await linkEventDocument(eventId, documentId);
    revalidatePath("/calendar");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not attach that document." };
  }
}

/** Take a paper off an event. The document itself stays in the library. */
export async function unlinkEventDocumentAction(eventId: number, documentId: number): Promise<Ok> {
  if (!(await isOwner())) return DENIED;
  try {
    await unlinkEventDocument(eventId, documentId);
    revalidatePath("/calendar");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not remove that attachment." };
  }
}

/** Tick/untick "share with guests" — governs the email AND the public link. */
export async function setEventDocumentShareAction(
  eventId: number,
  documentId: number,
  share: boolean
): Promise<Ok> {
  if (!(await isOwner())) return DENIED;
  try {
    await setEventDocumentSendFlag(eventId, documentId, share);
    revalidatePath("/calendar");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not change that." };
  }
}

/**
 * Bin an attachment the person added and then took off again before it meant
 * anything — the one-step-later sibling of `discardUploadAction`.
 *
 * Without this, dropping a ticket and changing your mind leaves a document in
 * the library for ever. That is precisely the clutter the Aug 2026 strip-out was
 * about, so it is worth cleaning up. It is also why the conditions are strict —
 * ALL of them must hold:
 *
 *   • it is attached to NO event any more (so a file shared with a second event
 *     is never pulled out from under it);
 *   • this caller created it (you can only bin your own);
 *   • it is category "Attachment" — never something deliberately filed;
 *   • it has no company, person or vendor — nobody has given it a home.
 *
 * Anything else is left alone. Best-effort: failing to tidy up is not an error
 * worth showing anyone.
 */
export async function discardEventAttachmentAction(documentId: number): Promise<void> {
  try {
    const who = await resolveAttacher();
    if (!who.allowed || !Number.isInteger(documentId) || documentId <= 0) return;

    const { data: links } = await sb
      .from("event_documents")
      .select("event_id")
      .eq("document_id", documentId)
      .limit(1);
    if (links && links.length) return; // still in use by an event

    const doc = await getDocument(documentId);
    if (!doc) return;
    if (doc.createdBy !== who.stamp) return;
    if (doc.category !== "Attachment") return;
    if (doc.companyId != null || doc.personId != null || doc.vendorId != null) return;

    await deleteDocumentForever(documentId);
    revalidatePath("/documents");
  } catch { /* tidying up never fails loudly */ }
}

export async function listEventDocumentsAction(eventId: number): Promise<EventDocument[]> {
  if (!(await isOwner())) return [];
  try {
    return await listEventDocuments(eventId);
  } catch {
    return [];
  }
}

/** Documents already in the library, for the "attach something filed" picker.
 *  Owner only — this is a read of the whole library. */
export async function searchDocumentsForEventAction(
  companyId?: number | null
): Promise<Array<{ id: number; title: string; fileName: string | null }>> {
  if (!(await isOwner())) return [];
  try {
    const all: DocumentRow[] = await listDocuments();
    const withFiles = all.filter((d) => d.storagePath);
    // A company's own papers first — usually what you want — then everything else.
    const ranked = companyId
      ? [...withFiles.filter((d) => d.companyId === companyId), ...withFiles.filter((d) => d.companyId !== companyId)]
      : withFiles;
    return ranked.slice(0, 300).map((d) => ({ id: d.id, title: d.title, fileName: d.fileName }));
  } catch {
    return [];
  }
}

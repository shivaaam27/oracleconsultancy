"use client";

import type { Editor } from "@tiptap/core";
import { createUploadSlotAction } from "@/app/documents/upload-actions";
import { attachFileToNote } from "@/app/notes/attachment-actions";

/**
 * Put a file into a note — the one path shared by the toolbar button, drag-and-drop
 * and paste-a-screenshot.
 *
 * The bytes go BROWSER → STORAGE directly, using a one-shot signed URL, and the
 * server only ever sees the path. That is not a micro-optimisation: a Next server
 * action caps its request body at a few megabytes, and a photo off a phone is
 * bigger than that, so routing the file through the server would fail for exactly
 * the files people most want to attach. The Documents module moved to this
 * arrangement in Aug 2026 for the same reason.
 *
 * A picture becomes an inline image; anything else becomes a document mention —
 * the same chip an `@` link makes, so files and links read alike and both end up
 * in `note_links` with one mechanism behind them.
 */

/** Big enough for a scan or a phone photo, small enough to stay a note rather than
 *  a file store. Documents proper is where a 100 MB thing belongs. */
export const NOTE_ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;

export type AttachOutcome = { ok: true; documentId: number; isImage: boolean } | { ok: false; error: string };

function isImage(file: File): boolean {
  return file.type.startsWith("image/");
}

function prettySize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Upload one file and insert it at the caret.
 *
 * Returns rather than throws: this runs from a paste handler, where an exception
 * would be swallowed by the browser and the owner would simply see nothing happen.
 */
export async function attachFileAtCaret(
  editor: Editor,
  noteId: number,
  file: File,
): Promise<AttachOutcome> {
  if (file.size === 0) return { ok: false, error: "That file is empty." };
  if (file.size > NOTE_ATTACHMENT_MAX_BYTES) {
    return {
      ok: false,
      error: `That file is ${prettySize(file.size)}. Notes take up to ${prettySize(NOTE_ATTACHMENT_MAX_BYTES)} — file it in Documents instead and link to it with @.`,
    };
  }

  // 1. A place to put it.
  const slot = await createUploadSlotAction(file.name);
  if (!slot.ok) return { ok: false, error: slot.error };

  // 2. The bytes, straight to storage.
  try {
    const res = await fetch(slot.signedUrl, {
      method: "PUT",
      body: file,
      headers: { "content-type": file.type || "application/octet-stream" },
    });
    if (!res.ok) return { ok: false, error: "The upload did not finish." };
  } catch {
    return { ok: false, error: "The upload did not finish." };
  }

  // 3. File it as a document and give the note its link.
  const filed = await attachFileToNote({ noteId, stagedPath: slot.path, fileName: file.name });
  if (!filed.ok) return { ok: false, error: filed.error };

  // 4. Put it in the writing.
  const image = isImage(file);
  editor
    .chain()
    .focus()
    .insertContent(
      image
        ? { type: "noteImage", attrs: { documentId: filed.documentId, alt: "" } }
        : [
            // A non-image file is a document mention — the same chip `@` produces,
            // so there is one kind of link in a note and not two.
            {
              type: "mention",
              attrs: { entity: "document", id: filed.documentId, code: null, label: filed.fileName },
            },
            { type: "text", text: " " },
          ],
    )
    .run();

  return { ok: true, documentId: filed.documentId, isImage: image };
}

/** Files worth taking from a drop or a paste. A paste of ordinary text carries no
 *  files, so this quietly returns nothing and the normal paste happens. */
export function filesFrom(data: DataTransfer | null): File[] {
  if (!data) return [];
  const out: File[] = [];
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind !== "file") continue;
    const f = item.getAsFile();
    if (f) out.push(f);
  }
  if (out.length === 0 && data.files?.length) out.push(...Array.from(data.files));
  return out;
}

"use server";

/**
 * Attaching a file to a note. Phase 2 leftover, built alongside Phase 4.
 *
 * The bytes NEVER pass through this file. The browser uploads straight to storage
 * with a one-shot signed URL (`createUploadSlotAction`, shared with Documents) and
 * the server is handed only a path — the same arrangement the Documents module
 * moved to in Aug 2026, because Vercel caps a serverless request body at 4.5 MB
 * and anything bigger used to fail as a mystery 404.
 *
 * A note's attachment is an ordinary `documents` row, filed exactly the way a chat
 * or task attachment is: the file's own name as the title, category "Attachment",
 * no owner until the owner edits it on /documents. Nothing is read, renamed,
 * classified or de-duplicated — the standing rule from the documents rebuild.
 */

import { revalidatePath } from "next/cache";
import { sb } from "@/db/supabase";
import { DOCUMENTS_BUCKET, createDocument, safeFileName } from "@/lib/documents";

export type AttachResult =
  | { ok: true; documentId: number; fileName: string }
  | { ok: false; error: string };

/**
 * File an already-uploaded staged object as a document belonging to this note.
 *
 * ⚠️ It also writes the `note_links` row itself, which looks like a violation of
 * "links are derived from the writing" — it is not, it is a head start. The node
 * about to be inserted into the body derives the very same row on the next save,
 * and `syncNoteLinks` rewrites the whole set from the document anyway, so the
 * steady state is still owned by the derive. Without it the image would ask
 * `/api/notes/file/<id>` for its bytes BEFORE any save had happened, that route
 * checks the link row, and every freshly pasted picture would flash a 404.
 */
export async function attachFileToNote(input: {
  noteId: number;
  stagedPath: string;
  fileName: string;
}): Promise<AttachResult> {
  try {
    if (!input.stagedPath.startsWith("uploads/")) {
      // Only ever adopt something this flow just staged. Without this the argument
      // is a free hand to point a document at any object in the bucket.
      return { ok: false, error: "That upload is not one of ours." };
    }
    const { data: note } = await sb.from("notes").select("id").eq("id", input.noteId).maybeSingle();
    if (!note) return { ok: false, error: "That note no longer exists." };

    const fileName = input.fileName || "file";
    const documentId = await createDocument(
      { title: fileName, category: "Attachment" },
      "web-ui",
    );

    // Move it under the document's own id so the bucket stays tidy and anything
    // left in `uploads/` is a cancelled upload. A failed move is not fatal — a
    // filed document with an untidy key beats a lost file.
    let finalPath = input.stagedPath;
    const leaf = input.stagedPath.split("/").pop() ?? safeFileName(fileName);
    const target = `${documentId}/${leaf}`;
    const { error: moveErr } = await sb.storage.from(DOCUMENTS_BUCKET).move(input.stagedPath, target);
    if (!moveErr) finalPath = target;

    await sb
      .from("documents")
      .update({ storage_path: finalPath, file_name: fileName, updated_at: new Date().toISOString() })
      .eq("id", documentId);

    // The head start described above.
    await sb
      .from("note_links")
      .upsert(
        { note_id: input.noteId, target_type: "document", target_id: documentId, target_code: null },
        { onConflict: "note_id,target_type,target_id" },
      );

    revalidatePath(`/notes/${input.noteId}`);
    revalidatePath("/documents");
    return { ok: true, documentId, fileName };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not attach that file." };
  }
}

"use server";

// Direct-to-storage uploads (Aug 2026).
//
// Files used to travel to the server inside a Next server action — both to be
// read by the AI and again to be saved. Vercel caps a serverless request body at
// 4.5 MB, so anything bigger was rejected before our code ran: the read looked
// like "the AI can't read this" and the save looked like a 404. Nothing above
// 4.5 MB had ever been filed.
//
// Now the browser uploads straight to Supabase Storage with a short-lived signed
// URL, and the server only ever handles the PATH. The request-body ceiling stops
// applying, because the bytes never pass through a serverless function.

import { sb } from "@/db/supabase";
import { DOCUMENTS_BUCKET, safeFileName } from "@/lib/documents";

/** Where a file lands before it belongs to a document. `attachUploadedFile`
 *  moves it under the document's own id on save; anything left here is a
 *  cancelled upload and safe to bin. */
const STAGING = "uploads";

export type UploadSlot =
  | { ok: true; path: string; signedUrl: string }
  | { ok: false; error: string };

/**
 * Mint a one-shot signed URL the browser can PUT a file to. The path is ours,
 * not the caller's, so a client can't write anywhere it likes in the bucket.
 */
export async function createUploadSlotAction(fileName: string): Promise<UploadSlot> {
  try {
    const clean = safeFileName(fileName || "file");
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const path = `${STAGING}/${unique}-${clean}`;

    const { data, error } = await sb.storage.from(DOCUMENTS_BUCKET).createSignedUploadUrl(path);
    if (error || !data?.signedUrl) {
      return { ok: false, error: error?.message ?? "Could not start the upload." };
    }
    return { ok: true, path: data.path ?? path, signedUrl: data.signedUrl };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not start the upload." };
  }
}

/**
 * Bin a staged file the owner never saved (skipped it in the queue, or closed
 * the dialog). Best-effort — an orphan in `uploads/` is untidy, not harmful.
 */
export async function discardUploadAction(path: string): Promise<void> {
  try {
    if (!path.startsWith(`${STAGING}/`)) return; // never touch a filed document
    await sb.storage.from(DOCUMENTS_BUCKET).remove([path]);
  } catch { /* best-effort */ }
}

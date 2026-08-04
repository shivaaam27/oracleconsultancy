"use client";

// Browser-side half of the direct upload. Asks the server for a signed slot,
// then PUTs the bytes straight to Supabase Storage — so the file never passes
// through a serverless function and Vercel's 4.5 MB request-body cap doesn't
// apply. See src/app/documents/upload-actions.ts for the why.

import { createUploadSlotAction } from "@/app/documents/upload-actions";
import { MAX_UPLOAD_BYTES } from "@/lib/documents-shared";

export type UploadedFile = {
  /** Object key in the documents bucket. */
  path: string;
  /** The name the owner uploaded it under — kept for display. */
  fileName: string;
  mimeType: string;
};

export type UploadResult =
  | { ok: true; file: UploadedFile }
  | { ok: false; error: string };

/** Upload one file straight to storage. Never throws. */
export async function uploadDirect(file: File): Promise<UploadResult> {
  if (!file || file.size === 0) return { ok: false, error: "That file is empty." };
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, error: `That file is larger than ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.` };
  }

  const slot = await createUploadSlotAction(file.name);
  if (!slot.ok) return { ok: false, error: slot.error };

  try {
    const res = await fetch(slot.signedUrl, {
      method: "PUT",
      body: file,
      headers: { "content-type": file.type || "application/octet-stream" },
    });
    if (!res.ok) {
      return { ok: false, error: `Upload failed (${res.status}). Check your connection and try again.` };
    }
    return {
      ok: true,
      file: { path: slot.path, fileName: file.name, mimeType: file.type || "application/octet-stream" },
    };
  } catch {
    return { ok: false, error: "Upload failed — check your connection and try again." };
  }
}

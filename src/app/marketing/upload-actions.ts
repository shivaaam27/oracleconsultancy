"use server";

import { revalidatePath } from "next/cache";
import { MARKETING_BUCKET, STAGING, recordAsset } from "@/lib/marketing-assets";
import { sb } from "@/db/supabase";

/* ------------------------------------------------------------------ *
 * Direct-to-storage uploads for the picture library.
 *
 * ⚠️ THE FILE NEVER TRAVELS THROUGH A SERVER ACTION. A serverless request body
 * caps at 4.5 MB and a phone photo is routinely bigger — a route that carried
 * the bytes would reject exactly the pictures somebody actually took, and the
 * failure would look like "it did not save" rather than "it was too big".
 *
 * So: the browser asks for a one-shot signed URL, PUTs the file straight to
 * storage, and then tells the server the PATH.
 * ------------------------------------------------------------------ */

export type UploadSlot =
  | { ok: true; path: string; signedUrl: string }
  | { ok: false; error: string };

/** Strip anything that would make a storage key awkward, keep the extension. */
function safeName(name: string): string {
  const cleaned = name.normalize("NFKD").replace(/[^\w.\-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return cleaned.slice(0, 120) || "file";
}

/**
 * Mint a one-shot signed URL the browser can PUT to.
 *
 * ⚠️ THE PATH IS OURS, NOT THE CALLER'S. A client that chose its own path could
 * write anywhere in the bucket, including over somebody else's picture.
 */
export async function createAssetSlotAction(fileName: string): Promise<UploadSlot> {
  try {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const path = `${STAGING}/${unique}-${safeName(fileName || "photo")}`;
    const { data, error } = await sb.storage.from(MARKETING_BUCKET).createSignedUploadUrl(path);
    if (error || !data?.signedUrl) {
      return { ok: false, error: error?.message ?? "Could not start the upload." };
    }
    return { ok: true, path: data.path ?? path, signedUrl: data.signedUrl };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not start the upload." };
  }
}

/** Bin a staged file nobody went on to save. Best-effort. */
export async function discardAssetUploadAction(path: string): Promise<void> {
  try {
    if (!path.startsWith(`${STAGING}/`)) return; // never touch a filed asset
    await sb.storage.from(MARKETING_BUCKET).remove([path]);
  } catch { /* an orphan is untidy, not harmful */ }
}

/** Turn an uploaded file into a picture in the library. */
export async function saveAssetAction(input: {
  stagedPath: string; fileName: string; mime?: string | null; bytes?: number | null;
  shootId?: number | null; companyId?: number | null; clientId?: number | null;
  caption?: string | null; tags?: string | null; takenOn?: string | null;
}): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  try {
    const id = await recordAsset(input);
    revalidatePath("/marketing/library");
    revalidatePath("/marketing/shoots");
    revalidatePath("/marketing");
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save it." };
  }
}

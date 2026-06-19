// Dropbox → inbox sync. Pulls files dropped in the watched folder into the site's
// inbox (same storage + table the manual "Add to inbox" uses), then runs the
// existing auto-sort so they file themselves immediately. One-way, additive,
// read-only on the Dropbox side. Best-effort + capped per run for Vercel limits.

import { sb } from "@/db/supabase";
import { DOCUMENTS_BUCKET } from "@/lib/documents";
import { deltaFiles, downloadFile } from "@/lib/dropbox";
import { recordEvent } from "@/lib/system-events";

const MAX_PER_RUN = 25; // keep within function time/memory limits; the rest pull next ping

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/_+/g, "_").slice(0, 100) || "file";
}

// A clean content-type from the file extension. Crucially avoids the
// "text/plain;charset=UTF-8" default that the storage bucket rejects; anything
// unknown falls back to application/octet-stream (which the bucket accepts).
const MIME: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  webp: "image/webp", heic: "image/heic", heif: "image/heif", tif: "image/tiff", tiff: "image/tiff", bmp: "image/bmp",
  doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv", zip: "application/zip",
};
function guessMime(name: string): string {
  const ext = (name.split(".").pop() || "").toLowerCase();
  return MIME[ext] ?? "application/octet-stream";
}

/** Pull new files from the watched Dropbox folder into the inbox and auto-sort. */
export async function syncDropbox(opts: { pullExisting?: boolean } = {}): Promise<{ ok: boolean; pulled: number; error?: string }> {
  try {
    const { files, ok } = await deltaFiles({ pullExisting: opts.pullExisting });
    if (!ok) return { ok: false, pulled: 0, error: "Could not read the Dropbox folder." };
    if (files.length === 0) return { ok: true, pulled: 0 };

    let pulled = 0;
    let firstError: string | undefined;
    for (const f of files.slice(0, MAX_PER_RUN)) {
      try {
        const dl = await downloadFile(f.path);
        if (!dl.bytes) { firstError ??= `download: ${dl.error ?? "unknown"}`; continue; }
        const storagePath = `inbox/${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${safeName(f.name)}`;
        const { error: upErr } = await sb.storage.from(DOCUMENTS_BUCKET).upload(storagePath, dl.bytes, { upsert: true, contentType: guessMime(f.name) });
        if (upErr) { firstError ??= `upload: ${upErr.message}`; continue; }
        await sb.from("inbox").insert({
          source: "dropbox",
          status: "pending",
          sender: "Dropbox",
          subject: f.name,
          body: `From Dropbox: ${f.path}`,
          attachments: JSON.stringify([{ name: f.name, storagePath, type: "", size: f.size }]),
          created_at: new Date().toISOString(),
        });
        pulled++;
      } catch { /* skip this file, keep going */ }
    }

    // Sort everything just pulled with the existing brain (instant, no waiting for
    // the cron). Dynamic import keeps the heavy document graph out of this module.
    if (pulled > 0) {
      try {
        const m = await import("@/app/inbox/actions");
        await m.autoSortInboxAction();
      } catch { /* auto-sort is best-effort; items remain pending in the inbox */ }
    }

    await recordEvent("dropbox.sync", "ok", { pulled, seen: files.length, ...(firstError ? { firstError } : {}) });
    return { ok: true, pulled };
  } catch (e) {
    await recordEvent("dropbox.sync", "error", { message: e instanceof Error ? e.message : String(e) });
    return { ok: false, pulled: 0, error: e instanceof Error ? e.message : "Sync failed." };
  }
}

"use server";

// The one door from the browser to the document reader.
//
// It reads and returns. It writes nothing — the fields come back to the form and
// the owner presses save. See src/lib/doc-read.ts for why that separation matters.

import { readDocumentFile } from "@/lib/doc-read";
import { recordEvent } from "@/lib/system-events";
import type { ReadResult } from "@/lib/doc-read";

export async function readDocumentFileAction(fd: FormData): Promise<ReadResult> {
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, fields: {}, source: "none", confidence: null, note: "No file provided." };
  }

  const result = await readDocumentFile(file);

  // One line per read, so "why did this come back blank" is answerable later.
  // Telemetry never blocks the read.
  try {
    await recordEvent("doc-read", result.ok ? "ok" : "error", {
      file: file.name,
      source: result.source,
      confidence: result.confidence,
      note: result.note ?? null,
    });
  } catch { /* never blocks */ }

  return result;
}

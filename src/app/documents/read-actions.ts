"use server";

// The one door from the browser to the document reader.
//
// It takes a STORAGE PATH, not the file's bytes. The browser has already put the
// file in the bucket (upload-actions.ts), so a 30 MB scan reads fine — nothing
// large travels through a serverless request body. It reads and returns; it
// writes nothing. See src/lib/doc-read.ts for why that separation matters.

import { readDocumentFile } from "@/lib/doc-read";
import { downloadStoredFile } from "@/lib/documents";
import { recordEvent } from "@/lib/system-events";
import type { ReadResult } from "@/lib/doc-read";

export async function readDocumentFileAction(input: {
  path: string;
  fileName: string;
  mimeType?: string;
}): Promise<ReadResult> {
  const { path, fileName, mimeType } = input;
  if (!path) {
    return { ok: false, fields: {}, source: "none", confidence: null, note: "No file provided." };
  }

  let result: ReadResult;
  const file = await downloadStoredFile(path, fileName, mimeType);
  if (!file) {
    result = {
      ok: false, fields: {}, source: "none", confidence: null,
      note: "Couldn't fetch the uploaded file to read it. It's still saved — fill the details in yourself.",
    };
  } else {
    result = await readDocumentFile(file);
  }

  // One line per read, so "why did this come back blank" is answerable later.
  try {
    await recordEvent("doc-read", result.ok ? "ok" : "error", {
      file: fileName,
      source: result.source,
      confidence: result.confidence,
      note: result.note ?? null,
    });
  } catch { /* never blocks */ }

  return result;
}

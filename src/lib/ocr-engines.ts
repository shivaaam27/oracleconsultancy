/**
 * ocr-engines.ts — Groq-free OCR engines for reading scanned documents, so the
 * document intelligence keeps working when Groq vision is off/retired (shutdown
 * 17 Jul 2026). Two engines, both taking one page image (a data URL or Buffer)
 * and returning plain text (null if unreadable / not configured):
 *
 *   • cloudOcrTranscribe — OCR.space cloud OCR (always-on, no host). Inert unless
 *     an OCR.space key is set (settings `ocrSpaceApiKey` or env OCRSPACE_API_KEY).
 *     Better than Tesseract on many real scans; free tier ~25k pages/month.
 *   • tesseractTranscribe — Tesseract.js, runs INSIDE the site, no key, no bill,
 *     always available. The offline floor. English + Swahili (Tanzania docs).
 *
 * These are the lower layers of the layered reader in documents/actions.ts:
 *   ORI worker (Claude, PC-on) → Groq vision (while alive) → cloud OCR → Tesseract.
 * Everything is server-only and lazy-imported so the heavy deps never reach the
 * client bundle.
 */
/** Normalise a data-URL / Buffer into what each engine wants. */
function toBuffer(image: string | Buffer): Buffer {
  if (Buffer.isBuffer(image)) return image;
  const m = /^data:[^;]+;base64,([\s\S]*)$/.exec(image);
  return Buffer.from(m ? m[1] : image, "base64");
}

/** OCR.space — always-on cloud OCR. Returns null when no key is configured or the
 *  call fails, so the caller falls through to Tesseract. */
export async function cloudOcrTranscribe(image: string | Buffer): Promise<string | null> {
  const key = process.env.OCRSPACE_API_KEY || "";
  if (!key) return null;
  try {
    const buf = toBuffer(image);
    // OCR.space wants a base64 data URL (assume JPEG/PNG; it sniffs the header).
    const dataUrl = typeof image === "string" && image.startsWith("data:")
      ? image
      : `data:image/jpeg;base64,${buf.toString("base64")}`;
    const body = new URLSearchParams({
      base64Image: dataUrl,
      language: "eng",           // OCR.space handles Latin-script Swahili under eng
      isOverlayRequired: "false",
      OCREngine: "2",            // engine 2 = better accuracy on documents
      scale: "true",
    });
    const res = await fetch("https://api.ocr.space/parse/image", {
      method: "POST",
      headers: { apikey: key, "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      IsErroredOnProcessing?: boolean;
      ParsedResults?: { ParsedText?: string }[];
    };
    if (json.IsErroredOnProcessing) return null;
    const text = (json.ParsedResults ?? []).map((r) => r.ParsedText ?? "").join("\n").trim();
    return text || null;
  } catch {
    return null;
  }
}

// One reusable Tesseract worker per process (loading the eng+swa models is the
// slow part; reuse keeps multi-page OCR reasonable). Lazily created.
let workerPromise: Promise<import("tesseract.js").Worker> | null = null;
async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import("tesseract.js");
      const os = await import("os");
      // Cache the language models in a writable temp dir — the repo root is wrong
      // (litters git) and Vercel's function filesystem is read-only except /tmp.
      const cachePath = process.env.TESSERACT_CACHE_PATH || os.tmpdir();
      return createWorker(["eng", "swa"], undefined, { cachePath });
    })();
  }
  return workerPromise;
}

/** Tesseract.js — offline, in-site OCR (no key, no bill). English + Swahili.
 *  The last-resort layer that guarantees reading never fully breaks. */
export async function tesseractTranscribe(image: string | Buffer): Promise<string | null> {
  try {
    const worker = await getWorker();
    // recognize() accepts a Buffer or a data URL directly.
    const { data } = await worker.recognize(Buffer.isBuffer(image) ? image : toBuffer(image));
    const text = (data.text ?? "").trim();
    // Very low confidence usually means a blank/garbage scan — treat as unreadable.
    if (!text || (typeof data.confidence === "number" && data.confidence < 30)) return null;
    return text;
  } catch {
    return null;
  }
}

/** Free the shared Tesseract worker (e.g. after a batch) to release memory. */
export async function disposeOcr(): Promise<void> {
  if (workerPromise) {
    try { (await workerPromise).terminate(); } catch { /* ignore */ }
    workerPromise = null;
  }
}

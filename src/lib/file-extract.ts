import "server-only";

// file-extract.ts — turn ANY uploaded file into something a model can read.
//
// This is the mechanical half that used to live inside doc-read.ts. It was
// pulled out when a SECOND reader appeared (event-read.ts, which reads a ticket
// to fill in a diary entry): both need identical handling of PDFs, scans, iPhone
// photos and Office files, and two copies would have drifted the first time one
// of them learned a new format.
//
// It knows nothing about documents, events, or what the answer is for. It
// answers one question: "what does this file contain — text, or pages of
// pictures?" Nothing here writes to the database or calls a model.

export type Extracted =
  /** Real, readable text (a Word file, a spreadsheet, a typed PDF's text layer). */
  | { kind: "text"; text: string }
  /** Page/photo images as data-URLs, for a vision model to read. */
  | { kind: "images"; images: string[] }
  /** Nothing usable came out — `note` says why, in plain English. */
  | { kind: "none"; note: string };

/* ------------------------------------------------------------------ */
/* Limits                                                              */
/* ------------------------------------------------------------------ */

const MAX_OCR_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_IMAGE_DATAURL = 5_400_000;

/** Positive integer page-cap from the environment, clamped so a typo can't send
 *  thousands of pages at the vision model. */
function envPageCap(envKey: string, fallback: number): number {
  const raw = process.env[envKey];
  const n = raw ? parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, 200);
}

// Pages of a scanned PDF rasterised and sent to the vision model. Every page is
// another image in one call, so this is a deliberate ceiling, not unbounded.
const MAX_VISION_PAGES = envPageCap("DOC_MAX_VISION_PAGES", 12);

/* ------------------------------------------------------------------ */
/* Format sniffing                                                     */
/* ------------------------------------------------------------------ */

export function isHeicFile(file: File): boolean {
  const n = file.name.toLowerCase();
  return n.endsWith(".heic") || n.endsWith(".heif") || file.type === "image/heic" || file.type === "image/heif";
}

export function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export function isOfficeFile(file: File): boolean {
  const lower = file.name.toLowerCase();
  return (
    /\.(docx?|xlsx?|csv|pptx|txt|md|rtf|log|json|eml|html?)$/.test(lower) ||
    file.type.includes("spreadsheet") ||
    file.type.includes("presentation") ||
    file.type.startsWith("text/") ||
    file.type === "message/rfc822" ||
    file.type === "application/json" ||
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );
}

/* ------------------------------------------------------------------ */
/* Images                                                              */
/* ------------------------------------------------------------------ */

/** Decode HEIC/HEIF to JPEG so an iPhone photo can be read. Null if unavailable. */
async function heicToJpeg(buf: Buffer): Promise<Buffer | null> {
  try {
    const mod = "heic-convert";
    const heicConvert = (await import(mod)).default as (o: { buffer: Buffer; format: "JPEG" | "PNG"; quality: number }) => Promise<ArrayBuffer>;
    return Buffer.from(await heicConvert({ buffer: buf, format: "JPEG", quality: 0.85 }));
  } catch {
    return null;
  }
}

/** Shrink an over-size image so the model accepts it, rather than rejecting big
 *  phone photos. Returns the original if the encoder isn't available. */
async function downscaleToLimit(buf: Buffer, maxBytes = MAX_OCR_IMAGE_BYTES): Promise<Buffer> {
  if (buf.length <= maxBytes) return buf;
  try {
    const { createCanvas, Image } = await import("@napi-rs/canvas");
    const img = new Image();
    img.src = buf;
    let w = img.width, h = img.height;
    if (!w || !h) return buf;
    const maxDim = 2200;
    if (Math.max(w, h) > maxDim) { const s = maxDim / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); }
    let q = 0.82;
    for (let i = 0; i < 6; i++) {
      const canvas = createCanvas(w, h);
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      const out = canvas.toBuffer("image/jpeg", q);
      if (out.length <= maxBytes || w < 700) return out;
      w = Math.round(w * 0.8); h = Math.round(h * 0.8); q = Math.max(0.6, q - 0.06);
    }
    return buf;
  } catch {
    return buf;
  }
}

/* ------------------------------------------------------------------ */
/* Text                                                                */
/* ------------------------------------------------------------------ */

/** A PDF's embedded text is only USABLE if it's the real document, not a scanner
 *  app's watermark ("CamScanner CamScanner…"). Trusting that would skip OCR and
 *  lose the document. Returns the text if genuine, else null → read it as a scan. */
export function usableTextLayer(raw: string | null | undefined): string | null {
  const t = (raw ?? "").trim();
  if (t.length < 40) return null;
  const cleaned = t.replace(/cam\s?scanner|scanned with[a-z .]*|adobe scan|genius scan|tap\s?scanner|microsoft lens/gi, " ").trim();
  const unique = new Set(cleaned.toLowerCase().match(/[a-z]{3,}/g) ?? []);
  if (cleaned.length < 40 || unique.size < 6) return null;
  return t;
}

function decodeXmlEntities(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

/** Embedded text from a Word / Excel / PowerPoint / plain-text file. */
export async function extractOfficeText(file: File): Promise<string> {
  const lower = file.name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  if (lower.endsWith(".docx") || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const mammoth = await import("mammoth");
    return (await mammoth.extractRawText({ buffer })).value ?? "";
  }

  if (lower.endsWith(".xlsx") || lower.endsWith(".xls") || lower.endsWith(".csv") ||
      file.type.includes("spreadsheet") || file.type === "text/csv") {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    return workbook.SheetNames.slice(0, 6)
      .map((name) => [`Sheet: ${name}`, XLSX.utils.sheet_to_csv(workbook.Sheets[name], { blankrows: false })].join("\n"))
      .join("\n\n")
      .slice(0, 12000);
  }

  if (lower.endsWith(".pptx") || file.type.includes("presentation")) {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(buffer);
    const slideNames = Object.keys(zip.files)
      .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
      .sort((a, b) => Number(a.match(/slide(\d+)/)![1]) - Number(b.match(/slide(\d+)/)![1]));
    const slides: string[] = [];
    for (const name of slideNames.slice(0, 80)) {
      const xml = await zip.files[name].async("string");
      const runs = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => decodeXmlEntities(m[1]));
      const text = runs.join(" ").replace(/\s+/g, " ").trim();
      if (text) slides.push(`Slide ${slides.length + 1}\n${text}`);
    }
    return slides.join("\n\n").slice(0, 14000);
  }

  try {
    return new TextDecoder("utf-8").decode(buffer);
  } catch {
    return "";
  }
}

/** Rasterise the first N pages of a scanned PDF to data-URLs for the vision model. */
async function renderPdfPages(base: Buffer, maxPages = MAX_VISION_PAGES): Promise<string[]> {
  try {
    const { renderPageAsImage } = await import("unpdf");
    const urls: string[] = [];
    for (let i = 1; i <= maxPages; i++) {
      try {
        const url = await renderPageAsImage(Uint8Array.from(base), i, {
          canvasImport: () => import("@napi-rs/canvas"),
          width: 1400,
          toDataURL: true,
        });
        if (typeof url === "string" && url.length <= MAX_IMAGE_DATAURL) urls.push(url);
      } catch {
        break; // no further pages, or the render failed
      }
    }
    return urls;
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* The one entry point                                                 */
/* ------------------------------------------------------------------ */

/**
 * Read a file down to text or page images. Never throws — an unreadable file
 * comes back as `{ kind: "none", note }` so the caller can tell the owner why
 * in plain English rather than showing a stack trace.
 */
export async function extractFile(file: File): Promise<Extracted> {
  if (!(file instanceof File) || file.size === 0) return { kind: "none", note: "No file provided." };

  try {
    // ── Word / Excel / PowerPoint / plain text ──
    if (isOfficeFile(file)) {
      const text = await extractOfficeText(file);
      if (text.trim().length < 20) return { kind: "none", note: "Couldn't read useful text from that file." };
      return { kind: "text", text };
    }

    // ── PDF: real text layer if it has one, else read the pages as a scan ──
    if (isPdfFile(file)) {
      const base = Buffer.from(await file.arrayBuffer());
      let text = "";
      try {
        const { extractText, getDocumentProxy } = await import("unpdf");
        const pdf = await getDocumentProxy(Uint8Array.from(base));
        const r = await extractText(pdf, { mergePages: false });
        text = Array.isArray(r.text) ? r.text.map((p) => p.trim()).filter(Boolean).join("\n\n") : r.text;
      } catch {
        text = "";
      }
      const usable = usableTextLayer(text);
      if (usable) return { kind: "text", text: usable };

      const images = await renderPdfPages(base);
      if (!images.length) {
        return { kind: "none", note: "Couldn't open this PDF to read it. Try a clear photo of the document instead." };
      }
      return { kind: "images", images };
    }

    // ── Photos and scans (including iPhone HEIC) ──
    if (file.type.startsWith("image/") || isHeicFile(file)) {
      let buf: Buffer = Buffer.from(await file.arrayBuffer());
      let mime = file.type.startsWith("image/") ? file.type : "image/jpeg";
      if (isHeicFile(file)) {
        const jpeg = await heicToJpeg(buf);
        if (!jpeg) return { kind: "none", note: "Couldn't convert this iPhone photo. Try sharing it as a JPEG." };
        buf = jpeg; mime = "image/jpeg";
      }
      if (buf.length > MAX_OCR_IMAGE_BYTES) {
        const smaller = await downscaleToLimit(buf);
        if (smaller !== buf) { buf = smaller; mime = "image/jpeg"; }
      }
      if (buf.length > MAX_OCR_IMAGE_BYTES) {
        return { kind: "none", note: "That image is too large even after shrinking — try a smaller photo." };
      }
      return { kind: "images", images: [`data:${mime};base64,${buf.toString("base64")}`] };
    }

    // Anything else — a .zip, a .dwg, a video — can still be ATTACHED to an
    // event or filed; it simply can't be read, and the caller says so.
    return { kind: "none", note: "This file type can't be read automatically — fill the details in yourself." };
  } catch (e) {
    return { kind: "none", note: e instanceof Error ? `Couldn't read this file (${e.message}).` : "Couldn't read this file." };
  }
}

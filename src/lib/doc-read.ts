import "server-only";

// doc-read.ts — read ONE uploaded file and report what it says.
//
// This is the assistive half of the old document intelligence, rebuilt after the
// Aug 2026 strip-out. The difference matters:
//
//   • It ONLY reads. It does not decide who a document belongs to, rename it,
//     file it, de-duplicate it, archive anything it supersedes, or learn from
//     your corrections. Those were the parts that moved things behind your back.
//   • It never writes to the database. It hands fields back to the form, and
//     nothing is saved until you press save.
//
// The owner picks the company/person and category for the batch before any file
// is read, so the model is never asked to guess an owner.

import { callAIJson, LOW_CONFIDENCE } from "@/lib/ai-json";
import { AI_SMART, providerVisionModels } from "@/lib/ai-models";
import { getAiKey, getActiveProvider } from "@/lib/settings";

export type ReadFields = {
  title?: string | null;
  docType?: string | null;
  issuer?: string | null;
  referenceNo?: string | null;
  /** ISO "YYYY-MM-DD". */
  issueDate?: string | null;
  expiryDate?: string | null;
  notes?: string | null;
};

export type ReadResult = {
  ok: boolean;
  fields: ReadFields;
  /** How it was read — shown to the owner so a guess never looks like a fact. */
  source: "typed" | "scan" | "none";
  /** 0–1 self-reported confidence, or null. Below LOW_CONFIDENCE we say so. */
  confidence: number | null;
  /** Plain-English explanation when something couldn't be read. */
  note?: string;
};

const fail = (note: string): ReadResult => ({ ok: false, fields: {}, source: "none", confidence: null, note });

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
/* File → text or images                                               */
/* ------------------------------------------------------------------ */

function isHeicFile(file: File): boolean {
  const n = file.name.toLowerCase();
  return n.endsWith(".heic") || n.endsWith(".heif") || file.type === "image/heic" || file.type === "image/heif";
}

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

/** A PDF's embedded text is only USABLE if it's the real document, not a scanner
 *  app's watermark ("CamScanner CamScanner…"). Trusting that would skip OCR and
 *  lose the document. Returns the text if genuine, else null → read it as a scan. */
function usableTextLayer(raw: string | null | undefined): string | null {
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
async function extractOfficeText(file: File): Promise<string> {
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
/* The prompt                                                          */
/* ------------------------------------------------------------------ */

// Deliberately narrow. It is NOT asked who owns the document — the owner already
// chose that for the batch — so it cannot misfile anything.
const PROMPT = [
  "You are reading ONE business document to fill in a filing form. British English.",
  "",
  "Return ONLY this JSON object, no prose:",
  "{",
  '  "title": "a short, human name for this document, e.g. \\"Business Licence 2026\\"",',
  '  "docType": "the kind of document, e.g. \\"Trade Licence\\", \\"Work Permit\\", \\"TIN Certificate\\"",',
  '  "issuer": "the authority or organisation that issued it, e.g. \\"BRELA\\", \\"TRA\\"",',
  '  "referenceNo": "the licence/certificate/permit/registration number printed on it",',
  '  "issueDate": "YYYY-MM-DD or null",',
  '  "expiryDate": "YYYY-MM-DD or null",',
  '  "notes": "2-3 plain sentences saying what this document is and anything worth knowing (amounts, conditions, who it names)",',
  '  "confidence": 0.0',
  "}",
  "",
  "Rules:",
  "- Use null for anything not clearly printed on the document. NEVER invent a value.",
  "- Dates must be real dates read off the document. A payment/due date is NOT an expiry date.",
  "- If the document plainly does not expire (a receipt, an invoice, a letter, a CV,",
  "  a certificate of incorporation), set expiryDate to null.",
  "- referenceNo is the document's own number, not a phone number, TIN of the reader, or an amount.",
  "- confidence is YOUR honest 0-1 score for how well you could read this.",
].join("\n");

// No ShapeSpec on purpose. Every field here is optional and the model returns
// `null` for anything it can't read — which validateShape counts as a wrongly
// typed field and would fail the whole read. `toFields` below does the checking
// instead: it accepts only real strings and real ISO dates, and drops the rest.

/* ------------------------------------------------------------------ */
/* Normalising the model's answer                                      */
/* ------------------------------------------------------------------ */

const str = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s || /^(null|n\/a|none|unknown|not stated|not specified)$/i.test(s)) return null;
  return s;
};

/** Accept only a real ISO date the model actually read; drop anything else. */
const isoDate = (v: unknown): string | null => {
  const s = str(v);
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(`${m[0]}T00:00:00Z`);
  if (isNaN(d.getTime())) return null;
  const year = Number(m[1]);
  // A read that lands centuries away is a misread, not a date.
  if (year < 1900 || year > 2200) return null;
  return m[0];
};

function toFields(data: Record<string, unknown> | null): ReadFields {
  if (!data) return {};
  return {
    title: str(data.title),
    docType: str(data.docType),
    issuer: str(data.issuer),
    referenceNo: str(data.referenceNo),
    issueDate: isoDate(data.issueDate),
    expiryDate: isoDate(data.expiryDate),
    notes: str(data.notes),
  };
}

/* ------------------------------------------------------------------ */
/* The reader                                                          */
/* ------------------------------------------------------------------ */

async function readText(text: string, apiKey: string): Promise<ReadResult> {
  const res = await callAIJson({
    messages: [{ role: "user", content: `${PROMPT}\n\nDOCUMENT TEXT:\n"""\n${text.slice(0, 14000)}\n"""` }],
    apiKey,
    model: AI_SMART,
    maxTokens: 700,
    source: "doc-read",
  });
  if (!res.ok) return { ...fail(explain(res.error)), source: "typed" };
  return { ok: true, fields: toFields(res.data), source: "typed", confidence: res.confidence };
}

async function readImages(imageUrls: string[], apiKey: string): Promise<ReadResult> {
  const content = [
    { type: "text", text: PROMPT },
    ...imageUrls.map((url) => ({ type: "image_url", image_url: { url } })),
  ];
  const maxTokens = imageUrls.length <= 1 ? 700 : Math.min(700 + imageUrls.length * 120, 2400);
  // Walk the active provider's vision ladder — an http error (e.g. a
  // decommissioned model) falls through to the next; other errors would recur.
  const models = providerVisionModels(await getActiveProvider());
  let last = await callAIJson({ messages: [{ role: "user", content }], apiKey, model: models[0], maxTokens, source: "doc-read" });
  for (const model of models.slice(1)) {
    if (last.ok || last.error !== "http-error") break;
    last = await callAIJson({ messages: [{ role: "user", content }], apiKey, model, maxTokens, source: "doc-read" });
  }
  if (!last.ok) return { ...fail(explain(last.error)), source: "scan" };
  return { ok: true, fields: toFields(last.data), source: "scan", confidence: last.confidence };
}

function explain(error: string | undefined): string {
  switch (error) {
    case "no-key": return "No AI key is set — add one in Settings, or fill the form in yourself.";
    case "spend-cap": return "The monthly AI spend cap has been reached. Fill this one in yourself, or raise the cap in Settings.";
    case "rate-limited": return "The AI is busy right now. Try again in a moment, or fill it in yourself.";
    case "bad-json":
    case "schema": return "Couldn't make sense of what came back. Fill this one in yourself.";
    default: return "Couldn't read this file. Fill it in yourself, or try a clearer scan.";
  }
}

/**
 * Read a file and report what it says. Never throws — a failure comes back as
 * `ok: false` with a plain-English note, and the form stays blank for you.
 */
export async function readDocumentFile(input: File): Promise<ReadResult> {
  let file = input;
  if (!(file instanceof File) || file.size === 0) return fail("No file provided.");

  const apiKey = await getAiKey();
  if (!apiKey) return fail("No AI key is set — add one in Settings, or fill the form in yourself.");

  const lower = file.name.toLowerCase();
  const isPdf = file.type === "application/pdf" || lower.endsWith(".pdf");
  const isOffice =
    /\.(docx?|xlsx?|csv|pptx|txt|md|rtf|log|json)$/.test(lower) ||
    file.type.includes("spreadsheet") || file.type.includes("presentation") ||
    file.type.startsWith("text/") || file.type === "application/json" ||
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  try {
    // ── Word / Excel / PowerPoint / plain text ──
    if (isOffice) {
      const text = await extractOfficeText(file);
      if (text.trim().length < 20) return fail("Couldn't read useful text from that file.");
      return await readText(text, apiKey);
    }

    // ── PDF: real text layer if it has one, else read the pages as a scan ──
    if (isPdf) {
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
      if (usable) return await readText(usable, apiKey);

      const images = await renderPdfPages(base);
      if (!images.length) return fail("Couldn't open this PDF to read it. Try a clear photo of the document instead.");
      return await readImages(images, apiKey);
    }

    // ── Photos and scans (including iPhone HEIC) ──
    if (file.type.startsWith("image/") || isHeicFile(file)) {
      let buf: Buffer = Buffer.from(await file.arrayBuffer());
      let mime = file.type.startsWith("image/") ? file.type : "image/jpeg";
      if (isHeicFile(file)) {
        const jpeg = await heicToJpeg(buf);
        if (!jpeg) return fail("Couldn't convert this iPhone photo. Try sharing it as a JPEG.");
        buf = jpeg; mime = "image/jpeg";
      }
      if (buf.length > MAX_OCR_IMAGE_BYTES) {
        const smaller = await downscaleToLimit(buf);
        if (smaller !== buf) { buf = smaller; mime = "image/jpeg"; }
      }
      if (buf.length > MAX_OCR_IMAGE_BYTES) return fail("That image is too large even after shrinking — try a smaller photo.");
      return await readImages([`data:${mime};base64,${buf.toString("base64")}`], apiKey);
    }

    return fail("Unsupported file type. Upload a PDF, Word, Excel/CSV or an image.");
  } catch (e) {
    return fail(e instanceof Error ? `Couldn't read this file (${e.message}).` : "Couldn't read this file.");
  }
}

/** True when the read was weak enough that the owner should look twice. */
export function isUnsureRead(r: ReadResult): boolean {
  return r.ok && r.confidence != null && r.confidence < LOW_CONFIDENCE;
}

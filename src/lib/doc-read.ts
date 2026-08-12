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
import { extractFile } from "@/lib/file-extract";

export type ReadFields = {
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
/* The prompt                                                          */
/* ------------------------------------------------------------------ */

// Deliberately narrow. It is NOT asked who owns the document — the owner already
// chose that for the batch — so it cannot misfile anything.
const PROMPT = [
  "You are reading ONE business document to fill in a filing form. British English.",
  "",
  "Do NOT name the document — the owner keeps their own file name. Read what is",
  "printed on it, nothing more.",
  "",
  "Return ONLY this JSON object, no prose:",
  "{",
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
  if (!(input instanceof File) || input.size === 0) return fail("No file provided.");

  const apiKey = await getAiKey();
  if (!apiKey) return fail("No AI key is set — add one in Settings, or fill the form in yourself.");

  // Every format quirk — PDF text layers vs scans, HEIC, Office files, over-size
  // phone photos — is handled once in file-extract.ts and shared with the event
  // reader, so the two can't drift apart.
  const extracted = await extractFile(input);
  if (extracted.kind === "none") return fail(extracted.note);
  return extracted.kind === "text"
    ? await readText(extracted.text, apiKey)
    : await readImages(extracted.images, apiKey);
}

/** True when the read was weak enough that the owner should look twice. */
export function isUnsureRead(r: ReadResult): boolean {
  return r.ok && r.confidence != null && r.confidence < LOW_CONFIDENCE;
}

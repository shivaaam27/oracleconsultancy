"use server";

// Auto-crop for the in-site scanner (scan-capture.tsx, Phase 1 of the
// "detect the page + straighten it" feature — see
// memory/documents_redesign_plan_jul2026.md for the phased plan). Option A
// chosen over a real CV library (OpenCV.js): one Gemini vision call per page
// asking for the document's 4 corners, then a client-side perspective warp
// (src/lib/perspective-warp.ts) straightens it. Deliberately conservative:
// this action ONLY returns coordinates + a confidence score — it never
// touches pixels itself, so a bad/low-confidence read can never corrupt a
// page, only skip the crop (the caller falls back to the original photo).
import { callGroqJson } from "@/lib/ai-json";
import { GROQ_VISION_MODELS } from "@/lib/ai-models";
import { getGroqKey } from "@/lib/settings";

export type Corner = { x: number; y: number }; // fractions of image width/height, 0..1
export type CornerResult =
  | { ok: true; corners: [Corner, Corner, Corner, Corner]; confidence: number }
  | { ok: false };

const CORNER_PROMPT =
  "This photo shows a single paper document (or nothing document-like). Find the " +
  "document's 4 corners in the image. Reply with STRICT JSON only, no markdown:\n" +
  '{"corners": [[x,y],[x,y],[x,y],[x,y]], "confidence": 0.0}\n' +
  "Each corner is [x,y] as a FRACTION of image width/height (0 to 1, top-left origin), " +
  "ordered clockwise starting from the document's top-left corner. " +
  "confidence is 0-1: how sure you are the 4 points trace the actual document edges " +
  "(not the desk/background). If there's no clear document in frame, set confidence to 0 " +
  "and still return your best-guess corners.";

function asCorner(v: unknown): Corner | null {
  if (!Array.isArray(v) || v.length !== 2) return null;
  const [x, y] = v;
  if (typeof x !== "number" || typeof y !== "number") return null;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
}

/** Ask the active provider's vision model for the 4 corners of the document in
 *  frame, as fractions of the image's own width/height. Never throws; returns
 *  {ok:false} on any failure (no key, rate-limited, bad JSON, wrong shape) so
 *  callers can fall back to the uncropped photo without special-casing errors.
 *
 *  IMPORTANT: `model` below must be a GROQ_VISION_MODELS entry (a recognized
 *  tier head), NOT a raw Gemini model id — `callGroqJson`'s internal ladder
 *  fallback only expands a model into the active provider's FULL ladder when
 *  `tierOf()` recognizes it as a known tier (see ai-models.ts). Passing a
 *  specific Gemini id directly (the bug this comment replaces) silently
 *  disabled all fallback: a single rate-limited model made corner detection
 *  fail outright instead of trying the other ~9 vision models. */
export async function detectDocumentCornersAction(imageDataUrl: string): Promise<CornerResult> {
  const apiKey = await getGroqKey();
  if (!apiKey) return { ok: false };
  const res = await callGroqJson({
    apiKey,
    model: GROQ_VISION_MODELS[0],
    maxTokens: 200,
    temperature: 0,
    attempts: 1, // one try per ladder entry — disposable per-page helper, skip rather than backoff
    timeoutMs: 8000,
    source: "scan-crop",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: CORNER_PROMPT },
          { type: "image_url", image_url: { url: imageDataUrl } },
        ],
      },
    ],
  });
  if (!res.ok || !res.data) return { ok: false };
  const raw = res.data.corners;
  if (!Array.isArray(raw) || raw.length !== 4) return { ok: false };
  const corners = raw.map(asCorner);
  if (corners.some((c) => c === null)) return { ok: false };
  const confidence = res.confidence ?? 0;
  return { ok: true, corners: corners as [Corner, Corner, Corner, Corner], confidence };
}

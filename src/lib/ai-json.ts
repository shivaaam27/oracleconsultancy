// ai-json.ts — the Groq "safety harness".
//
// One job: make every Groq call that is supposed to return JSON reliable, by
// wrapping it in the five guards from the integration spec (transfer-pack/07):
//
//   1. Schema-first prompting        — the caller's job (describe the JSON shape).
//   2. Strip-and-parse, never raw    — extractJsonBlock() pulls the first {...}
//                                       out of fenced/prose-wrapped replies.
//   3. Validate against a schema      — validateShape() checks required fields
//                                       and types; failure => no data, a reason.
//   4. Retry on transient errors      — callGroqJson() retries 429 / 5xx / network
//                                       blips with exponential backoff.
//   5. Confidence gate + queue        — the caller reads `confidence`/`ok` and,
//                                       when low or failed, routes to human review
//                                       instead of trusting a guess.
//
// Nothing here is AI-specific cleverness; it is the deterministic plumbing that
// keeps a flaky free-tier model from silently corrupting data. Kept dependency
// free (no Zod) to match the codebase's existing hand-rolled validators.

import { GROQ_FAST } from "./ai-models";

/**
 * Pull the first complete JSON object out of a model reply. Handles:
 *  - ```json … ``` / ``` … ``` markdown fences
 *  - leading/trailing prose ("Here is the JSON: { … } hope this helps")
 *  - a balanced-brace scan so a stray `}` inside a string does not truncate.
 * Returns the JSON substring, or null if no object is present.
 */
export function extractJsonBlock(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // Scan from the first "{" directly — the balanced-brace scan below skips braces
  // (and backticks) inside strings, so it ignores any leading ```json fence and
  // trailing ``` without a global strip that could delete backticks from INSIDE a
  // legitimate JSON string value (e.g. a drafted message body containing a fence).
  const text = raw;
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null; // unbalanced — treat as unparseable
}

/**
 * Strip-and-parse: extract the JSON block, then JSON.parse it. Never throws —
 * returns the object on success, or null on any failure (so callers can route
 * to a rules fallback or a human-review queue instead of crashing).
 */
export function parseJsonObject(raw: string | null | undefined): Record<string, unknown> | null {
  const block = extractJsonBlock(raw);
  if (!block) return null;
  try {
    const v = JSON.parse(block);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// --- Guard 3: a tiny schema validator (no Zod dependency) -----------------

type FieldType = "string" | "number" | "boolean" | "date" | "object" | "array";
export interface ShapeSpec {
  /** Fields that MUST be present and of the right type for the object to pass. */
  required?: Record<string, FieldType>;
  /** Fields checked for type only IF present. */
  optional?: Record<string, FieldType>;
}

function typeOk(v: unknown, t: FieldType): boolean {
  switch (t) {
    case "string": return typeof v === "string";
    case "number": return typeof v === "number" && Number.isFinite(v);
    case "boolean": return typeof v === "boolean";
    // Round-trip so impossible calendar days (e.g. 2027-02-30, which Date.parse
    // rolls over to 2 Mar) are rejected, not silently accepted.
    case "date": return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(v + "T00:00:00Z").toISOString().slice(0, 10) === v;
    case "object": return !!v && typeof v === "object" && !Array.isArray(v);
    case "array": return Array.isArray(v);
  }
}

/**
 * Validate a parsed object against a shape. Returns the list of problems
 * (empty = valid). A present-but-wrong-typed optional field is a problem too,
 * so the caller can decide to reject rather than silently store rubbish.
 */
export function validateShape(obj: Record<string, unknown> | null, shape: ShapeSpec): string[] {
  const problems: string[] = [];
  if (!obj) return ["not an object"];
  for (const [k, t] of Object.entries(shape.required ?? {})) {
    if (!(k in obj) || obj[k] == null) problems.push(`missing ${k}`);
    else if (!typeOk(obj[k], t)) problems.push(`${k} not ${t}`);
  }
  for (const [k, t] of Object.entries(shape.optional ?? {})) {
    if (k in obj && obj[k] != null && !typeOk(obj[k], t)) problems.push(`${k} not ${t}`);
  }
  return problems;
}

// --- Guard 4: the retrying call --------------------------------------------

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

export type GroqJsonError =
  | "no-key"
  | "rate-limited" // 429 after all retries
  | "http-error" // non-OK, non-429
  | "network" // fetch threw after all retries
  | "empty" // model returned nothing
  | "bad-json" // could not strip-and-parse an object
  | "schema"; // parsed but failed validation

export interface GroqJsonResult {
  ok: boolean;
  /** Parsed + validated object (only when ok). */
  data: Record<string, unknown> | null;
  /** 0..1 — model's self-reported confidence if it returned one, else null. */
  confidence: number | null;
  error?: GroqJsonError;
  /** Validation problems when error === "schema", for logging. */
  problems?: string[];
  /** Raw model text, for debugging/queueing. */
  raw?: string | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface CallGroqJsonOpts {
  messages: unknown[];
  apiKey: string | null | undefined;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  /** Optional shape to validate the parsed object against (guard 3). */
  shape?: ShapeSpec;
  /** Total attempts including the first (default 3). */
  attempts?: number;
  /** Base backoff in ms (default 500 -> 500, 1000, 2000 …). */
  backoffMs?: number;
}

/**
 * Call Groq expecting a JSON object back, with all five guards applied.
 * Pure plumbing: holds no key (caller passes it), runs only server-side
 * (callers already gate on getGroqKey, which is server-only).
 */
export async function callGroqJson(opts: CallGroqJsonOpts): Promise<GroqJsonResult> {
  const {
    messages,
    apiKey,
    model = GROQ_FAST,
    maxTokens = 400,
    temperature = 0,
    shape,
    attempts = 3,
    backoffMs = 500,
  } = opts;

  if (!apiKey) return { ok: false, data: null, confidence: null, error: "no-key" };

  let lastError: GroqJsonError = "network";
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await sleep(backoffMs * 2 ** (attempt - 1));
    let res: Response;
    try {
      res = await fetch(GROQ_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
          response_format: { type: "json_object" },
        }),
      });
    } catch {
      lastError = "network"; // transient — retry
      continue;
    }
    // Retry the genuinely transient HTTP statuses; give up on the rest.
    if (res.status === 429) { lastError = "rate-limited"; continue; }
    if (res.status >= 500) { lastError = "http-error"; continue; }
    if (!res.ok) return { ok: false, data: null, confidence: null, error: "http-error" };

    let content: string | null = null;
    try {
      const body = await res.json();
      content = body?.choices?.[0]?.message?.content ?? null;
    } catch {
      lastError = "http-error"; continue;
    }
    if (!content) return { ok: false, data: null, confidence: null, error: "empty", raw: content };

    const parsed = parseJsonObject(content);
    if (!parsed) return { ok: false, data: null, confidence: null, error: "bad-json", raw: content };

    const confidence = readConfidence(parsed);
    if (shape) {
      const problems = validateShape(parsed, shape);
      if (problems.length) {
        return { ok: false, data: null, confidence, error: "schema", problems, raw: content };
      }
    }
    return { ok: true, data: parsed, confidence, raw: content };
  }
  // All attempts exhausted on a transient error.
  return { ok: false, data: null, confidence: null, error: lastError };
}

/** Read an optional `confidence` field (0..1, or 0..100) if the model returned one. */
function readConfidence(obj: Record<string, unknown>): number | null {
  const v = obj.confidence;
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const n = v > 1 ? v / 100 : v;
  return Math.max(0, Math.min(1, n));
}

/** Default gate: below this, treat an extraction as "needs human review".
 *  Set to 0.75 per the transfer-pack intake spec (08 §4) — only auto-fill a
 *  document when the model is genuinely confident; everything else waits for a
 *  one-tap human confirm. Reconfirming is cheap now (cache-backed). */
export const LOW_CONFIDENCE = 0.75;

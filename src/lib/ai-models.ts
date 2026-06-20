// One place for every Groq model name. Groq retires models with short notice —
// when that happens, change the name here and the whole app follows.
//
// EVERY workhorse model is now a FALLBACK LADDER, not a single hardcoded name:
// fast / smart / vision are each a comma-separated, env-overridable list (best
// first). The text + vision harness in ai-json.ts tries each entry in turn and
// falls through when one is decommissioned (a 4xx / model_not_found), so a
// retired Groq model SELF-HEALS via one Vercel env var — no source change or
// redeploy. The plain `GROQ_FAST` / `GROQ_SMART` / `GROQ_VISION` exports remain
// (= the FIRST ladder entry) so every existing import keeps working unchanged.

/** Parse a comma-separated env list ("a, b ,c" → ["a","b","c"]); [] if empty/unset. */
function envList(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Build a ladder from an env var, falling back to the built-in defaults. */
function ladder(envName: string, defaults: string[]): string[] {
  const fromEnv = envList(envName);
  return fromEnv.length ? fromEnv : defaults;
}

// Fast: default chat / extraction. Override with GROQ_FAST_MODELS (comma-sep).
export const GROQ_FAST_MODELS: string[] = ladder("GROQ_FAST_MODELS", [
  "llama-3.1-8b-instant",
  // Sensible same-tier stand-in if the instant model is retired. The 70B model
  // also answers the fast prompts (slower, pricier) — better than a hard failure.
  "llama-3.3-70b-versatile",
]);
export const GROQ_FAST = GROQ_FAST_MODELS[0]; // primary; existing imports keep working

// Smart: higher-quality dictation polish / minutes. Override with GROQ_SMART_MODELS.
export const GROQ_SMART_MODELS: string[] = ladder("GROQ_SMART_MODELS", [
  "llama-3.3-70b-versatile",
  // If the 70B model is retired, the instant model still produces usable prose —
  // a graceful degrade beats no answer.
  "llama-3.1-8b-instant",
]);
export const GROQ_SMART = GROQ_SMART_MODELS[0]; // primary; existing imports keep working

// Vision (reads images / scanned PDFs) is the highest deprecation risk — Groq
// retired llama-4-scout's sibling (maverick) in Feb 2026 with short notice. So
// this is a FALLBACK LADDER, not a single name: the OCR/extraction paths try each
// model in order and fall through when one is decommissioned. If Scout retires,
// set GROQ_VISION_MODELS in the environment (comma-separated, best first) and the
// whole app follows — no code change / redeploy of source needed.
export const GROQ_VISION_MODELS: string[] = ladder("GROQ_VISION_MODELS", [
  "meta-llama/llama-4-scout-17b-16e-instruct",
]);
export const GROQ_VISION = GROQ_VISION_MODELS[0]; // primary; existing imports keep working

export const GROQ_WHISPER = "whisper-large-v3-turbo"; // speech-to-text

/**
 * Map a single model name to the ladder it heads, so a call site that passes the
 * primary fast/smart model (`model: GROQ_FAST`) automatically gets the WHOLE
 * ladder — a decommissioned head self-heals through to the next entry with no
 * call-site change. Any other name (e.g. a specific vision model already being
 * looped by its caller, or a one-off) is returned as a single-entry ladder so
 * behaviour is unchanged. Pure lookup — no I/O.
 */
export function ladderFor(model: string): string[] {
  if (GROQ_FAST_MODELS[0] === model) return GROQ_FAST_MODELS;
  if (GROQ_SMART_MODELS[0] === model) return GROQ_SMART_MODELS;
  return [model];
}

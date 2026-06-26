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
// Migrated off llama-3.1-8b-instant (Groq deprecated it 2026-06-17, shutdown
// 2026-08-16) to Groq's recommended replacement openai/gpt-oss-20b. The 120B
// model backs it up; the old llama models stay LAST as a stop-gap until they're
// switched off (then the ladder self-heals straight past them).
export const GROQ_FAST_MODELS: string[] = ladder("GROQ_FAST_MODELS", [
  "openai/gpt-oss-20b",
  "openai/gpt-oss-120b",
  "llama-3.1-8b-instant", // deprecated — shuts down 2026-08-16, kept as last resort
]);
export const GROQ_FAST = GROQ_FAST_MODELS[0]; // primary; existing imports keep working

// Smart: higher-quality dictation polish / minutes. Override with GROQ_SMART_MODELS.
// Migrated off llama-3.3-70b-versatile (also deprecated 2026-06-17, shutdown
// 2026-08-16) to openai/gpt-oss-120b; the 20B model is a lighter stand-in.
export const GROQ_SMART_MODELS: string[] = ladder("GROQ_SMART_MODELS", [
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "llama-3.3-70b-versatile", // deprecated — shuts down 2026-08-16, kept as last resort
]);
export const GROQ_SMART = GROQ_SMART_MODELS[0]; // primary; existing imports keep working

// Vision (reads images / scanned PDFs) is the highest deprecation risk — Groq
// retired llama-4-scout's sibling (maverick) in Feb 2026 with short notice. So
// this is a FALLBACK LADDER, not a single name: the OCR/extraction paths try each
// model in order and fall through when one is decommissioned. If Scout retires,
// set GROQ_VISION_MODELS in the environment (comma-separated, best first) and the
// whole app follows — no code change / redeploy of source needed.
// ⚠️ scout itself is now deprecated (shutdown 2026-07-17). A vision-capable Groq
// replacement still needs confirming (Groq's stated replacements are text-only),
// so it's left as primary for now — document reading falls back to "rules" if it
// goes. When confirmed, prepend the new model here or via GROQ_VISION_MODELS.
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

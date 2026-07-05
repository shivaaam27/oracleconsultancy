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

/* ------------------------------------------------------------------------
 * Google Gemini ladders (the recommended Groq replacement — most generous free
 * tier + NATIVE vision). Reached through Gemini's OpenAI-compatible endpoint, so
 * the same harness/request shape works. Env-overridable exactly like the Groq
 * ladders. Gemini is only USED when the owner selects it + sets a key (Settings);
 * until then everything stays on Groq, so this is inert by default.
 * ---------------------------------------------------------------------- */
// Widened Jul 2026 — verified live against the account's key (32 generateContent
// models available, incl. Gemini 2.0/2.5/3/3.1/3.5 and Gemma 4). Each tier is now
// a LONG ladder spanning several model FAMILIES (Gemini flash/pro generations +
// Gemma), not just flash vs flash-lite — because Gemini rate-limits per model, a
// 429 on one entry falls through to the next (ai-json.ts already retries 429 by
// walking the ladder), so more distinct models = fewer real-world rate-limit
// failures.
//
// ORDER = most-advanced-first, highest-quota-last (owner's call, 2026-07-05): try
// the smartest model for quality; each 429 drops to the next; the ladder ends on
// the highest-daily-quota models so the app basically never goes fully quiet.
// Owner-reported free-tier daily caps (per-key, checked on their new key):
//   gemini-3.1-flash-lite / other flash-lite ~500/day · gemini-2.0/2.5 flash
//   ("plain") ~1,500/day · Gemma 4 ~1,500/day · most other defaults ~1,500/day.
// So flash-lite variants (lowest quota) sit ABOVE the 1,500/day models even
// though they're less capable — they're a mid-ladder rung, not the backstop.
// Gemma sits LAST: a separate open-weight family with its OWN quota pool, so it
// keeps answering even if every native Gemini model on the key is exhausted.
// Re-run `npx tsx scripts/list-gemini-models.ts` after a key change to confirm
// what's actually enabled/available before editing these lists.
export const GEMINI_FAST_MODELS: string[] = ladder("GEMINI_FAST_MODELS", [
  "gemini-3.5-flash",
  "gemini-3-flash-preview",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash-lite",
  "gemma-4-31b-it",
  "gemma-4-26b-a4b-it",
]);
export const GEMINI_SMART_MODELS: string[] = ladder("GEMINI_SMART_MODELS", [
  "gemini-3.5-flash",
  "gemini-3.1-pro-preview",
  "gemini-3-pro-preview",
  "gemini-3-flash-preview",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash-lite",
  "gemma-4-31b-it",
  "gemma-4-26b-a4b-it",
]);
// Gemini reads images/PDF pages natively (the real fix for the Groq-vision death).
// Gemma is text-only, so it's excluded here (would fail every vision call).
export const GEMINI_VISION_MODELS: string[] = ladder("GEMINI_VISION_MODELS", [
  "gemini-3.5-flash",
  "gemini-3.1-pro-preview",
  "gemini-3-pro-preview",
  "gemini-3-flash-preview",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash-lite",
]);

export type AiProvider = "groq" | "gemini";
export type ModelTier = "fast" | "smart" | "vision";

/** Which tier a passed model name heads. Call sites pass the Groq head names
 *  (GROQ_FAST / GROQ_SMART) or a specific vision model; map those to a tier so the
 *  active provider can substitute its own equivalent ladder. Unknown → null. */
export function tierOf(model: string): ModelTier | null {
  if (model === GROQ_FAST) return "fast";
  if (model === GROQ_SMART) return "smart";
  if (GROQ_VISION_MODELS.includes(model)) return "vision";
  return null;
}

/** The fallback ladder to actually try, for the ACTIVE provider + the tier the
 *  caller's model belongs to. So a call site that passes GROQ_FAST automatically
 *  runs on Gemini's fast ladder when Gemini is the active provider — no call-site
 *  change. A model with no known tier passes through unchanged. */
export function providerLadder(provider: AiProvider, model: string): string[] {
  const tier = tierOf(model);
  if (provider === "gemini") {
    if (tier === "fast") return GEMINI_FAST_MODELS;
    if (tier === "smart") return GEMINI_SMART_MODELS;
    if (tier === "vision") return GEMINI_VISION_MODELS;
    return [model];
  }
  if (tier === "fast") return GROQ_FAST_MODELS;
  if (tier === "smart") return GROQ_SMART_MODELS;
  return [model];
}

/** The vision ladder for the active provider (used by the scan reader). */
export function providerVisionModels(provider: AiProvider): string[] {
  return provider === "gemini" ? GEMINI_VISION_MODELS : GROQ_VISION_MODELS;
}

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

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
// Widened Jul 2026, then UNIFIED 2026-07-05 (owner audited the full AI Studio
// model list against what's actually enabled on the key — see
// memory/ai_provider_gemini.md for the full cross-reference). Same capability
// order across ALL THREE tiers now: try the most advanced model first, fall
// through on a 429 (ai-json.ts already retries 429 by walking the ladder) down
// to the highest-daily-quota models last, so the app basically never goes
// fully quiet. Deliberately EXCLUDED: `gemini-*-latest` aliases (they just
// point at one of the pinned models below, so retrying one after a 429 hits
// the SAME quota bucket — no benefit); `*-image`/`*-tts`/`*-computer-use`/
// `*-robotics-er`/`*-customtools`/`omni-flash-preview` (image/speech/agent/
// robotics products, wrong call shape for chat/JSON); `-preview` duplicates of
// a model already GA'd below. Re-run `npx tsx scripts/list-gemini-models.ts`
// after a key change to confirm what's actually enabled before editing these.
const GEMMA_LADDER = [
  "gemma-4-31b-it", // separate open-weight quota pool, ~1,500/day
  "gemma-4-26b-a4b-it", // separate open-weight quota pool, ~1,500/day
];
// FAST lane (agent JSON planning, extraction, high-frequency calls) is ordered
// QUOTA-FIRST, not quality-first: the high-RPD flash-lite / flash models come
// first so frequent calls don't exhaust the tiny-quota pro models (2.5-pro ~50/day,
// 3.x-pro-preview ~100/day). Gemma (separate ~1,500/day pool) is a strong tail;
// pro models sit LAST as a last resort. This is the fix for the rate-limit errors.
// FAST lane (agent JSON planning, extraction, high-frequency + vision). DEFAULT
// head = gemini-3-flash-preview: pro-grade quality (beats 2.5-pro on reasoning/
// coding/SWE) with a flash-sized ~1,500/day quota — best value, so rate-limits are
// rare. Then quota-first flash/flash-lite, the Gemma pool (separate ~1,500/day),
// and the tiny-quota pro models LAST. Ordered by (quality × quota headroom).
const GEMINI_FAST_LADDER = [
  "gemini-3-flash-preview",  // ⭐ DEFAULT — pro-grade, ~1,500/day
  "gemini-3.5-flash",        // top flash (agentic/coding)
  "gemini-2.5-flash-lite",   // ~1,000/day workhorse
  "gemini-2.0-flash-lite",   // older, own quota bucket
  "gemini-2.0-flash",        // older, own quota bucket
  "gemini-2.5-flash",        // mid-tier, 1M context
  "gemini-3.1-flash-lite",   // ~500/day
];
export const GEMINI_FAST_MODELS: string[] = ladder("GEMINI_FAST_MODELS", [
  ...GEMINI_FAST_LADDER,
  ...GEMMA_LADDER,           // separate open-weight ~1,500/day pool
  "gemini-2.5-pro",          // low quota — last resort only
]);
// SMART lane (occasional deep quality: minutes, summaries, hard answers). DEFAULT
// head = gemini-3.1-pro-preview (strongest reasoning), then fall back to the
// high-quota flash models so a busy pro quota never leaves smart calls stranded.
export const GEMINI_SMART_MODELS: string[] = ladder("GEMINI_SMART_MODELS", [
  "gemini-3.1-pro-preview",  // ⭐ DEFAULT — strongest reasoning
  "gemini-3-pro-preview",    // prior-gen pro
  "gemini-3-flash-preview",  // high-quota fallback (still pro-grade)
  "gemini-3.5-flash",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  ...GEMMA_LADDER,
]);
// Vision/OCR — every gemini flash/pro reads images natively. DEFAULT =
// gemini-3-flash-preview (quality + quota). Gemma is text-only, so excluded.
export const GEMINI_VISION_MODELS: string[] = ladder("GEMINI_VISION_MODELS", [
  ...GEMINI_FAST_LADDER,
  "gemini-2.5-pro",
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

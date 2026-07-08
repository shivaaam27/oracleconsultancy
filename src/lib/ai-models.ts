// One place for every Groq model name. Groq retires models with short notice —
// when that happens, change the name here and the whole app follows.
//
// EVERY workhorse model is now a FALLBACK LADDER, not a single hardcoded name:
// fast / smart / vision are each a comma-separated, env-overridable list (best
// first). The text + vision harness in ai-json.ts tries each entry in turn and
// falls through when one is decommissioned (a 4xx / model_not_found), so a
// retired Groq model SELF-HEALS via one Vercel env var — no source change or
// redeploy. The plain `AI_FAST` / `AI_SMART` / `AI_VISION` exports remain
// (= the FIRST ladder entry) so every existing import keeps working unchanged.

/** Parse a comma-separated env list ("a, b ,c" → ["a","b","c"]); [] if empty/unset. */
function envList(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Build a ladder from an env var, falling back to the built-in defaults.
 *  Also honours the historical `GROQ_*_MODELS` env name (these ladders used to be
 *  Groq-branded) so an existing Vercel override keeps working after the rename. */
function ladder(envName: string, defaults: string[]): string[] {
  const legacyName = envName.replace(/^AI_/, "GROQ_");
  const fromEnv = envList(envName);
  const fromLegacy = fromEnv.length ? [] : envList(legacyName);
  const resolved = fromEnv.length ? fromEnv : fromLegacy;
  return resolved.length ? resolved : defaults;
}

// Fast: default chat / extraction. Override with AI_FAST_MODELS (comma-sep).
// Migrated off llama-3.1-8b-instant (Groq deprecated it 2026-06-17, shutdown
// 2026-08-16) to Groq's recommended replacement openai/gpt-oss-20b. The 120B
// model backs it up; the old llama models stay LAST as a stop-gap until they're
// switched off (then the ladder self-heals straight past them).
export const AI_FAST_MODELS: string[] = ladder("AI_FAST_MODELS", [
  "openai/gpt-oss-20b",
  "openai/gpt-oss-120b",
  "llama-3.1-8b-instant", // deprecated — shuts down 2026-08-16, kept as last resort
]);
export const AI_FAST = AI_FAST_MODELS[0]; // primary; existing imports keep working

// Smart: higher-quality dictation polish / minutes. Override with AI_SMART_MODELS.
// Migrated off llama-3.3-70b-versatile (also deprecated 2026-06-17, shutdown
// 2026-08-16) to openai/gpt-oss-120b; the 20B model is a lighter stand-in.
export const AI_SMART_MODELS: string[] = ladder("AI_SMART_MODELS", [
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "llama-3.3-70b-versatile", // deprecated — shuts down 2026-08-16, kept as last resort
]);
export const AI_SMART = AI_SMART_MODELS[0]; // primary; existing imports keep working

// Vision "tier head" registry (document reading / OCR). The everyday AI runs on
// GEMINI (Groq removed — getActiveProvider() is hardcoded "gemini"), so live reads
// go through GEMINI_VISION_MODELS via providerVisionModels()/providerLadder(). These
// entries exist so tierOf() RECOGNISES a vision model and expands it to the active
// provider's full ladder; they now MIRROR the Gemini vision heads (keep in sync with
// GEMINI_VISION_MODELS below) so AI_VISION_MODELS[0] — used as the scan-crop request
// model and the usage-ledger label — is always a LIVE model.
//
// The retired Groq vision model (meta-llama/llama-4-scout, shutdown 2026-07-17) has
// been REMOVED: its shutdown is a NON-EVENT for this app. Env-overridable with
// AI_VISION_MODELS (comma-separated, best first) — no redeploy.
export const AI_VISION_MODELS: string[] = ladder("AI_VISION_MODELS", [
  "gemini-3.5-flash",       // best reader, multimodal
  "gemini-3.1-flash-lite",  // 500/day multimodal — big-capacity fallback
]);
export const AI_VISION = AI_VISION_MODELS[0]; // primary; existing imports keep working

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
// ── Ladders tuned to THIS key's ACTUAL free-tier quotas (AI Studio dashboard) ──
// Ground-truth RPD (requests/day) on the owner's key:
//   gemma-4-31b-it / gemma-4-26b-a4b-it = 1,500/day (text only, no vision)
//   gemini-3.1-flash-lite               = 500/day (multimodal)
//   gemini-3.5-flash / 3-flash / 2.5-flash = 30/day each (multimodal, best quality)
//   gemini-2.5-flash-lite               = 30/day
//   gemini-2.5-pro / 3.1-pro / 3-pro / 2.0-* = 0/day — NOT free, NEVER list them.
// The harness auto-cascades to the next entry on any 429 (separate quota pools),
// so ordering = "best model that still has quota". Env-overridable per lane.

// Text-quality order (best reasoning first) — used to build the SMART lane.
const GEMINI_TEXT_QUALITY = [
  "gemini-3.5-flash",        // best available (no pro on free tier), 30/day
  "gemini-3-flash-preview",  // 30/day
  "gemini-2.5-flash",        // 30/day
  "gemini-3.1-flash-lite",   // 500/day — big capacity, still capable
];
const GEMMA_LADDER = [
  "gemma-4-31b-it",          // 1,500/day, text only
  "gemma-4-26b-a4b-it",      // 1,500/day, text only
];

// FAST lane — agent planning, automation, simple/high-frequency work. QUOTA-FIRST:
// lead with the 1,500/day Gemma pool + 500/day flash-lite so it effectively never
// rate-limits (~3,590/day). JSON/tool planning doesn't need the top model.
export const GEMINI_FAST_MODELS: string[] = ladder("GEMINI_FAST_MODELS", [
  "gemma-4-31b-it",          // 1,500/day ⭐ workhorse
  "gemma-4-26b-a4b-it",      // 1,500/day
  "gemini-3.1-flash-lite",   // 500/day
  ...GEMINI_TEXT_QUALITY.slice(0, 3), // 30/day flashes as a quality top-up
  "gemini-2.5-flash-lite",   // 30/day
]);

// SMART lane — deep thinking / analysis. QUALITY-FIRST: the 3 best flashes (90/day
// combined) then the big-capacity fallbacks so a hard question never dead-ends.
export const GEMINI_SMART_MODELS: string[] = ladder("GEMINI_SMART_MODELS", [
  ...GEMINI_TEXT_QUALITY,    // 3.5-flash → 3-flash → 2.5-flash → 3.1-flash-lite
  ...GEMMA_LADDER,           // 1,500/day each
  "gemini-2.5-flash-lite",
]);

// VISION lane — document reading / OCR. MUST be multimodal, so Gemma is EXCLUDED
// (text only). Best readers first, then the 500/day flash-lite for capacity.
export const GEMINI_VISION_MODELS: string[] = ladder("GEMINI_VISION_MODELS", [
  "gemini-3.5-flash",        // best reader, 30/day
  "gemini-3-flash-preview",  // 30/day
  "gemini-2.5-flash",        // 30/day
  "gemini-3.1-flash-lite",   // 500/day — multimodal, big capacity
  "gemini-2.5-flash-lite",   // 30/day
]);

export type AiProvider = "groq" | "gemini";
export type ModelTier = "fast" | "smart" | "vision";

/* ------------------------------------------------------------------------
 * Free-tier daily QUOTAS (requests/day) — for the AI usage dashboard + the
 * chat model picker's "remaining today" hints. These are GOOGLE'S STATED
 * free-tier limits on the owner's key (AI Studio dashboard, see the ladder
 * comments above) and MAY CHANGE — treat as guidance, not a hard contract.
 * Keyed by model-id PREFIX so a versioned/dated id still resolves. Gemini free
 * quotas reset at MIDNIGHT PACIFIC (see nextPacificResetISO in ai-spend.ts).
 *
 * Env-overridable as one JSON blob (AI_MODEL_QUOTAS='{"gemini-3.5-flash":30}')
 * so the owner can retune when Google moves the goalposts — no redeploy.
 * ---------------------------------------------------------------------- */
const DEFAULT_MODEL_QUOTAS: Record<string, number> = {
  "gemma-4-31b-it": 1500,
  "gemma-4-26b-a4b-it": 1500,
  "gemini-3.1-flash-lite": 500,
  "gemini-3.5-flash": 30,
  "gemini-3-flash-preview": 30,
  "gemini-3-flash": 30,
  "gemini-2.5-flash": 30,
  "gemini-2.5-flash-lite": 30,
};

function parseQuotaEnv(): Record<string, number> {
  const raw = process.env.AI_MODEL_QUOTAS;
  if (!raw) return DEFAULT_MODEL_QUOTAS;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, number> = { ...DEFAULT_MODEL_QUOTAS };
    for (const [k, v] of Object.entries(parsed)) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) out[k] = n;
    }
    return out;
  } catch {
    return DEFAULT_MODEL_QUOTAS;
  }
}

export const MODEL_QUOTAS: Record<string, number> = parseQuotaEnv();

/** Known free-tier requests-per-day for a model id (longest-prefix match), or
 *  undefined when the model isn't in the quota map (unknown → show usage only,
 *  never a budget bar). Pure lookup. */
export function dailyQuotaFor(model: string | null | undefined): number | undefined {
  if (!model) return undefined;
  let best: number | undefined;
  let bestLen = -1;
  for (const [prefix, quota] of Object.entries(MODEL_QUOTAS)) {
    if (model.startsWith(prefix) && prefix.length > bestLen) {
      best = quota;
      bestLen = prefix.length;
    }
  }
  return best;
}

/** The text/tool-capable models eligible for the CHAT model picker (Ask/ORI chat
 *  only — NOT agent tool-calling, automations or vision). These are the
 *  GEMINI_TEXT_QUALITY flashes plus the high-capacity flash-lite: multimodal,
 *  reason well, and take the same chat-completions shape the ask stream uses.
 *  Gemma is EXCLUDED — it's the fast/JSON workhorse (text-only, no reasoning
 *  config) and the smart chat ladder already folds it in as a fallback. Deduped,
 *  quality-first (mirrors GEMINI_SMART_MODELS' head order). */
export const CHAT_MODELS: string[] = [...new Set(GEMINI_TEXT_QUALITY)];

/** Which tier a passed model name heads. Call sites pass the Groq head names
 *  (AI_FAST / AI_SMART) or a specific vision model; map those to a tier so the
 *  active provider can substitute its own equivalent ladder. Unknown → null. */
export function tierOf(model: string): ModelTier | null {
  if (model === AI_FAST) return "fast";
  if (model === AI_SMART) return "smart";
  if (AI_VISION_MODELS.includes(model)) return "vision";
  return null;
}

/** The fallback ladder to actually try, for the ACTIVE provider + the tier the
 *  caller's model belongs to. So a call site that passes AI_FAST automatically
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
  if (tier === "fast") return AI_FAST_MODELS;
  if (tier === "smart") return AI_SMART_MODELS;
  return [model];
}

/** The vision ladder for the active provider (used by the scan reader). */
export function providerVisionModels(provider: AiProvider): string[] {
  return provider === "gemini" ? GEMINI_VISION_MODELS : AI_VISION_MODELS;
}

/**
 * Map a single model name to the ladder it heads, so a call site that passes the
 * primary fast/smart model (`model: AI_FAST`) automatically gets the WHOLE
 * ladder — a decommissioned head self-heals through to the next entry with no
 * call-site change. Any other name (e.g. a specific vision model already being
 * looped by its caller, or a one-off) is returned as a single-entry ladder so
 * behaviour is unchanged. Pure lookup — no I/O.
 */
export function ladderFor(model: string): string[] {
  if (AI_FAST_MODELS[0] === model) return AI_FAST_MODELS;
  if (AI_SMART_MODELS[0] === model) return AI_SMART_MODELS;
  return [model];
}

/**
 * B3 — GRACEFUL AI-FREE MODE. The AI call layer (callAIText/callAIJson in
 * ai-json.ts) walks the WHOLE provider ladder and, when every model fails on a
 * transient/exhaustion condition, returns `ok:false` with an `error` code. This
 * predicate names the codes that mean "the AI is resting" — the entire ladder is
 * out of quota (429), timing out (network), or upstream-broken (5xx), OR the
 * spend cap has bitten. Callers (/api/ask, /api/ori) use it to DEGRADE to the
 * AI-free resolver path with a friendly note instead of surfacing a raw 5xx or
 * hanging on a spinner. `no-key` is deliberately EXCLUDED — a missing key is a
 * config problem the owner must fix, handled separately (503), not "AI resting".
 *
 * Pure lookup — accepts the string error union from either harness result (or
 * any string/undefined) so it's safe to pass a result.error directly.
 */
export function isAiExhausted(error: string | null | undefined): boolean {
  return (
    error === "rate-limited" ||
    error === "network" ||
    error === "http-error" ||
    error === "spend-cap"
  );
}

/** The friendly, principal-facing line for graceful AI-free mode — one place so
 *  every degraded surface reads the same. Kept short + calm (never "error"). */
export const AI_RESTING_NOTE =
  "ORI's AI is resting for a moment — here's what I can answer natively.";

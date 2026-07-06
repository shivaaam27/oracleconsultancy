import { getGroqOnlyKey, getAppSettings, getActiveProvider } from "./settings";
import { AI_FAST, AI_SMART, AI_VISION_MODELS, GROQ_WHISPER } from "./ai-models";
import { recordEvent } from "./system-events";

const GROQ_MODELS_URL = "https://api.groq.com/openai/v1/models";
const GEMINI_MODELS_URL = "https://generativelanguage.googleapis.com/v1beta/openai/models";

/**
 * Early warning for Groq model deprecations — the vision model especially is at
 * risk (its sibling was retired in Feb 2026 with short notice). Fetches Groq's
 * live model list and flags any configured model that is no longer served, so it
 * surfaces in the Activity log BEFORE document scanning silently breaks.
 *
 * Best-effort: never throws. The vision ladder counts as available if AT LEAST
 * ONE of its models is still listed (the fallback can carry it). Returns the list
 * of missing model ids (empty = all good / could not check).
 */
export async function checkModelAvailability(): Promise<{ missing: string[]; checked: boolean }> {
  // This watch is about GROQ retirements specifically — it needs the GROQ key
  // (the active chat provider may be Gemini, whose key Groq would reject).
  const apiKey = await getGroqOnlyKey();
  if (!apiKey) return { missing: [], checked: false };
  // With Gemini as the active provider, a retired Groq model no longer breaks
  // anything user-facing — skip so the log doesn't cry wolf about the fallback.
  if ((await getActiveProvider()) === "gemini") return { missing: [], checked: false };

  let available: Set<string>;
  try {
    const res = await fetch(GROQ_MODELS_URL, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { missing: [], checked: false };
    const body = await res.json();
    const ids = (body?.data ?? []).map((m: { id?: string }) => m?.id).filter(Boolean) as string[];
    if (!ids.length) return { missing: [], checked: false };
    available = new Set(ids);
  } catch {
    return { missing: [], checked: false };
  }

  const missing: string[] = [];
  // Vision: the whole ladder is "down" only if NONE of its models survive.
  if (!AI_VISION_MODELS.some((m) => available.has(m))) {
    missing.push(`vision (${AI_VISION_MODELS.join(" / ")})`);
  }
  for (const m of [AI_FAST, AI_SMART, GROQ_WHISPER]) {
    if (!available.has(m)) missing.push(m);
  }

  if (missing.length) {
    await recordEvent("model.deprecation", "error", {
      missing,
      hint: "Set AI_VISION_MODELS (or update src/lib/ai-models.ts) to a current model.",
    });
  } else {
    await recordEvent("model.deprecation", "ok", { checkedCount: available.size });
  }
  return { missing, checked: true };
}

// ---------------------------------------------------------------------------
// Groq KEY health
// ---------------------------------------------------------------------------

export type GroqKeyStatus =
  | "valid"        // the active key authenticated against Groq
  | "invalid"      // Groq rejected it (401/403) — expired/revoked/wrong key
  | "unknown"      // couldn't reach Groq (network/timeout) — don't cry wolf
  | "no-key"       // no key set anywhere (settings or env)
  | "ai-off";      // a key exists but the AI master switch is off

export type GroqKeyHealth = {
  status: GroqKeyStatus;
  source: "settings" | "env" | "none"; // where the key in effect comes from
  checkedAt: string;                    // ISO
};

// A small module-level cache so a page render that calls this (directly or via
// checkSystemHealth) doesn't hit Groq on every request. Best-effort, in-memory,
// per server instance.
let keyHealthCache: { value: GroqKeyHealth; at: number } | null = null;
const KEY_HEALTH_TTL_MS = 5 * 60_000; // 5 minutes

/**
 * Validate the Groq key that the app would actually use. This is deliberately
 * SEPARATE from getAiKey() (which also returns undefined when the master switch
 * is off or the spend cap is reached) — here we want to know whether the KEY
 * itself is good, regardless of those toggles, so the owner can tell "my key
 * expired" apart from "I turned AI off" / "I'm over budget".
 *
 * Classifies as valid / invalid / unknown / no-key / ai-off. Best-effort: never
 * throws, cached for a few minutes, fails to "unknown" on any network trouble so
 * a flaky connection never reports a good key as expired.
 */
export async function checkGroqKeyHealth(opts: { force?: boolean } = {}): Promise<GroqKeyHealth> {
  const now = Date.now();
  if (!opts.force && keyHealthCache && now - keyHealthCache.at < KEY_HEALTH_TTL_MS) {
    return keyHealthCache.value;
  }

  let status: GroqKeyStatus;
  let source: GroqKeyHealth["source"] = "none";
  try {
    // Validate the key of the ACTIVE provider (Gemini or Groq) against THAT
    // provider's endpoint — checking the Groq key while Gemini answers everything
    // would report the wrong thing entirely.
    const s = await getAppSettings();
    const provider = await getActiveProvider();
    const inApp = (provider === "gemini" ? s.geminiApiKey : s.groqApiKey).trim();
    const envKey = (provider === "gemini" ? process.env.GEMINI_API_KEY : process.env.GROQ_API_KEY)?.trim() || "";
    const key = inApp || envKey;
    source = inApp ? "settings" : envKey ? "env" : "none";
    const modelsUrl = provider === "gemini" ? GEMINI_MODELS_URL : GROQ_MODELS_URL;

    if (!key) {
      status = "no-key";
    } else if (!s.aiEnabled) {
      // A key is present but AI is switched off — not a key problem, so don't
      // burn a call validating it; just say so.
      status = "ai-off";
    } else {
      // Auth-only ping: GET /models is the cheapest authenticated call. We only
      // care about the status code — 200 = good, 401/403 = bad key, anything else
      // (5xx / network / timeout) = unknown.
      try {
        const res = await fetch(modelsUrl, {
          headers: { Authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(8_000),
        });
        if (res.ok) status = "valid";
        else if (res.status === 401 || res.status === 403) status = "invalid";
        else status = "unknown";
      } catch {
        status = "unknown";
      }
    }
  } catch {
    // getAppSettings itself failed — don't claim a key state we can't verify.
    status = "unknown";
  }

  const value: GroqKeyHealth = { status, source, checkedAt: new Date(now).toISOString() };
  keyHealthCache = { value, at: now };

  // Log only the genuinely actionable state (an expired/revoked key) so it lands
  // in the Activity log too; don't spam the log with routine "valid" checks.
  if (status === "invalid") {
    await recordEvent("model.keyhealth", "error", {
      source,
      hint: "The AI key was rejected (expired/revoked). Set a new one in Settings → AI & Voice.",
    }).catch(() => {});
  }

  return value;
}

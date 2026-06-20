import { getGroqKey } from "./settings";
import { GROQ_FAST, GROQ_SMART, GROQ_VISION_MODELS, GROQ_WHISPER } from "./ai-models";
import { recordEvent } from "./system-events";

const GROQ_MODELS_URL = "https://api.groq.com/openai/v1/models";

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
  const apiKey = await getGroqKey();
  if (!apiKey) return { missing: [], checked: false };

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
  if (!GROQ_VISION_MODELS.some((m) => available.has(m))) {
    missing.push(`vision (${GROQ_VISION_MODELS.join(" / ")})`);
  }
  for (const m of [GROQ_FAST, GROQ_SMART, GROQ_WHISPER]) {
    if (!available.has(m)) missing.push(m);
  }

  if (missing.length) {
    await recordEvent("model.deprecation", "error", {
      missing,
      hint: "Set GROQ_VISION_MODELS (or update src/lib/ai-models.ts) to a current model.",
    });
  } else {
    await recordEvent("model.deprecation", "ok", { checkedCount: available.size });
  }
  return { missing, checked: true };
}

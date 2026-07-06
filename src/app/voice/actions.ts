"use server";

import { AI_SMART } from "@/lib/ai-models";
import { callAIText } from "@/lib/ai-json";
import { getAppSettings, getAiKey, saveAppSettings } from "@/lib/settings";
import { loadContext } from "@/lib/ai-context";

type VoiceMode = "note" | "minutes" | "task" | "update" | "ask" | "message";
type VoiceSource = "ai" | "rules" | "no-key" | "error";

const LANGUAGE_LABELS: Record<string, string> = {
  "en-GB": "English",
  "sw-TZ": "Swahili",
  "hi-IN": "Hindi",
  "gu-IN": "Gujarati",
};

// Pure verbal tics that are never legitimate content — safe to strip in the
// rule fallback. Words like "actually"/"basically"/"literally" are deliberately
// NOT here: they can be real content, so only the AI removes them in context.
const FILLERS = ["um", "umm", "uh", "uhh", "er", "erm", "uhm", "hmm"];

// Rule-based clean-up used when AI is off or fails. Conservative on purpose:
// strips only unambiguous fillers, collapses whitespace, and capitalises.
// It does NOT resolve self-corrections or remove discourse words, because
// without the model it cannot tell a correction from real content — and the
// guiding rule is "when unsure, keep it".
function basicClean(text: string): string {
  let clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "";

  for (const filler of FILLERS) {
    const re = new RegExp(`(^|[\\s,.])${filler}(?=[\\s,.]|$)`, "gi");
    clean = clean.replace(re, "$1");
  }

  clean = clean.replace(/\s+([,.])/g, "$1").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

// Word-level difference count so callers can show "tidied N things".
function countChanges(raw: string, polished: string): number {
  const norm = (s: string) => s.toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/).filter(Boolean);
  const a = norm(raw);
  const b = norm(polished);
  return Math.abs(a.length - b.length) + a.filter((w, i) => b[i] !== undefined && b[i] !== w).length;
}

// Strip the conversational wrapper small/large models sometimes add despite being
// told not to: a leading "Here is the cleaned text:" preamble and surrounding quotes.
function stripModelChrome(text: string): string {
  let out = text.trim();
  out = out.replace(/^(?:sure|certainly|here(?:'s| is)|here are|the (?:cleaned|polished|corrected)[^:]*)[^:]*:\s*/i, "");
  // Remove a single pair of wrapping quotes/backticks.
  const m = out.match(/^(["'`])([\s\S]*)\1$/);
  if (m) out = m[2];
  out = out.replace(/^```[a-z]*\s*/i, "").replace(/```$/, "");
  return out.trim();
}

// Dictation clean-up runs on the shared provider-aware harness: the smart model
// of whichever provider is active (Gemini or Groq), with the harness's own
// retry/backoff and fall-through to the faster model. The old private fetch here
// hardcoded Groq's URL, which broke polish the moment Gemini became the provider.
async function polishChat(
  apiKey: string,
  messages: unknown[],
): Promise<{ ok: true; content: string } | { ok: false; status: number }> {
  const res = await callAIText({
    apiKey,
    model: AI_SMART, // mapped to the ACTIVE provider's smart ladder by the harness
    messages,
    maxTokens: 700,
    temperature: 0,
    source: "voice-polish",
  });
  if (res.ok && res.text) return { ok: true, content: res.text.trim() };
  return { ok: false, status: res.status ?? 0 };
}

export async function polishDictation(input: {
  text: string;
  mode?: VoiceMode;
  context?: string;
  language?: string;
}): Promise<{ raw: string; polished: string; source: VoiceSource; changes?: number; message?: string }> {
  const raw = input.text.trim();
  if (!raw) return { raw, polished: "", source: "rules" };

  const [settings, apiKey] = await Promise.all([getAppSettings(), getAiKey()]);
  const language = input.language || settings.voiceLanguage;
  const languageName = LANGUAGE_LABELS[language] ?? language;
  const dictionary = settings.voiceDictionary
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 80);

  if (!apiKey) {
    const polished = basicClean(raw);
    return { raw, polished, source: "no-key", changes: countChanges(raw, polished) };
  }

  // Pull the real people + company names so misheard names auto-correct.
  // Best-effort: a DB hiccup must not block dictation clean-up.
  let knownNames: string[] = [];
  try {
    const ctx = await loadContext();
    knownNames = [...ctx.companies.map((c) => c.name), ...ctx.people.map((p) => p.name)];
  } catch {
    /* names are a bonus; carry on without them */
  }
  // Merge dictionary terms first (operator-curated), then DB names, de-duped.
  const seen = new Set<string>();
  const protectedTerms = [...dictionary, ...knownNames]
    .filter((t) => {
      const key = t.toLowerCase();
      if (!t || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 200);

  const systemPrompt = `You are a dictation cleaner for the Oracle Consultancy system. You receive raw speech-to-text and rewrite it into the clean text the speaker meant. You ALWAYS rewrite — you never echo the input unchanged unless it is already clean. Output ONLY the cleaned text. No preamble, no quotes, no explanation, no "Here is".

1. SELF-CORRECTIONS (most important). When the speaker changes their mind, keep ONLY the final choice and delete the contradicted part and the cue word. Worked examples:
   - "send it to Amina, no wait, to Shivam" -> "Send it to Shivam"
   - "by 5pm, actually make it 6pm" -> "By 6pm"
   - "the red one, sorry the blue one" -> "The blue one"
   - "not this one, that one" -> "That one"
   - "call John, I mean call Mary" -> "Call Mary"
   - "meeting is with Pulin, no it's with Vishal" -> "Meeting is with Vishal"
   - "due Monday no Tuesday" -> "Due Tuesday"
   Correction cues: "no", "no wait", "no it's", "scratch that", "actually", "sorry", "I mean", "not X, Y", "or rather", "let me rephrase", "make it". Everything BEFORE the cue that it contradicts is removed. A bare "no" mid-sentence almost always signals a correction of the thing just said.

2. FILLERS & RESTARTS. Remove um, uh, er, erm, "you know", "sort of", "kind of", and collapse stutters/repeats ("we should, we should call" -> "we should call").

3. NAMES. These are the real companies/people: ${protectedTerms.join("; ") || "none"}. If a word clearly sounds like one of these misheard (e.g. "dar spaces" -> "Dar Spices", "ameena" -> "Amina"), fix it to the exact spelling. Never force an unrelated word onto this list.

4. NUMBERS/DATES/MONEY. "five pm" -> "5pm"; "twenty fifth of march" -> "25 March"; "ten thousand shillings" -> "TZS 10,000". Keep "next Friday" as-is (don't guess a date). Never invent a currency that wasn't spoken.

5. Keep meaning, real names, numbers, dates and commitments exact. Output in ${languageName}; British English spelling for English. Keep bullet structure for notes; be concise and professional for updates/messages. Never invent facts. If unsure whether something is a correction, keep it.`;

  const contextLine = input.context ? `Context: ${input.context}\n` : "";
  const userPrompt = `Mode: ${input.mode ?? "note"}\n${contextLine}\nClean up this dictation and return only the result:\n\n${raw}`;

  try {
    const result = await polishChat(apiKey, [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]);
    if (!result.ok) {
      const polished = basicClean(raw);
      return { raw, polished, source: "error", changes: countChanges(raw, polished), message: `AI returned HTTP ${result.status}` };
    }
    const aiText = stripModelChrome(result.content);
    const polished = aiText || basicClean(raw);
    return { raw, polished, source: aiText ? "ai" : "rules", changes: countChanges(raw, polished) };
  } catch (err) {
    const polished = basicClean(raw);
    return {
      raw,
      polished,
      source: "error",
      changes: countChanges(raw, polished),
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function teachVoiceDictionary(term: string): Promise<{ saved: boolean; message: string }> {
  const clean = term.replace(/\s+/g, " ").trim();
  if (!clean) return { saved: false, message: "Add a word or phrase first." };

  const settings = await getAppSettings();
  const existing = settings.voiceDictionary
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
  const seen = new Set(existing.map((item) => item.toLowerCase()));
  if (seen.has(clean.toLowerCase())) return { saved: false, message: "ORI already knows that phrase." };

  await saveAppSettings({ voiceDictionary: [...existing, clean].join("\n") });
  return { saved: true, message: "Added to the ORI voice dictionary." };
}

"use server";

import { getAppSettings, getGroqKey, saveAppSettings } from "@/lib/settings";
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

export async function polishDictation(input: {
  text: string;
  mode?: VoiceMode;
  context?: string;
  language?: string;
}): Promise<{ raw: string; polished: string; source: VoiceSource; changes?: number; message?: string }> {
  const raw = input.text.trim();
  if (!raw) return { raw, polished: "", source: "rules" };

  const [settings, apiKey] = await Promise.all([getAppSettings(), getGroqKey()]);
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

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          {
            role: "system",
            content: `You clean rough dictated speech for a Chief of Staff system. The input is raw speech-to-text: it contains fillers, false starts, repetitions, and the speaker changing their mind mid-sentence. Your job is to recover what the speaker finally meant to say.

Return only the polished text, no explanation, no preamble.

Clean-up rules (apply before anything else):
- Honour self-corrections: when the speaker changes their mind, keep only the final value and silently drop the earlier one. Examples: "by 5pm, actually make it 6pm" -> "by 6pm"; "send it to Amina, no wait, to Shivam" -> "send it to Shivam"; "the red one, sorry the blue one" -> "the blue one".
- Treat cues like "actually", "no wait", "scratch that", "I mean", "sorry", "let me rephrase", "or rather" as correction signals — keep the text after the cue, discard the contradicted text before it.
- Remove filler words and verbal tics: um, uh, er, erm, "you know", "I mean" (when not a correction), "sort of", "kind of", "basically", "literally".
- Collapse restarts and stutters: "I think we should, we should call the supplier" -> "We should call the supplier".
- Do NOT drop real information — only remove fillers, repetitions, and contradicted text. If unsure whether something is a correction, keep it.

Name correction:
- The following are the REAL names of companies and people in this system. If a word in the dictation is clearly a mis-transcription of one of them (sounds alike, e.g. "dar spaces" -> "Dar Spices", "ameena" -> "Amina"), correct it to the exact spelling below. Only correct when it is clearly the same name misheard — never force an unrelated word onto this list.
- Known names: ${protectedTerms.join("; ") || "none"}.

Number, date, and amount formatting:
- Convert spoken numbers to digits: "five pm" -> "5pm", "twenty five" -> "25".
- Normalise dates to a clear short form: "twenty fifth of march" -> "25 March", "next friday" -> keep as "next Friday" (do not guess a calendar date).
- Format currency clearly with its code where stated: "ten thousand shillings" -> "TZS 10,000", "five hundred dollars" -> "USD 500". Do not invent a currency that was not spoken.
- Keep times in a consistent form (e.g. "5pm", "09:30").

Formatting rules:
- Preserve meaning, names, numbers, dates, amounts, and commitments exactly (after resolving corrections).
- Keep the output in ${languageName}.
- Use British English spelling when the language is English.
- If the text is a meeting note, keep useful bullet structure.
- If the text is a task update or message, make it concise and professional.
- Never invent facts.`,
          },
          {
            role: "user",
            content: JSON.stringify({
              mode: input.mode ?? "note",
              context: input.context || null,
              dictatedText: raw,
            }),
          },
        ],
        max_tokens: 700,
        temperature: 0.1,
      }),
    });
    if (!res.ok) {
      const polished = basicClean(raw);
      return { raw, polished, source: "error", changes: countChanges(raw, polished), message: `AI returned HTTP ${res.status}` };
    }
    const data = await res.json();
    const aiText = String(data?.choices?.[0]?.message?.content || "").trim();
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
  if (seen.has(clean.toLowerCase())) return { saved: false, message: "COS already knows that phrase." };

  await saveAppSettings({ voiceDictionary: [...existing, clean].join("\n") });
  return { saved: true, message: "Added to the COS voice dictionary." };
}

"use server";

import { getAppSettings, getGroqKey, saveAppSettings } from "@/lib/settings";

type VoiceMode = "note" | "minutes" | "task" | "update" | "ask" | "message";
type VoiceSource = "ai" | "rules" | "no-key" | "error";

const LANGUAGE_LABELS: Record<string, string> = {
  "en-GB": "English",
  "sw-TZ": "Swahili",
  "hi-IN": "Hindi",
  "gu-IN": "Gujarati",
};

// Filler words and verbal tics that should never survive into polished text.
const FILLERS = [
  "um", "umm", "uh", "uhh", "er", "erm", "ah", "hmm",
  "you know", "i mean", "like i said", "sort of", "kind of",
  "basically", "literally", "actually you know",
];

// Rule-based clean-up used when AI is off or fails. Strips fillers and obvious
// self-corrections ("...no wait, X"), collapses whitespace, and capitalises.
function basicClean(text: string): string {
  let clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "";

  // Drop a leading discourse marker after a "scratch that" cue, keeping the latest take.
  clean = clean.replace(/\b(?:no wait|scratch that|i mean|sorry|let me rephrase|rather)\b[\s,]*/gi, " ");

  // Remove standalone filler words/phrases.
  for (const filler of FILLERS) {
    const re = new RegExp(`(^|[\\s,.])${filler}(?=[\\s,.]|$)`, "gi");
    clean = clean.replace(re, "$1");
  }

  clean = clean.replace(/\s+([,.])/g, "$1").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

export async function polishDictation(input: {
  text: string;
  mode?: VoiceMode;
  context?: string;
  language?: string;
}): Promise<{ raw: string; polished: string; source: VoiceSource; message?: string }> {
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

  if (!apiKey) return { raw, polished: basicClean(raw), source: "no-key" };

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

Formatting rules:
- Preserve meaning, names, numbers, dates, amounts, and commitments exactly (after resolving corrections).
- Keep the output in ${languageName}.
- Use British English spelling when the language is English.
- If the text is a meeting note, keep useful bullet structure.
- If the text is a task update or message, make it concise and professional.
- Never invent facts.
- Preserve these dictionary terms exactly when they appear or are clearly intended: ${dictionary.join("; ") || "none"}.`,
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
    if (!res.ok) return { raw, polished: basicClean(raw), source: "error", message: `AI returned HTTP ${res.status}` };
    const data = await res.json();
    const polished = String(data?.choices?.[0]?.message?.content || "").trim();
    return { raw, polished: polished || basicClean(raw), source: polished ? "ai" : "rules" };
  } catch (err) {
    return {
      raw,
      polished: basicClean(raw),
      source: "error",
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

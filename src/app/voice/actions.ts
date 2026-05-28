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

function basicClean(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
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
            content: `You clean rough dictated speech for a Chief of Staff system.

Return only the polished text, no explanation.

Rules:
- Preserve meaning, names, numbers, dates, amounts, and commitments.
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

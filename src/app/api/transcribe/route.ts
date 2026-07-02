import { GROQ_WHISPER } from "@/lib/ai-models";
import { NextRequest, NextResponse } from "next/server";
import { getAppSettings, getGroqOnlyKey } from "@/lib/settings";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Map our BCP-47 voice language codes to Whisper's 2-letter ISO-639-1 hints. */
const LANGUAGE_HINT: Record<string, string> = {
  "en-GB": "en",
  "sw-TZ": "sw",
  "hi-IN": "hi",
  "gu-IN": "gu",
};

/**
 * Speech-to-text engine. Records arrive as audio FormData and are transcribed by
 * Groq's Whisper model. The personal voice dictionary is passed as a prompt bias
 * so uncommon names/terms come back spelt correctly.
 *
 * Returns { text, source }. AI-off or failures return empty text with a source
 * the client uses to fall back to browser speech recognition.
 */
export async function POST(req: NextRequest) {
  try {
    // Whisper only exists on Groq — use the GROQ key specifically (the active
    // chat provider may be Gemini, whose key Groq would reject with a 401).
    // No Groq key → the client falls back to browser speech recognition.
    const apiKey = await getGroqOnlyKey();
    if (!apiKey) {
      return NextResponse.json({ text: "", source: "no-key" });
    }

    const form = await req.formData();
    const audio = form.get("audio");
    if (!(audio instanceof Blob) || audio.size === 0) {
      return NextResponse.json({ text: "", source: "error", message: "No audio received." }, { status: 400 });
    }

    const language = String(form.get("language") || "");
    const settings = await getAppSettings();

    // Bias the model toward the operator's vocabulary so names come back right.
    const dictionary = settings.voiceDictionary
      .split(/\r?\n|,/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 80);
    const promptBias = dictionary.length
      ? `Spell these names and terms correctly when heard: ${dictionary.join(", ")}.`
      : "";

    const groqForm = new FormData();
    const filename = (audio as File).name || "dictation.webm";
    groqForm.set("file", audio, filename);
    groqForm.set("model", GROQ_WHISPER);
    groqForm.set("response_format", "json");
    groqForm.set("temperature", "0");
    const hint = LANGUAGE_HINT[language];
    if (hint) groqForm.set("language", hint);
    if (promptBias) groqForm.set("prompt", promptBias);

    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: groqForm,
      // Audio upload + transcription can run longer than a chat call; cap well
      // under the 60s function wall so a hung request can't block the whole time.
      // A timeout throws -> caught below -> client falls back to browser speech.
      signal: AbortSignal.timeout(45000),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Whisper error:", res.status, err);
      return NextResponse.json({ text: "", source: "error", message: `Transcription HTTP ${res.status}` });
    }

    const data = await res.json();
    const text = String(data?.text || "").trim();
    return NextResponse.json({ text, source: text ? "ai" : "error" });
  } catch (e) {
    console.error("Transcribe route error:", e);
    return NextResponse.json({
      text: "",
      source: "error",
      message: e instanceof Error ? e.message : String(e),
    });
  }
}

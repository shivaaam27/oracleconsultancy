"use server";

// Live camera narration for the in-site scanner (scan-capture.tsx). While the
// camera preview is open we grab a snapshot every couple of seconds and ask
// the ACTIVE provider's fast vision model, in one short sentence, what's in
// frame — the "Gemini Live" feel without the real Gemini Live API (a separate,
// WebSocket/session-limited product — see memory/ai_provider_gemini.md for why
// that's the wrong tool here). Every caption is cheap (small maxTokens, terse
// prompt) and reuses the SAME widened/reordered vision ladder as document
// extraction, so it inherits the same rate-limit resilience automatically.
import { callAIText } from "@/lib/ai-json";
import { providerVisionModels } from "@/lib/ai-models";
import { getAiKey, getActiveProvider } from "@/lib/settings";
import { recordQA } from "@/lib/ai-memory";

const NARRATE_PROMPT =
  "You are narrating a live phone-camera feed for someone scanning a paper document. " +
  "In ONE short, plain sentence, say what's currently in frame (e.g. the document type, " +
  "whether it's in focus/well-lit, a name/date/number you can read, or that it's blank/blurry/not a document). " +
  "No preamble, no markdown — just the sentence.";

export async function narrateScanFrameAction(
  imageDataUrl: string
): Promise<{ ok: boolean; caption: string | null }> {
  const apiKey = await getAiKey();
  if (!apiKey) return { ok: false, caption: null };
  const provider = await getActiveProvider();
  const res = await callAIText({
    apiKey,
    models: providerVisionModels(provider),
    maxTokens: 60,
    temperature: 0.2,
    attempts: 1, // a live caption is disposable — don't retry/backoff, just skip this frame
    timeoutMs: 8000,
    source: "scan-narrate",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: NARRATE_PROMPT },
          { type: "image_url", image_url: { url: imageDataUrl } },
        ],
      },
    ],
  });
  if (!res.ok || !res.text) return { ok: false, caption: null };
  return { ok: true, caption: res.text.trim() };
}

/** Save the running captions from one scan session into ORI memory, so what
 *  the camera saw is recallable later ("what did I scan earlier"). Best-effort. */
export async function saveScanNarrationAction(
  captions: string[],
  documentHint?: string | null
): Promise<{ ok: boolean }> {
  const lines = captions.map((c) => c.trim()).filter(Boolean);
  if (lines.length === 0) return { ok: true };
  const when = new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
  const question = `Live scan session${documentHint ? ` — ${documentHint}` : ""} (${when})`;
  const answer = lines.join(" · ");
  const ok = await recordQA("admin", question, answer);
  return { ok };
}

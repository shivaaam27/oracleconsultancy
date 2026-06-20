// One place for every Groq model name. Groq retires models with short notice —
// when that happens, change the name here and the whole app follows.
export const GROQ_FAST = "llama-3.1-8b-instant"; // default chat / extraction
export const GROQ_SMART = "llama-3.3-70b-versatile"; // higher-quality dictation polish

// Vision (reads images / scanned PDFs) is the highest deprecation risk — Groq
// retired llama-4-scout's sibling (maverick) in Feb 2026 with short notice. So
// this is a FALLBACK LADDER, not a single name: the OCR/extraction paths try each
// model in order and fall through when one is decommissioned. If Scout retires,
// set GROQ_VISION_MODELS in the environment (comma-separated, best first) and the
// whole app follows — no code change / redeploy of source needed.
export const GROQ_VISION_MODELS: string[] =
  process.env.GROQ_VISION_MODELS?.split(",").map((s) => s.trim()).filter(Boolean).length
    ? process.env.GROQ_VISION_MODELS!.split(",").map((s) => s.trim()).filter(Boolean)
    : ["meta-llama/llama-4-scout-17b-16e-instruct"];
export const GROQ_VISION = GROQ_VISION_MODELS[0]; // primary; existing imports keep working

export const GROQ_WHISPER = "whisper-large-v3-turbo"; // speech-to-text

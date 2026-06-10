// One place for every Groq model name. Groq retires models with short notice —
// when that happens, change the name here and the whole app follows.
export const GROQ_FAST = "llama-3.1-8b-instant"; // default chat / extraction
export const GROQ_SMART = "llama-3.3-70b-versatile"; // higher-quality dictation polish
export const GROQ_VISION = "meta-llama/llama-4-scout-17b-16e-instruct"; // reads images / scanned PDFs
export const GROQ_WHISPER = "whisper-large-v3-turbo"; // speech-to-text

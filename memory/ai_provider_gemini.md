# AI provider swap — Google Gemini (drop Groq)

**Status: BUILT 2026-07-02, local then pushed. INERT by default (stays on Groq
until the owner selects Gemini + sets a key).** Owner chose "Gemini only" for the
everyday/synchronous AI; the cloud agent is for heavy/background only (harden separately).

## Why
Groq churns models constantly and its vision model dies 17 Jul. Google Gemini's
free tier is the most generous (Gemini 2.5 Flash: ~1,500 req/day, 10/min, 1M tok/min,
no card) AND natively multimodal — so it reads scans/photos for free, the real fix
for the vision shutdown. Reached via Gemini's OpenAI-COMPATIBLE endpoint, so the
existing harness works with a URL change.

## How it works (the swap is settings-driven, no call-site changes)
- The AI harness (`src/lib/ai-json.ts`) already had a provider abstraction
  (`AIProvider`/`PROVIDERS`). Added `geminiProvider` (same OpenAI-compat impl as
  Groq, base URL `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`,
  `Authorization: Bearer <key>`). One `openAiCompatProvider(id,url)` factory now
  builds both.
- `activeProviderId()` in the harness reads the owner's choice via
  `settings.getActiveProvider()` (dynamic import, no cycle). Default "groq".
- Model tiers: call sites still pass `GROQ_FAST`/`GROQ_SMART`/a vision id. In
  `ai-models.ts`, `tierOf()` maps those to a tier and `providerLadder(provider,model)`
  substitutes the ACTIVE provider's ladder — so a call that asks for GROQ_FAST runs
  on `GEMINI_FAST_MODELS` when Gemini is active. `providerVisionModels()` does the
  same for the scan reader (`groqVision` in documents/actions.ts).
- Gemini ladders: `GEMINI_FAST_MODELS` (gemini-2.5-flash-lite → flash),
  `GEMINI_SMART_MODELS`/`GEMINI_VISION_MODELS` (gemini-2.5-flash → flash-lite),
  all env-overridable (`GEMINI_*_MODELS`).
- Key gate: `getGroqKey()` is now a back-compat alias of the new `getAiKey()`, which
  returns the ACTIVE provider's key (in-app first, env `GEMINI_API_KEY`/`GROQ_API_KEY`
  fallback), gated on aiEnabled + spend cap. Every existing caller (does `getGroqKey()`)
  transparently gets the active provider's key — no call-site changes.
- Settings: `aiProvider` ("groq"|"gemini") + `geminiApiKey` settings; Settings →
  AI & Voice has a provider dropdown + a masked Gemini key field (mirrors the Groq/
  OCR key fields). `getActiveProvider()` returns "gemini" ONLY when a Gemini key
  exists, so selecting it without a key can't leave the app with no AI.

## LIVE-VERIFIED 2026-07-02 (owner's key, provider=gemini)
A scanned Tax Clearance Certificate read end-to-end via Gemini (source=vision,
conf 0.9, classified, TIN→company, ref+expiry) in 8s. Two fixes shipped during
live verification (commit 46d2387):
1. **Gemini 2.5 models "think" by default** → the reasoning ate the small answer
   budget → truncated JSON (finish_reason=length), the "it's failing" symptom.
   FIX: geminiProvider sends `reasoning_effort:"none"` on every call (via the
   openAiCompatProvider `extraBody` arg). Confirmed clean JSON after.
2. **visionTranscribe** (the supplementary OCR transcript) still hardcoded the dead
   Groq vision ladder → under Gemini it fell to in-site Tesseract (~42s). FIX: it now
   uses `providerVisionModels(await getActiveProvider())` → ~42s dropped to ~8s.

## Notes / possible tweaks
- If Gemini's compat layer ever rejects `max_tokens`, send `max_completion_tokens` too.
- No cross-provider auto-fallback (Gemini→Groq) — the owner chose Gemini-only; the
  in-provider ladder (flash→flash-lite) gives resilience. Add cross-provider fallback
  later if wanted (needs both keys available to the harness).
- Groq code/ladders KEPT (default provider) so nothing breaks pre-switch; Groq
  naturally sunsets (text Aug, vision 17 Jul).

## Alternatives considered (July 2026)
- OpenRouter: one key, ~28 free models incl. DeepSeek R1, but free tier 50/day
  (1000/day after a one-time $10). Good as a future secondary; the abstraction makes
  adding it another `openAiCompatProvider("openrouter", ...)` + ladder.
- Cloud agent (Max plan): for heavy/background agentic work only — ~1-2 min latency,
  needs an always-on host; wrong tool for the fast path. See [[cloud_agent_plan]].

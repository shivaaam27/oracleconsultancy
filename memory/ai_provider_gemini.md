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
- Gemini ladders: originally just flash ↔ flash-lite; **widened 2026-07-05** to a
  long multi-family ladder per tier (Gemini 2.0/2.5/3/3.1/3.5 flash+pro generations,
  plus Gemma 4) — see `src/lib/ai-models.ts`. Since Gemini rate-limits per model and
  the harness (`ai-json.ts`) already falls through to the next ladder entry on a
  429, more distinct models = far fewer real rate-limit failures (excluded from
  the vision ladder — Gemma is text-only).
  **Reordered same day (owner call)**: most-advanced-first, highest-quota-last.
  Owner-reported free-tier daily caps on their key: flash-lite variants ~500/day
  (lowest — sit mid-ladder, not last, since they're less capable too), Gemini
  2.0/2.5 "plain" flash + most other defaults ~1,500/day, Gemma 4 ~1,500/day.
  So each ladder tries the smartest model (3.5/pro) first for quality, falls
  through on rate-limit, and ends on Gemma — a separate open-weight family with
  its OWN quota pool, so it keeps answering even if every native Gemini model on
  the key is exhausted for the day. All still env-overridable (`GEMINI_*_MODELS`).
  `scripts/list-gemini-models.ts` lists what's actually enabled on the current key
  (`npx tsx scripts/list-gemini-models.ts`) — re-run it after a key change before
  editing these lists, since availability varies per key/region.
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

## Round 2 (2026-07-02 evening, commit 3d396e6) — the live "AI key isn't working"
⌘K ORI failed on prod: /api/ask's STREAMING path fetched api.groq.com directly with
the (now Gemini) key → 401 → "ORI's AI key isn't working". Root class: 4 paths
hardcoded Groq. ALL fixed + the class killed at the harness:
- callGroqText maps EVERY model (incl. explicit `models:` ladders) through
  providerLadder — a Groq name can never hit the Gemini endpoint again.
- ai-json exports PROVIDER_CHAT_URLS + providerRequestExtras for direct-fetch
  (streaming) callers; /api/ask streaming is provider-aware (live-verified: ~2s).
- Whisper transcription uses getGroqOnlyKey (Groq-only service; browser-speech
  fallback if no Groq key). Voice polish moved onto the shared harness.
- model-watch key-health checks the ACTIVE provider's key against ITS endpoint;
  Groq-retirement watch silent when Gemini active.

## Cloud agent (same commit) — "turned off" root cause + extract now FILES
- Dispatcher was dead with a stale .dispatcher.lock; the SessionStart guard's PID
  check was fooled (bash/Windows PID mismatch) → agent silently off. FIX: the
  dispatcher heartbeats the lock every ~30s; the guard now checks lock FRESHNESS
  (<3 min) and clears stale locks. Dispatcher restarted + running.
- applyExtract: when the Opus worker resolves an owner it now FILES the doc out of
  quarantine + reconciles compliance + reindexes + logs. LIVE PROOF: doc 648
  ("unreadable") → identified as a calendar-decline email, owned to Oracle
  Consultancy, filed automatically. enqueueDocExtract now fires from EVERY
  quarantine door + shaky attachment reads (was inbox-button only).
- Division of labour: Gemini = instant everyday AI (site never depends on the
  agent); Opus agent = background re-reads/heavy jobs, catches up whenever the
  dispatcher runs (auto-starts with the Claude app; 24/7 needs the SETUP_24_7 host).
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

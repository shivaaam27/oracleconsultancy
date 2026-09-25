# ORI search + AI reliability — how it works now

Durable reference for the ⌘K search engine and the AI provider routing. First
written 2–6 Jul 2026, updated Sept 2026; all of it is on `master`. For the entity
registry, indexing and trace see [[ori_brain]].

## 1. AI provider — Gemini for everything except voice

- **Gemini is the only text/vision provider.** `getActiveProvider()` in
  `src/lib/settings.ts` returns `"gemini"` unconditionally. Ladders live in
  `src/lib/ai-models.ts` — one pair for every lane, `gemini-3.1-flash-lite` →
  `gemini-3.5-flash-lite`, env-overridable (`GEMINI_FAST/SMART/VISION_MODELS`).
- **Groq is voice only** — Whisper (`GROQ_WHISPER`, `whisper-large-v3-turbo`) via
  `getGroqOnlyKey()`. No Groq key → dictation falls back to browser speech. The
  Groq model-retirement watch goes quiet under Gemini.
- **Naming is provider-neutral** (Jul 2026): `AI_FAST/SMART/VISION(+_MODELS)`,
  `callAIText` / `callAIJson`, `AiUsage`, error codes `ai-<n>`, key via
  `getAiKey()`. Kept Groq-branded on purpose: `GROQ_WHISPER`, `getGroqOnlyKey`,
  and the stored key names `GROQ_API_KEY` / `groqApiKey` (renaming would wipe the
  stored key). `ladder()` still reads legacy `GROQ_*_MODELS` env names.
- **THE CLASS-OF-BUG KILL:** the harness (`src/lib/ai-json.ts`) maps EVERY model —
  including explicit `models:` ladders — through `providerLadder(provider, model)`,
  so a Groq model name can never reach the Gemini endpoint (that was a live 401).
  Vision uses `providerVisionModels(provider)`.
- **Direct-fetch callers** (streaming — the harness buffers) must use
  `PROVIDER_CHAT_URLS[provider]` + `providerRequestExtras(provider)`.
  **FORWARD RULE:** never `fetch` a provider URL directly for chat.
- ⚠️ **Gemini "thinks" by default**, eating a small answer budget → truncated JSON.
  `providerRequestExtras("gemini")` sends `reasoning_effort: "none"` — and ONLY to
  `gemini-*` models; a `gemma-*` fallback 400s on it.
- ⚠️ **The streaming branch of `/api/ask` must walk the WHOLE ladder** (smart +
  fast, deduped, capped), moving on at 429/400/404, like `callAIText` does. It once
  tried only the two heads, so a spent daily quota fell to a model that 400'd and
  ORI answered "couldn't complete that". It logs the real model + status on failure.
- Spend lands in `ai_usage` and honours `aiMonthlySpendCap` (0 = unlimited, fails open).

## 2. Streaming (the "answer cut off after 1–4 words" bug)

`/api/ask` streamed via a `ReadableStream` `pull()` that read ONE upstream chunk per
call. Gemini splits one SSE event across arbitrary TCP chunks (a lone `"d"`, then
`"ata: {…}"`), and a pull that buffered a partial line without enqueuing was not
reliably re-invoked. **Fix:** drain the whole upstream in ONE `start(controller)`
loop, buffering partial lines. ⚠️ **FORWARD RULE: SSE proxying uses a `start` loop,
never pull-one-chunk.**

## 3. ⌘K search — instant, natural-language, NO AI

The surface is **Studio search** (`src/components/studio/search.tsx`, 24 Sept
2026): one ranked list of the best eight hits, a quiet row of kinds to narrow it
(Tab steps through), and "Ask ORI" as the last row — the FIRST row when the query
reads like a question or an instruction. No preview pane, no history switch. It
only renders: the data (one `/api/search` call, recent pages, the ORI hand-off)
stays in `CommandPaletteProvider` (`components/command-palette.tsx`).

`/api/search` returns `{ items, results, directAnswer, smartAnswer }`:
- **smartAnswer** (`src/lib/smart-answer.ts`, `resolveSmartAnswer(q)`) —
  deterministic natural-language LIST answers, first match wins through the
  `resolvers` array: briefing, ORI actions, radar, what-happened / entity
  activity, compare / workload / leaderboards, portal engagement analytics,
  leave, document expiry, overdue / due / recently-updated tasks, probation,
  assets, tasks-by-person, counts. A zero-result intent still returns a card
  with a `note` rather than falling through.
  - **FORWARD RULE — add an intent = ONE async resolver `(q) => SmartAnswer | null`
    in the `resolvers` array.** Order matters.
  - ⚠️ `matchCompany` / `matchPerson` use WORD BOUNDARIES + aliases + min length 3 —
    a 2-char code like "OC" must not match inside "d[oc]uments" (a real bug).
- **directAnswer** (`src/lib/direct-answer.ts`) — single-value lookups
  ("PES TIN", a document's expiry).
- **results** (`src/lib/search.ts` `unifiedSearch`) — the registry-driven deep
  index (typo-tolerant, synonym-expanded, per-type cap) plus Postgres FTS over
  documents via the `search_documents` RPC. Since migration 0114 that FTS covers
  only the fields the owner typed (title, type, reference, issuer, category,
  notes) — there is no extracted body any more.
- **Tasks** are token-scored (typo-tolerant, synonym-expanded) in the route.

## 4. ORI Ask speed

`buildContext` in `/api/ask` loads the document list only when the question is
about documents (or FTS/semantic matched one). Remaining latency in local testing
is mostly local→EU database round-trips; production sits near the database.

## Ideas discussed, not built

- Answer-row actions (Chase / Renew inline on an expiring-document row).
- Pinned / saved answers on Home.

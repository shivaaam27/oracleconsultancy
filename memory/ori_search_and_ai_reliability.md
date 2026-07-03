# ORI search + AI reliability (2026-07-02/03) — how it works now

Durable reference for the ⌘K search engine, the AI provider routing, and the
cloud-agent bridge after the reliability + search-upgrade sessions. All commits
pushed to master (last: 8bbc83f). Builds on [[ai_provider_gemini]] and
[[cloud_agent_plan]].

## 1. AI provider — Gemini is the everyday brain (Groq dropped)
- The harness (`src/lib/ai-json.ts`) has a provider abstraction: `PROVIDERS`
  (groq + gemini, both `openAiCompatProvider(id, url, extraBody)`), the ACTIVE
  one chosen by `getActiveProvider()` from settings (`aiProvider` = groq|gemini;
  resolves to gemini only when a `geminiApiKey` exists — so picking Gemini with no
  key can't break AI).
- **THE CLASS-OF-BUG KILL:** `callGroqText`/`callGroqJson` now map EVERY model —
  including explicit `models:` ladders — through `providerLadder(activeProvider,
  model)` (`src/lib/ai-models.ts`: `tierOf` + GEMINI_*_MODELS). So a Groq model
  name can NEVER be sent to the Gemini endpoint (that was the live "ORI's AI key
  isn't working" 401). Vision uses `providerVisionModels(activeProvider)`.
- **Direct-fetch callers** (streaming — the harness buffers) must use the exported
  `PROVIDER_CHAT_URLS[provider]` + `providerRequestExtras(provider)`. `/api/ask`
  streaming does this now (it used to hardcode `api.groq.com`).
- **Gemini quirk:** 2.5 models "think" by default, which eats a small answer
  budget → truncated JSON. `providerRequestExtras("gemini")` sends
  `reasoning_effort:"none"` on every call. Confirmed fix.
- **Groq-only services:** Whisper speech-to-text + the Groq model-retirement watch
  use `getGroqOnlyKey()` (not the active-provider key). No Groq key → dictation
  falls back to browser speech; the watch goes quiet under Gemini.
- **Key gate:** `getGroqKey()` is now a back-compat alias of `getAiKey()` (returns
  the ACTIVE provider's key). `model-watch.ts` key-health validates the active
  provider's key against ITS endpoint.
- **Owner action to activate:** paste a free key from aistudio.google.com/apikey
  into Settings → AI & Voice → "Gemini key", set provider = Gemini. Env fallback:
  `GEMINI_API_KEY`. Model ladders env-overridable (`GEMINI_FAST/SMART/VISION_MODELS`).
- **FORWARD RULE:** never `fetch("https://api.groq.com/...")` directly for chat.
  Use the harness (`callGroqText`/`callGroqJson`) or `PROVIDER_CHAT_URLS` for streaming.

## 2. Streaming (the "answer cut off after 1-4 words" bug)
`/api/ask` streamed via a `ReadableStream` `pull(controller)` that read ONE
upstream chunk per call. Gemini splits a single SSE event across arbitrary TCP
chunks (a lone `"d"`, then `"ata: {…}"`; `[DONE]` byte-by-byte) — a pull that
buffered a partial line without enqueuing wasn't reliably re-invoked, so it
stalled after the first delta. **Fix:** drain the WHOLE upstream in ONE
`start(controller)` loop, buffering partial lines. FORWARD RULE: SSE proxying uses
a `start` loop, never `pull`-one-chunk.

## 3. ⌘K search — instant, natural-language, NO AI
Three layers, all returned by `/api/search` (`{ items, results, directAnswer,
smartAnswer }`) and rendered in `command-palette.tsx`:
- **smartAnswer** (`src/lib/smart-answer.ts`, `resolveSmartAnswer(q)`) — the
  natural-language LIST answers, deterministic, no AI. Returns a `SmartAnswer`
  card `{ kind, title, count, rows:[{label,sub,badge,tone,href}], note?, href? }`
  rendered at the TOP of the palette. Intents (first match wins), in order:
  leave · company-compliance · who-missing-[doc] · expiring/expired docs ·
  overdue tasks · due today/this week · probation-ending · assets-of-[person] ·
  counts. Zero-result intents STILL return a card with a `note` ("Nobody —
  everyone's in") instead of falling through.
  - **FORWARD RULE — add an intent = ONE async resolver `(q)=>SmartAnswer|null`
    + add it to the `resolvers` array.** Order matters (put company-scoped before
    person-scoped so "dar spices missing documents" → company, not person).
  - `matchCompany`/`matchPerson` use WORD BOUNDARIES + aliases + min-length 3 —
    a 2-char code like "OC" must not match inside "d[oc]uments" (real bug fixed).
  - who-missing matches the EXACT catalogue `personReqLabel` ("Passport", not
    "Passport photo"); company-compliance uses read-only `buildCompanyRequirementScores`.
- **directAnswer** (`src/lib/direct-answer.ts`) — single-VALUE lookups
  ("Gangadhar passport", "PES TIN", doc expiry).
- **results** (`src/lib/search.ts` `unifiedSearch`) — the 12-type deep index
  (typo-tolerant, synonym-expanded, per-type cap) + **Postgres FTS augmentation**
  reading INSIDE document bodies. "Found inside": the FTS `«…»` highlight markers
  are kept in `SearchResult.snippet`; the palette `HighlightSnippet` bolds them so
  a phrase living only in a scanned PDF (a bank name, a reference) surfaces with
  the exact matched words. (Verified: "diamond trust" → «Diamond» «Trust» Bank
  inside an insurance policy.)
- **Tasks** are token-scored (typo-tolerant, synonym-expanded) in the route now,
  not a crude substring filter.

## 4. ORI Ask (AI) speed
`buildContext` (`/api/ask`) no longer loads the whole document library OR
recomputes every company/person compliance score on questions that aren't about
documents/compliance — gated behind `wantCompliance`/`wantDocsBlock` (still runs
when the question is doc/compliance/plan-related, or FTS/semantic matched a doc).
The remaining latency in local testing is mostly local→EU DB round-trips; prod
(Vercel pinned near the EU DB) is much faster.

## 5. Cloud agent (Opus on the Max plan) — background brain
- **"Turned off" root cause:** a stale `.dispatcher.lock` (dead PID) fooled the
  SessionStart guard's PID check. FIX: `agent-dispatcher.ts` heartbeats the lock
  every ~30s; `dispatcher-guard.sh` now checks lock FRESHNESS (<3 min) and clears
  stale locks. The paused `ori-worker` scheduled task is RETIRED (relabelled) —
  the dispatcher replaced it.
- **applyExtract now FILES** a re-read doc out of quarantine when the agent
  resolves an owner (+ compliance reconcile + reindex + `recordEvent "ai.apply"`).
  Before, the smart read left the doc invisible in quarantine. Live proof: doc
  648 ("unreadable") → identified as a calendar-decline email, owned to Oracle
  Consultancy, filed automatically.
- **enqueueDocExtract fires from EVERY quarantine door** (autoFileDocumentAction +
  shaky attachment reads), not just the inbox Process button.
- Tier-3 sends gated by `canAutoSend`; migration 0106 = reproducible 2-arg
  `claim_next_ai_job` RPC (a fresh deploy would otherwise break the queue).
- **Division of labour:** Gemini = instant everyday AI (site never depends on the
  agent); Opus agent = background re-reads/heavy jobs, catches up whenever the
  dispatcher runs (auto-starts with the Claude app; true 24/7 PC-off needs the
  SETUP_24_7 always-on host).

## Next ideas discussed, NOT built
- More smart-answer intents (contracts expiring with a zero-card, etc.).
- Answer-row actions (Chase/Renew/Add inline on an expiring-doc row).
- Pinned/saved answers on Home.

---
name: ai-integration
description: "The AI reference — Gemini harness, model ladders, key gate, spend cap, and every live AI surface"
metadata:
  node_type: memory
  type: project
---

# AI integration

AI is optional. Every AI path must degrade gracefully when AI is off, unless the
route documents a 503 (only `/api/draft-email` does).

## Provider: Gemini only

- `getActiveProvider()` in `src/lib/settings.ts` is hard-coded to `"gemini"`.
  The Groq provider code still exists in the harness but no text call reaches it.
- **Groq is kept for ONE thing: Whisper speech-to-text** at `/api/transcribe`
  (`whisper-large-v3-turbo`, `GROQ_WHISPER`), keyed by `getGroqOnlyKey()`.
- Gemini is reached through its **OpenAI-compatible** endpoint
  (`https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`,
  `Authorization: Bearer <key>`), so the harness is one OpenAI-compatible
  implementation with two base URLs.

## Models — `src/lib/ai/ai-models.ts`

- **One pair for every lane**: `gemini-3.1-flash-lite` primary →
  `gemini-3.5-flash-lite` fallback. Fast, smart, vision and the ORI chat picker
  (`CHAT_MODELS`) all use it. Both are multimodal, so the same pair reads scans.
- Env-overridable: `GEMINI_FAST_MODELS` / `GEMINI_SMART_MODELS` /
  `GEMINI_VISION_MODELS` (comma list). Per-model daily quotas in `MODEL_QUOTAS`,
  overridable with `AI_MODEL_QUOTAS` (JSON).
- **Tiers, not model names, at call sites.** Callers pass `AI_FAST`, `AI_SMART`
  or `AI_VISION_MODELS[0]`. `tierOf()` maps that to a tier and
  `providerLadder(provider, model)` substitutes the active provider's whole
  ladder. `providerVisionModels(provider)` gives the vision ladder directly.
- ⚠️ **Always pass a tier head, never a raw Gemini id.** A name `tierOf()` does
  not recognise runs as a one-entry ladder with no fallback, so one rate-limited
  model fails the whole call. If you already hold a ladder, pass it as `models:`.
- Never list `gemini-*-latest` aliases (same quota bucket as the pinned model).
  `npx tsx scripts/list-gemini-models.ts` lists what the current key can use —
  run it after a key change before editing the ladders.

## Harness — `src/lib/ai/ai-json.ts`

- `callAIJson()` (strict JSON: strip, parse, `validateShape`) and `callAIText()`.
  Both retry a brief 429/5xx, time out (`DEFAULT_TIMEOUT_MS` 20s), fall through
  the ladder, and record usage to `ai_usage` via `recordUsage()`.
- **Gemini "thinks" by default**, which eats a small answer budget and truncates
  JSON. `providerRequestExtras("gemini")` sends `reasoning_effort: "none"` on
  every call. Direct-fetch callers (the `/api/ask` stream) must use
  `PROVIDER_CHAT_URLS` + `providerRequestExtras` too.
- `LOW_CONFIDENCE` (0.75) is the shared "unsure" threshold for readers.

## The key gate — `getAiKey()`

`getAiKey()` in `src/lib/settings.ts` is the one gate every AI path calls:

1. **Master switch** — Settings → AI & Voice → *AI assistance* → "Enable AI
   features" (`v2.aiEnabled`). Off → `undefined` → rule/manual fallback.
2. **Key** — in-app `geminiApiKey` (rotatable without a redeploy) → env
   `GEMINI_API_KEY`.
3. **Spend cap** — `isOverSpendCap()` (`src/lib/ai/ai-spend.ts`). Only bites when
   `aiMonthlySpendCap` > 0; the default 0 means unlimited, and any error fails
   OPEN. Cached ~60s. Settings → *AI usage* shows today's calls and quota per
   model; `/api/ai-usage` feeds the palette's "AI today".

## Live AI surfaces

| Surface | Where | Notes |
|---|---|---|
| Ask ORI (RAG) | `/api/ask` (+ `src/lib/ai/ask-retrieval.ts`) | ⌘K palette and portal (`/api/portal/ori/ask`). Streams. Page context from `src/lib/ai/page-context.ts`; memory via `/api/ai-memory` + `src/lib/ai/ai-memory.ts`. |
| AI commands | `/api/action` | Parse → confirm → execute; audit rows `createdBy: "ai-command"`; bulk over the current view (`src/lib/nav/current-view.ts`, cap 50). |
| ORI agent | `/api/ori` (`src/lib/ori/agent.ts`, tools in `src/lib/ori/`) | Plans, then runs only what the owner confirms. Portal twin `/api/portal/ori/act`. |
| Task polish | `/api/polish` | `PolishedInput` and the quick-task popover; rule fallback `polishActionItem` (`smart-parse.ts`). |
| Follow-up email | `/api/draft-email` | Task drawer button. 503 when AI is off. |
| Company summary | `/api/company-summary` | Studio company page. |
| Voice | `/api/transcribe` | Groq Whisper; voice dictionary sent as a prompt bias; returns `source` `ai` / `no-key` / `error`, and `VoiceButton` falls back to browser speech. |
| Notes AI | `src/lib/notes/note-ai.ts` via `src/app/notes/ai-actions.ts` | Tidy, Summarise, Find the jobs, Name it, Suggest links, Ask your notes. Every one is a PROPOSAL; nothing writes. |
| Document reader | `src/lib/documents/doc-read.ts` (Files → read details) | Reads and suggests fields only; never files, renames or picks an owner. Shares `file-extract.ts` with the event reader. |
| Event reader | `src/lib/calendar/event-read.ts` / `event-read-core.ts` | Ticket/booking → event form. A time is never accepted without its IANA zone. |
| Announcements | `src/app/announcements/actions.ts` | Draft from a prompt; translate EN ↔ SW. |
| People | `src/app/people/actions.ts` | Extract a person's details from a pasted message. |
| Search translation | `src/lib/search/embeddings.ts` | Translates non-English text to English before embedding (best effort). |

Deterministic, no AI: `/api/brief`, `/api/briefing` (radar), the ORI
automations cron.

## Shared context — `src/lib/ai/ai-context.ts`

`loadContext()` (companies, people, recent tasks), `loadTaskContext(taskId)`,
`findSimilarTasks(query)` (no LLM), `invalidateContext()`.

## Dormant

- `src/lib/ai/model-watch.ts` — the Groq deprecation watch; silent while the
  provider is Gemini.
- `ocrSpaceApiKey` in settings — nothing reads it.

## Prompt rules

- British English.
- Decision-grade and short.
- Never invent task codes, names, dates or decisions. Cite task codes in brackets.
- Keep rule-based fallback contracts stable.
- Intelligence may READ and SUGGEST; anything that writes needs the owner to
  press a button.

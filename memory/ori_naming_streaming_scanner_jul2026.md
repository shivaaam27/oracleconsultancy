---
name: ori-naming-streaming-scanner-jul2026
description: SHIPPED 6 Jul 2026 — Groq→neutral AI rename + ORI streaming-ask ladder fix. Plus open phases to expand (ORI streaming test in prod, scanner real-device, ORI-in-portals). New chat pickup point.
metadata:
  type: project
---

# ORI naming + streaming fix + scanner status (6 Jul 2026)

**PUSHED to master** (this session). Vercel auto-deploys from master. tsc clean,
`ai-models.test` passes. Builds on [[ori_search_and_ai_reliability]] and
[[ai_provider_gemini]] and [[documents_redesign_plan_jul2026]].

## What shipped this session

### 1. Groq → provider-neutral rename (owner was confused seeing "groq")
The everyday **text/vision** AI layer used Groq-branded names even though it runs
on **Gemini** now. Renamed across ~22 src files + tests + 1 script:
- `GROQ_FAST`/`GROQ_SMART`/`GROQ_VISION` (+ `_MODELS`) → `AI_FAST`/`AI_SMART`/`AI_VISION` (+ `_MODELS`)
- `callGroqText`/`callGroqJson` → `callAIText`/`callAIJson`
- `GroqUsage` type → `AiUsage`
- error codes `groq-<status>` → `ai-<status>` (in `ai-errors.ts` regex + all routes)
- removed the redundant `getGroqKey` alias — **use `getAiKey`** (it was already the real fn)

**DELIBERATELY KEPT as genuine Groq (do NOT rename):**
- `GROQ_WHISPER`, `getGroqOnlyKey`, `api.groq.com` — **voice dictation / Whisper still
  runs on Groq**. Groq is NOT fully gone; only everyday text/vision moved to Gemini.
- env-var + DB setting key STRINGS: `GROQ_API_KEY`, `groqApiKey` — renaming these would
  wipe the owner's stored key. `ladder()` in `ai-models.ts` now also reads the legacy
  `GROQ_*_MODELS` env name as a fallback so any Vercel override still applies.

### 2. ORI streaming-ask fix — the real cause of "ORI couldn't complete that"
That message = an `ai-400`/`ai-404` from the **streaming** branch of `/api/ask`
(ORI chat always streams; command-palette posts `stream:true`). Two bugs:
- **Only tried the TWO ladder HEADS** (`providerLadder(...)[0]`), not the full ladder
  like `callAIText` does. So once `gemini-3.5-flash`'s **30/day** quota was spent it
  fell to `gemma-4-31b-it` and had nowhere else to go.
- **Always sent `reasoning_effort:"none"`** — the Gemma models have NO thinking config
  and **reject that field with a 400**. So the fallback head died on every request.

**FIX (in `src/app/api/ask/route.ts`, streaming branch ~line 1136):**
- Build `candidateModels` = full smart ladder + full fast ladder, deduped, cap 6.
- Iterate them; on `429`/`400`/`404` move to the NEXT model (a different quota pool);
  retry the SAME model once only on a `5xx`/dropped connection. 25s per-model timeout.
- `extrasFor(model)` sends `reasoning_effort` ONLY to `gemini-*`, strips it for `gemma-*`.
- Logs the real `model → status + body` on each failure; client gets the true status.
Net: leads with top quality while the 30/day lasts, then rides the 1,500/day Gemma +
500/day flash-lite pool for the rest of the day instead of dying.

## ⚠️ Verification status — NOT proven live yet (IMPORTANT for next chat)
- Can't be tested in local preview: (a) dev server here is pathologically slow (home
  render hit 100s; EU-Supabase latency makes every `buildContext` call drag), (b) the
  admin home self-reloads and cancels in-flight fetches, (c) **preview fundamentally
  can't reproduce the failure** — it only bites when the 30/day top model is exhausted,
  which can't be forced locally. A green preview answer would NOT prove the fix.
- **TEST IN PRODUCTION (Vercel — fast, co-located with Supabase):**
  1. Ask ORI a normal question → confirms happy path + Gemma no longer 400s.
  2. Ask several more AFTER the daily top-model quota is spent → confirms the ladder-walk
     keeps ORI answering.
  3. If it ever fails, the Vercel log now prints the exact `Ask model failed: <model> <status> <body>`.

## PHASES TO EXPAND ON (open work — pick up here)

### A. ORI streaming — confirm + harden
- Confirm the fix live per the production test above; read Vercel logs for the new
  `Ask model failed:` lines if any query errors.
- Consider applying the SAME "walk the whole ladder" pattern anywhere else that still
  does a raw streaming fetch with `[0]` of a ladder (audit for other direct-fetch SSE
  call sites; `/api/ask-doc` already uses `callAIText` non-stream so it's fine).
- Optional: map `ai-rate-limited` / `ai-timeout` style non-numeric codes to friendlier
  copy in `ai-errors.ts` (today they fall through to the raw string on the default branch).

### B. Document scanner (iOS-Files-style) — Phase 5 = REAL-DEVICE testing
Full build already SHIPPED (see [[documents_redesign_plan_jul2026]]): `scan-capture.tsx`
`ScanButton` in Smart Add → photo/Live-view → AI corner-detect + homography warp
(`scan-crop-actions.ts` + `perspective-warp.ts`) → multi-page **PDF** via `pdf-lib` on
"Save as PDF". Owner said "still doesn't work as intended" — the OUTSTANDING item is
**Phase 5: real-device testing** (this dev box has no camera). Likely suspects to check
on a real phone: auto-crop confidence on angled/skewed shots (warp math), Live-view
mount on iOS Safari, EXIF orientation on the "Take a photo" path. Get a concrete repro
("what exactly doesn't work") from the owner before changing code.

### C. ORI in the portals (Phase 4 — NOT built) — from [[ori_handoff_jul2026]]
ORI agent loop / ask is admin-only. Phase 4 = bring a safe, scoped ORI into the staff +
director portals (respecting `portal-permissions`/scope helpers — never expose other
people's data). See [[ori_brain_master_plan]] + [[ori_handoff_jul2026]] for the north star
(Sense/Think/Act/Learn) and per-phase expansion ideas.

## Files touched this session (all pushed)
`src/lib/ai-models.ts` (+legacy env in `ladder()`), `src/lib/ai-json.ts`,
`src/lib/ai-errors.ts`, `src/lib/settings.ts` (removed getGroqKey alias),
`src/app/api/ask/route.ts` (streaming loop rewrite), + rename-only edits across
action/ask-doc/company-summary/draft-email/polish routes, documents/meeting/people/voice
actions, announcements, embeddings, model-watch, ori/agent, system-health, google,
company-summary.tsx, draft-email-button.tsx, ai-models.test.ts, scripts/list-gemini-models.ts.

# Intelligence Layer — Phased Build Plan (June 2026)

Companion to `intelligence_layer_audit.md` (exact file:line work-lists live there).
Owner is non-technical; plain language. Build order: 0 → 1 → 2 → 3, each pushed to master.

## Phase 0 — Foundations (see what's happening)
Central AI call path + per-feature logging to `system_events` (only document extraction logs
today); an "AI health" view; a golden set of ~20 docs + ~20 questions to measure changes;
pull scattered prompts into `src/lib/prompts.ts`. *Folded lightly into Phase 1 (shared helpers
+ logging) rather than done as a separate push.*

## Phase 1 — Reliability quick wins  ✅ (this sprint)
Add retry + timeout to EVERY Groq call (10 lack retry, all 14 lack timeout). Reuse
`callGroqJson`; add `callGroqText` sibling. Fix the Ask COS mid-stream silent truncation
(#1 worst gap). Keep every existing fallback. No schema/DB changes.

## Phase 2 — Model quality  ✅ (this sprint)
Move document extraction + meeting minutes to `GROQ_SMART` (model already wired). Add
`src/lib/ai-verify.ts` name/figure post-check on the prose tools (surface a banner, never
block). Optional `v2.aiQuality` toggle.

## Phase 3 — Ask COS real retrieval
- **3a (this sprint, no new deps):** export `concept`, synonym-expand tokens, lift the
  overlap ranker into Ask COS, rank tasks+meetings before slicing, surface honest counts.
- **3b (PAUSE — owner decision):** semantic search / embeddings. Groq has NO embeddings API,
  so this needs a NEW vendor (data egress + cost decision). Stop here and present options.

## Phase 4 — Document/extraction hardening
HEIC support (convert), raise 8-page scan cap, hybrid compliance matching (AI when synonym
rules score 0), tighter compilation split. (Audit §9.)

## Phase 5 — Voice learning loop + multilingual
Real feedback loop for the voice dictionary; fix `basicClean` English-only fallback; measure
Swahili/Hindi/Gujarati quality. (Audit §9.)

## Phase 6 — Governance, privacy & cost
Decide per-feature what PII may leave (trim the 150-name injection; redact passport numbers);
monthly spend ceiling; add undo token to the AI `bulk` command. (Audit §7.)

## Phase 7 — Stretch
Proactive morning briefing; tighter meeting→task→follow-up; optional multi-step assistant.

## Build status
- Audit: DONE (wf_334c50a7-b97), saved to `intelligence_layer_audit.md`.
- Phase 1: DONE + pushed (commit 816879b) — retry + timeout on every Groq call;
  Ask COS mid-stream truncation fixed.
- Phase 2: DONE + pushed (commit 5bd4992) — `aiHighQuality` setting + Settings
  toggle; doc text-extraction + meeting minutes on GROQ_SMART; `ai-verify.ts`
  name/figure check wired into the meeting prose tools.
- Phase 3a: DONE + pushed — `concept` exported; Ask COS now synonym-expands its
  search tokens, ranks tasks + meetings by relevance before slicing, sends compact
  JSON, and shows an honest "based on N tasks · M meetings" count.
- **Phase 3b (semantic search / embeddings): BUILT (in-region pgvector) + pushed,
  INERT until owner does a one-time setup.** Owner chose in-region (data stays in
  Supabase region). Mechanism (research-verified, see wf agent): Supabase Edge
  Function running built-in `gte-small` (384-dim) → pgvector. Ruled out in-process
  Transformers.js on Vercel (onnxruntime ~720MB > 250MB function limit). Shipped:
  migration `0076_semantic_search.sql` (raw SQL — extension + `embeddings` table +
  HNSW + `upsert_embedding`/`match_embeddings` RPCs; accessed via supabase-js, NOT
  Drizzle, to dodge the drizzle-kit HNSW operator-class bug); `src/lib/embeddings.ts`
  (best-effort, gated by `v2.semanticSearch` setting, default OFF); `supabase/
  functions/embed/index.ts` (Deno Edge Function, excluded from tsc); Settings toggle;
  Ask COS integration (semantic hits augment + boost the keyword/synonym ranker,
  fall back to keyword when off/empty); fire-and-forget index hooks on task-create
  (`db-helpers.insertTaskWithUniqueCodeSb`) + meeting-save; `scripts/backfill-
  embeddings.ts` (`npm run db:embed-backfill`); `SEMANTIC_SEARCH.md` owner guide.
  **Owner's 4 one-time steps (in SEMANTIC_SEARCH.md): db:migrate → deploy embed
  function (Supabase CLI) → db:embed-backfill → flip the Settings toggle on.** Until
  then everything degrades to the Phase-3a keyword ranker. Caveat: gte-small is
  English-strong, weak on Swahili/Hindi/Gujarati (keyword covers those). Documents
  not yet wired into semantic (only task+meeting); easy follow-up.

## Not yet done (future phases, from the audit)
- Phase 4: HEIC support, raise 8-page scan cap, hybrid (AI) compliance matching.
- Phase 5: voice dictionary feedback loop; Swahili `basicClean` fix.
- Phase 6: PII egress trim (150-name injection), monthly spend ceiling, undo token
  on the AI `bulk` command, separate "key missing" vs "AI off".
- Also outstanding from the audit: wire `recordEvent` into the other 8 AI surfaces
  (observability), central `src/lib/prompts.ts`, model-aware extraction cache key,
  GROQ_VISION deprecation watch.

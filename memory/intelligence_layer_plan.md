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
- Phase 1: in progress this sprint → push.
- Phase 2: this sprint → push.
- Phase 3a: this sprint → push. Phase 3b: paused for owner vendor decision.

# Intelligence Upgrade — parked roadmap (pick-up point)

Named by the owner ("intelligenceupgrade") on 2026-06-15. Two parts:
- **Part A — Advanced Semantic Search** (the next priority; owner asked for a "full
  on upgrade", plan laid out below, NOT yet built).
- **Part B — Remaining intelligence-layer phases** (4/5/6 + deferred audit items).

Context already shipped (see `intelligence_layer_audit.md` + `intelligence_layer_plan.md`):
Phase 1 reliability, Phase 2 model quality + prose-verify, Phase 3a Ask COS ranker,
**Phase 3b semantic search LIVE** (Supabase Edge `embed` = gte-small 384-dim, pgvector,
HNSW, `match_embeddings`/`upsert_embedding` RPCs, migration 0076; indexes tasks+meetings;
toggle `v2.semanticSearch` ON; backfilled 45 tasks + 2 meetings; verified working).

---

## Part A — Advanced Semantic Search (research-verified, wf agent a045b270)

### The blocker that shapes the plan (owner should know)
- **No multilingual embedding model runs in-region on this stack today — confirmed.**
  `Supabase.ai.Session` supports ONLY `gte-small` (English-only, 384-dim, 512-token).
  Custom ONNX inside a hosted Edge Function is capped ~384-dim and fragile (community
  reverted to gte-small). Vercel's 250MB limit rules out in-process models.
- So Swahili/Hindi/Gujarati semantic search is effectively broken today (gte-small
  doesn't understand them). Two in-region fixes: **(B) Groq translate→English→embed**
  (no infra, ship now) and **(A) a tiny dedicated EU CPU container running
  `multilingual-e5-small`** (384-dim, ~£3-7/mo, the durable fix). No free zero-infra
  fully-in-region multilingual option exists.
- **Any model switch = one-time full re-embed** (can't mix two models' vectors in one
  column), even gte-small→e5-small (both 384). Budget a backfill into whichever phase
  changes the model.
- Keep the column at **384 dims** throughout (gte-small and e5-small both 384) so the
  pgvector column + HNSW index never change.

### Phases (each gated by the S0 eval so we can prove it helps)

**S0 — Evaluation harness (do FIRST; gates everything).**
Hand-author a golden set of 30-50 real queries → expected item(s) (task code / meeting /
doc), **including Swahili/Hindi/Gujarati queries** as the multilingual regression guard.
Script computes Recall@k (target ~0.8 @ k≈10-20) + MRR, run as a Vitest alongside
`src/lib/*.test.ts`. A phase only ships if these don't regress. Low effort.

**S1 — Coverage: index everything relevant.** Today only tasks + meetings.
Add **documents** (title + notes + extracted text), **people/contacts** (name + role +
profile), and optionally **facts/company profile**. One `embeddings` row per item
(parent_type/parent_id). Extends the existing pipeline + backfill. The owner explicitly
wants full coverage. Wire document/person hits into Ask COS context. Low-medium effort.

**S2 — Hybrid search (full-text + vector via RRF). HIGHEST ROI, no infra.**
Add a Postgres `tsvector` (use the **`simple`** config — no stemming — so Swahili/Hindi/
Gujarati + task codes like `DS-001` match literally) and an official Supabase
`hybrid_search` RPC fusing full-text + vector with Reciprocal Rank Fusion
(`1/(rrf_k+rank)`, k≈50, weighted sum). Fixes a lot of the multilingual gap on its own
(exact-term matching) and lifts precision (~62%→~84% in one benchmark). Replace the
current "boost semantic hits" merge with RRF. Medium effort.

**S3 — Chunking long minutes/documents.** Today whole-item text is truncated to ~512
tokens (drops most of a long minutes). Split into 400-512 token chunks, ~15% overlap
(sentence/recursive splitting — skip expensive "semantic chunking" at this scale). One
`embeddings` row per chunk + `parent_id`/`chunk_index`; retrieve at chunk level, roll up
to the parent for display (best chunk score per parent). Medium effort.

**S4 — Multilingual interim: Groq translate→embed (no infra). Makes non-English work NOW.**
On index + query, if text/query is non-English, Groq translates to English (the strong
direction for Llama-3.1: Swahili/Hindi→English), then embed with gte-small. Optionally
fold in **HyDE** here (Groq drafts a short hypothetical English answer, embed THAT — also
a multilingual bridge). Costs one extra Groq call per item/query; translation errors can
compound (hybrid FTS half cushions exact terms). Low-medium effort. Ship before S5.

**S5 — Durable multilingual: dedicated EU container (`multilingual-e5-small`, 384-dim).**
Stand up a tiny always-on EU box (Fly.io/Railway/Hetzner, ~1 shared vCPU/512MB-1GB,
~£3-7/mo) exposing `/embed`; point the app + a cron at it. Replaces the Groq translate
hop with a proper multilingual model; schema unchanged (still 384). **One-time full
re-embed** on cutover. **OWNER DECISION: accepts a small monthly cost + a box to run.**
Medium-high effort (infra).

**S6 — Freshness hardening.** Today: fire-and-forget hooks on task-create + meeting-save
only (create-only, may miss on serverless freeze). Add: re-embed on UPDATE when content
changes (content_hash already in place), a small **backfill/repair Vercel cron** that
embeds rows with NULL/stale vectors (catches missed hooks), and **`ON DELETE CASCADE`**
(or a delete hook) so deleted items drop their vectors. Don't build the heavy Supabase
pgmq→pg_cron→pg_net "Automatic Embeddings" pipeline — overkill for one operator. Medium.

**Deferred / experiment-only (only if S0 eval shows a need):**
- Re-ranking — skip at this scale (payoff needs >5k docs). If ever needed, a **Groq
  LLM-reranker** (beats cross-encoders in recent tests; cross-encoder can't run in-region).
- Multi-query expansion (Groq rewrites into 2-3 variants, union hits).
- Bigger model (768/1024-dim) — only possible via the S5 container; language is the real
  quality loss, not dimension, so low value. Forces a column-width change + re-embed.

### Suggested order
S0 → S1 → S2 (biggest wins early, no infra) → S3 → S4 (non-English works) → then decide
on S5 (the cost/infra fork) → S6. Re-evaluate against the golden set after each.

---

## Part B — Remaining intelligence-layer phases (from the audit, parked)

**Phase 4 — Document/extraction hardening.** iPhone **HEIC** support (auto-convert;
`@napi-rs/canvas` already a dep), raise the **8-page scan cap** (pages 9+ silently
dropped today), **hybrid compliance matching** (fall back to AI when the synonym rules
score 0 — closes the "odd label doesn't auto-tick" gap), tighter compilation split.

**Phase 5 — Voice learning loop + multilingual.** Turn the voice dictionary into a real
**feedback loop** (capture post-dictation corrections automatically vs typing them in);
fix `basicClean` (`voice/actions.ts`) which strips English fillers only + force-capitalises
(wrong for Devanagari/Gujarati); measure/improve Swahili/Hindi/Gujarati transcription+polish.

**Phase 6 — Governance, privacy & cost.** Trim PII sent to Groq (the up-to-150 staff-name
injection in every doc-extraction prompt → owner only; consider redacting passport/NIDA
numbers); **monthly spend ceiling** (no cost cap exists today); **undo token** on the AI
`bulk` command (`api/action/route.ts` — meeting bulk-create has one, AI bulk doesn't);
separate "key missing" from "AI switched off" (both surface as `no-key` today, confusing).

**Deferred audit items (any time):**
- **Observability:** wire `recordEvent` (system_events) into the other 8 AI surfaces —
  only document extraction logs today, so the AI-health panel is blind to "Ask COS erroring
  for 2 days". (This is the original Phase-0 observability gap.)
- **Central `src/lib/prompts.ts`** — the "Chief of Staff" persona + anti-invent clause are
  duplicated/drifting across ≥6 prompts; domain enums duplicated as prompt text AND JS arrays.
- **Model-aware extraction cache key** — `extraction_cache` ignores the model on read, so a
  future vision-model swap keeps serving the old model's reads.
- **GROQ_VISION deprecation watch** — `llama-4-scout` is at risk (sibling maverick deprecated
  Feb 2026; no announced vision successor). If it retires, document scanning breaks with no
  one-line fix. Monitor Groq's model list.

## Status
- **Part A S0-S4: BUILT + LIVE (migration 0077).** S0 eval harness (`scripts/eval-search.ts`
  + `eval/search-golden.json`, `npm run eval:search` → Recall@k/MRR; baseline 100%@10, MRR
  0.90 on a 5-case seed — OWNER should expand the golden set). S1 coverage: now indexes
  tasks+meetings+**documents+people** (backfilled 45/2/325/31); document/person create hooks
  added. S2 hybrid search: `hybrid_search` RPC (Postgres FTS `simple` config + vector, RRF);
  Ask COS uses it. S3 chunking: `chunkText` (~1800 chars, 250 overlap) + `replace_embeddings`
  RPC, one row per chunk, rolled up to parent. S4 multilingual interim: `maybeTranslate`
  (Groq translate→English for Devanagari/Gujarati + Swahili-heuristic) before embedding;
  original text kept for FTS. `embeddings.ts` rewritten; `indexEmbedding` now chunk-aware;
  `hybridSearch`/`semanticSearch` exported. tsc clean, 42 tests pass, eval green.
- **Part A S6: BUILT + LIVE.** `src/lib/embeddings-reindex.ts` `reindexAll()` re-indexes
  all active rows (content_hash skip) + removes orphan/archived vectors; nightly cron
  `/api/cron/reindex` (vercel.json 05:00, authoriseCron, no-op when toggle off); immediate
  delete hooks on `deleteMeeting` + `setDocumentArchived`; backfill refactored to call
  `reindexAll(true)` (DRY). Covers edits (re-embed on change), deletes/archives (orphan
  sweep), and missed fire-and-forget hooks. Golden set expanded to 22 real cases (incl. 2
  Swahili) → Recall@10 95%, MRR 0.92.
- **Part A S5 (durable multilingual EU container, multilingual-e5-small ~£3-7/mo): NOT
  built — owner's cost decision.** That's the only remaining advanced-search phase.
- Part B (Phases 4/5/6 + deferred): PLANNED, parked.

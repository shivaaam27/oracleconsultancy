# ORI as the brain — universal search/find/trace (Jun 2026)

Owner's goal: ORI search becomes the brain of the system — "from one place to another,
from major to the minor detail can be searched, found and even traced. Everything from
ORI search." Triggered by ORI answering "owner of Dar Spices" with "not in CONTEXT" —
because the Ask context was blind to governance/ownership.

Built in one session via 6 parallel agents (file-isolated, pinned shared contracts),
then integrated + verified by the orchestrator. **tsc clean · 88/88 tests (was 74).**
Owner decisions: phased build, Ctrl+Space + keep ⌘K, history "current by default / one
tap away", and (final) backup + apply migration 0094 + backfill now.

## The 3 systems that were drifting (now share one brain)
1. ORI Ask (`/api/ask/route.ts`) — the conversation/RAG.
2. Deep search (`/api/search` → `lib/search.ts` → cmdk `components/command-palette.tsx`).
3. Semantic index (`lib/embeddings.ts` + `embeddings-reindex.ts`, gte-small/pgvector/hybrid_search).

## What shipped
**Phase 1 — coverage + conversation**
- NEW `src/lib/synonyms.ts` (+ `.test.ts`, 14 tests): `SYNONYM_GROUPS`, `expandTokens(Set)`,
  `expandQuery(q)`. 16 conversational groups (owner↔shareholder↔director↔signatory,
  supplier↔vendor, rent↔lease, pay↔salary, permit↔licence, …). Shared by search + ask.
  Standalone (no DB, doesn't import requirement-match's `concept`).
- `/api/ask` now pulls **governance** (cap_table shareholders, beneficial_owners,
  signatories, key_persons, company `facts` current-per-field, resolutions) **+ letters,
  vendors, assets, leave, pipeline, commitments**. New intent flags `wantsGovernance`/
  `wantsLeave`/etc. Uses expandQuery/expandTokens. System prompt has an ownership clause.
  Provenance: `X-Source-Summary` header (stream) + `sourceSummary` json (e.g.
  "8 tasks · 2 documents · 1 governance record"). Old taskCount/meetingCount kept.
- **Ctrl+Space** global hotkey to open ORI (alongside ⌘K/Ctrl+K), in command-palette.tsx
  keydown: `e.ctrlKey && (e.code==='Space'||e.key===' ')`. Portal guard respected.

**Phase 2 — total + continuous + history-aware indexing**
- `lib/search.ts` `unifiedSearch(query, perTypeLimit, includeHistory=false)`; route reads
  `?history=1`. New `SearchResultType` members: **governance | risk | pipeline | commitment**
  (existing person/company/document/letter/meeting/vendor/asset). `SearchResult.lifecycle:
  "active"|"history"`. History (archived/closed/inactive/expired) is KEPT + labelled with a
  status badge + ranked below live (penalty), never dropped. Command palette has an
  "Include history" Switch (default off); history rows dimmed.
- `lib/embeddings.ts` SourceType extended to all 12 types; `SemanticHit.lifecycle`;
  `hybridSearch(opts.lifecycle "active"|"history"|"all", default "active")`;
  `indexEmbedding(..., lifecycle="active")` 5th optional arg. Best-effort → [] on RPC
  mismatch (so prod degrades, never breaks).
- `embeddings-reindex.ts` `activeRows()`→`allRows()`: indexes ALL 12 entity types, current +
  historical, each stamped active/history. `removeOrphans` now deletes ONLY true orphans
  (source row gone), not archived rows. Governance id scheme: single "governance" SourceType
  over 4 tables via composite ids (GOV_BASE capTable 1e6 / beneficialOwner 2e6 / signatory
  3e6 / keyPerson 4e6 + row.id).
- **Migration `drizzle/0094_embeddings_lifecycle.sql`** (raw SQL; embeddings is supabase-js/RPC,
  not Drizzle — schema.ts untouched): adds `embeddings.lifecycle text not null default 'active'`
  + index; updates `replace_embeddings` (p_lifecycle default 'active') and `hybrid_search`
  (drops old 7-arg, new 8-arg with `filter_lifecycle` default 'active', RETURNS extra
  `lifecycle` col). filter_lifecycle inserted positionally after filter_types — safe because
  the only caller uses NAMED args.

**Phase 3 — trace**
- NEW `src/app/api/trace/route.ts` `?type=&id=` → `{type,id,label,events:[{at,kind,title,detail?,by?}]}`
  newest-first, ≤200, best-effort. Sources: task→task_updates+audit_log; person→person_events+
  leave_requests+asset_assignments; company→facts ledger+resolutions+audit_log; document→
  intake state+renewal chain (supersedes_id both ways)+document_links+automation_events;
  generic fallback (letter/vendor/asset/pipeline/commitment/risk/decision/meeting)→row
  state+automation_events. `actorOf()` decodes created_by tokens.
- NEW `src/components/trace-panel.tsx` `TracePanel()` (no props): self-mounting, listens for
  window CustomEvent `cos:trace` {type,id,title?}, opens an Aurora BottomSheet timeline grouped
  by day. Mounted once in command-palette provider. "Trace history" button (GitBranch) on
  deep-index result rows (NOT governance — trace doesn't map it). Dispatch:
  `window.dispatchEvent(new CustomEvent("cos:trace",{detail:{type,id,title}}))`.

## DB state
- Backup before migrate: `backups/2026-06-20T11-20-52Z` (89 tables, 3834 rows).
- Migration 0094 APPLIED to live DB ("Migrations applied"; NOTICEs only).
- Backfill (`npm run db:embed-backfill` = reindexAll force=true) run to re-stamp lifecycle +
  index the 8 newly-covered entity types. [STATUS: in progress at time of writing — confirm.]

## Self-sustaining build — wave log (Jun 2026, multi-agent workflows)
Sequenced 7-wave plan to make ORI the self-sustaining brain. Each wave = a Workflow (foundation→parallel wiring→adversarial review), then orchestrator runs tsc(4GB)+tests, backs up before any migration, never pushes.
- **Wave 1 DONE (run wf_78def4e4-0cb, 8 agents):** NEW `src/lib/entity-registry.ts` = single source of truth (EntityDef per 12 types: table/idColumn/selectColumns/textFor/lifecycleFor; governance composite-id helper GOV_BASE). NEW `src/lib/index-hooks.ts` `reindexEntity(type,id)`/`removeEntityIndex(type,id)` (registry-driven, best-effort). `embeddings-reindex.ts` allRows() now DERIVES from ENTITY_DEFS (future entity auto-indexes nightly). **Continuous indexing**: per-write hooks added across ~20 write paths (task/person updates, documents archive→history not delete, meetings, notes, companies, letters, assets, vendors, governance/risk/pipeline/commitment, ORI ai-command mutations, portal task actions, meeting bulk-create, undo handlers, automation undo). NEW `src/lib/coverage-audit.ts` `auditCoverage()` + folded into `system-health.ts` (flags entities under-indexed; INERT when semanticSearch off). Review fixed 1 false-alarm (coverage cried wolf when semantic off) + 9 missed write paths. Orchestrator fixed 3 `as unknown as EntityRow` casts. tsc clean (src), 88 tests. Convention now: on create/update/archive call reindexEntity; only hard-delete calls removeEntityIndex.

- **Wave 2 DONE (run wf_94065179-6b0, 5 agents):** read surfaces now derive from the registry. `entity-registry.ts` extended with per-type `search` (select/currentFilter/order/limit/ilikeColumns/toResult) + `searchCustom` (governance fan-out) + `trace` (bespoke|generic) + `uiLabel`/`searchOrder`. `search.ts` `unifiedSearch` rewritten to LOOP `SEARCHABLE_DEFS` (was 11 hand-written blocks) — scorer/within/tokenize stay in search.ts as the ranking source of truth. NEW `src/components/entity-ui.tsx` `ENTITY_UI` (icon/tint per type, exhaustive over union → new type forces a TS error) + `buildPaletteTypeMeta()`. `command-palette.tsx` TYPE_META/TYPE_ORDER now registry-derived. `trace/route.ts` generic fallback uses `getTraceDef`. Result: adding ONE EntityDef makes a new entity searchable+traceable+visible everywhere. Review confirmed field-for-field equivalence; tsc clean, 88 tests.

- **Wave 3 DONE (run wf_0a2eb328-cdc, 4 agents):** RAG depth. (A) Passage citations — ask route now attaches the matched chunk passage per top doc/meeting (cap 6/4 × 400 chars) + prompt quotes "per <Doc>". (B) Graph traversal — relational questions pull getCompanyRelationships/getPersonRelationships/getEntityGraph into a `graph` context block + prompt reasons multi-hop. (C) ORI memory — NEW `ai_memory` table (migration **0095 APPLIED**, backup 2026-06-20T13-10-53Z) + `src/lib/ai-memory.ts` (recordQA/rememberPreference/recallMemories, AI-free recall); ask route recalls memories+preferences into context and auto-records QA on non-stream; action route has a deterministic "remember/forget/what do you remember" intent (works AI-off); NEW `/api/ai-memory` route (POST records, GET lists) so the streaming client can persist answers (client wiring = follow-up). All additive/try-caught, capped; tsc clean, 88 tests.

- **Wave 4 DONE (run wf_6265856b-799, 3 agents):** document reading depth. (1) Page caps raised + env-overridable: MAX_VISION_PAGES 8→20 (DOC_MAX_VISION_PAGES), MAX_OCR_PAGES 20→40 (DOC_MAX_OCR_PAGES), clamped 1–200. (2) Two-pass confidence re-read in documents/actions.ts: if first extraction confidence < LOW_CONFIDENCE(0.75) and AI on, ONE automatic retry with the stronger path (text→GROQ_SMART forced; vision→next ladder model), keeps higher-confidence result, caches under actual model, logs first→second to system_events; no-op when AI off / already confident / cache hit. (3) NEW `src/lib/fact-checks.ts` `detectFactDiscrepancy` (field-aware: identifiers verbatim, percentages→fraction, lists→set; formatting-insensitive) + `fact-checks.test.ts` (15 tests) wired into recordFact best-effort → logs 'fact-discrepancy' system_event + flags doc needs_review on real disagreement, never blocks the append. Orchestrator widened the helper's value params to `FactValue|null` (tsc). tsc clean, 103 tests.

- **Wave 5 DONE (run wf_bb2a79f6-bcc, 4 agents):** intake depth. (1) Richer correlation — NEW `src/lib/doc-correlation.ts` (testable pure helpers) + documents/actions.ts: correlate owner on phone/email/domain/bank-account/address (not just 6+digit IDs), initials-aware person resolution ("S. J. Manek" ~ "Samir Jayantilal Manek", conservative threshold), quarantine still last resort, AI-free. (2) Proactive gap-chasing — NEW `src/lib/automation-gaps.ts` runGapChasing() (company statutory holes/person missing mandatory docs/expired-no-renewal → chase tasks; respects getAutomationMode default-suggest, baseline guard, dedup via automation_events, capped 10/run, undoable) wired into morning-run. (3) Intake accuracy dashboard — NEW `src/lib/intake-metrics.ts` computeIntakeMetrics(30d) + NEW `src/components/intake-accuracy.tsx` Aurora card on /inbox (auto-filed % / needed-you / corrections learned / discrepancies + trend). Review FIXED 2 real safety bugs: emergency_contact_phone used as owner signal (mis-merge → removed, require unique owner) + unescaped ILIKE wildcards on emails/identifiers (applied escapeLike). tsc clean, 119 tests.

- **Wave 6 DONE (run wf_5c01ab93-749, 6 agents):** autonomy & ops (review PASS on 7 safety invariants). NEW `src/lib/guardrails.ts` (canAutoSend(channel) — Tier-3 gate honouring automation.paused/director.outreachPaused/per-channel setting, preserves today's email behaviour; AUTO_HARD_DELETE_FORBIDDEN). NEW `src/lib/ai-spend.ts` + `ai_usage` table (migration **0096 APPLIED**, backup 2026-06-20T14-04-20Z): recordUsage (fire-and-forget in ai-json.ts), monthlySpend, isOverSpendCap (cached 60s, FAILS OPEN). settings: aiMonthlySpendCap (default 0=UNLIMITED), autoSendEmail/Whatsapp/Sms, autoHardDeleteForbidden; getGroqKey() returns undefined only when a cap is SET and exceeded. Every automated external send now routes through canAutoSend; automated hard-deletes → archive (user-initiated untouched). automation-reactions.ts: cross-process cascade chains (e.g. probation-review-done→tick onboarding) with recursion guard (MAX_CASCADE_DEPTH) + dedup + auto/suggest + undo. system-health.ts: SELF-REPAIR (re-run a failed/stale job once before alerting, logged) + calm GREEN "all N jobs healthy" status. automation-time.ts: new phase auto-spawns tasks for DUE recurring Tax&Legal obligations (default-suggest, baseline-guarded, deduped per obligation-period). tsc clean, 119 tests.

- **Wave 7 DONE (run wf_46b1ae3e-eab, 6 agents) — FINAL WAVE:** notifications + AI resilience. Settings: `groqApiKey` (in-app key, masked UI, getGroqKey precedence = in-app→env→aiEnabled+cap, so owner rotates without redeploy), `quietHoursStart/End` (default OFF), `notifyDigest` (default off). ai-models.ts: GROQ_FAST_MODELS/GROQ_SMART_MODELS env ladders (FAST/SMART = first entry); ai-json.ts text calls now fall through a 4xx/decommissioned to the next ladder model (self-heals) + a minimal AIProvider scaffold (Groq only, inert extension point). model-watch.ts `checkGroqKeyHealth()` → System status card "AI key: valid/expired→Settings". push.ts: isCritical(kind) + quiet-hours holds non-critical device buzz (in-app row still written) + digest batching; NEW `flushRoutineDigests` (in push.ts) wired into morning-run step 1e (review FIXED P1: flush was only in the UNSCHEDULED cron/notify → digests would queue forever). NEW `/api/notifications/act` + sw.js (cos-v8) actionable push buttons (open/done/snooze, offline-safe, no Tier-3). +7 ai-models tests. tsc clean, 126 tests.

## ALL 7 WAVES COMPLETE (Jun 2026). Verified each: tsc clean (src) + tests (42→126). Migrations 0094/0095/0096 APPLIED (backups taken). **NOT pushed/deployed.** 77 files changed. New libs: entity-registry, index-hooks, coverage-audit, synonyms, ai-memory, fact-checks, doc-correlation, automation-gaps, intake-metrics, guardrails, ai-spend, system-repair, entity-ui. New routes: /api/trace, /api/ai-memory, /api/notifications/act. New migrations: 0094 embeddings.lifecycle, 0095 ai_memory, 0096 ai_usage.

## POST-BUILD HOTFIX (browser crash) — Jun 2026
Wave 2 introduced a client/server boundary violation: `components/entity-ui.tsx` (client, used by command-palette in the ROOT layout) value-imported `SEARCH_PALETTE_ORDER` from `lib/entity-registry.ts`, which imports the server-only `sb` (@/db/supabase). That dragged the server Supabase client into the BROWSER bundle → fatal "SUPABASE_SERVICE_ROLE_KEY is not set" at module-eval → global-error on EVERY page. tsc + unit tests did NOT catch it (it's a runtime bundling boundary, not a type/logic error); slipped through because the live preview wasn't reloaded after Wave 2. FIX: new client-safe `src/lib/entity-meta.ts` (EntityType + ENTITY_LABELS_ORDER + SEARCH_PALETTE_ORDER, type-only SourceType import so no runtime pull); entity-ui imports from entity-meta; entity-registry re-exports SEARCH_PALETTE_ORDER from entity-meta (single source). Verified: home + settings render fully, Groq field shows. **LESSON: after a refactor that moves imports, ALWAYS load the live preview — `import type` is erased (safe in client), but a VALUE import of any module that transitively imports @/db/supabase crashes the client bundle.** Owner must hard-refresh (Ctrl+Shift+R) to drop the stale crashed chunk.

## Owner actions still needed (NOT code)
- **Set a fresh Groq key** — now doable IN-APP (Settings → masked Groq key field) without redeploy; OR set GROQ_API_KEY in Vercel for prod. Local key was expired (groq-http-error). Prod independent of local key.
- **Deploy decision** — everything is on the working tree, unpushed. After push, the nightly reindex cron keeps the index fresh with the new code.
- **Optional cost decisions (parked):** S5 multilingual EU container (~£3-7/mo, native Swahili/Hindi/Gujarati embeddings); a paid 2nd AI provider (scaffold ready); a real AI spend rate in MODEL_RATES + a cap if they ever go paid.

## NOT done / follow-ups
- **NOT pushed/deployed.** Keyword search/ask coverage works locally now; semantic coverage of
  new types needs deploy (nightly `/api/cron/reindex` runs the new reindexAll once deployed).
- Prod GROQ_API_KEY in Vercel may still be the expired one (see intelligenceupgrade.md DR2 note)
  — affects prod ai/translate, not the local backfill.
- Per-write index hooks for the new entity types (letters/vendors/assets/governance/facts/
  pipeline/commitments) were DEFERRED — freshness relies on nightly reindexAll + existing hooks.
  Add create/update hooks if same-second semantic freshness is wanted.
- Governance has no Trace mapping yet; risk href is `/` (no board page). ORI Ask is
  current-by-default (semantic lifecycle "active"); wire a history toggle into Ask if wanted.
- Owner can expand the search golden set + re-run `npm run eval:search`.

---
name: ori_cost_premium_waves_jul2026
description: "3 waves (7 Jul) — cut Supabase egress + Gemini spend + premium features (watchers/macros/digest). tsc clean, 215 tests, NOT pushed."
metadata:
  type: project
---

# ORI cost-cutting + premium waves (7 Jul 2026)

Owner: cut cost + egress (Supabase 312% over, grace ends 3 Aug) while adding "best of the best" features.
Built as 3 sequenced verified workflows. **ALL tsc clean, 215/215 tests, safety-audited. NOT pushed.**
No DB migrations (reused automation_rules[kind text+config json], ai_memory[kind], system_events, settings).
Egress reality: 312% spike was a 5-7 Jul bulk re-read of a tiny 136MB corpus during indexing/testing — Storage ~65% / PostgREST ~35%.

## Wave 1 — stop the bleeding
- **A1 read-once guard** (`documents/actions.ts` selfHealDocuments): skip Storage download when `text_source`∈{typed,ocr}
  within a 30-day cooldown, unless forced. NOTE: selfHeal is currently COMMENTED OUT in morning-run, so this is
  protective-for-when-re-enabled — the live leak was elsewhere (see A3-registry below).
- **A2 incremental reindex** (`/api/cron/reindex`): watermark via `lastSuccessfulEvent("cron.reindex")` +
  `anyChangesSince` probe over 10 busy tables → skip the full 12-table sweep when nothing changed. Fails open. `?full=1` forces.
- **A3 column diet**: `queries.ts buildAllTasks` dropped `body` from the batched task_updates select (was shipping EVERY
  historical update body on the heaviest all-day read; latest body now sourced from `tasks.latest_update`). embeddings.ts/
  search.ts/smart-answer.ts already column-scoped (no select("*"), never pulls the vector). ⚠️ DEPENDS on `tasks.latest_update`
  staying in sync (it is — every update write sets it).
- **#1 slim tool catalogue** (`ori/tools.ts selectRelevantTools` + agent.ts): planner injected ALL tools' catalogue every
  Gemini call (biggest hidden per-call cost). Now keyword-filters to ~≤25 relevant + a CORE spine; **FAIL-SAFE** = full list
  when <2 query tokens or <3 tools score (ORI never loses a tool). Plan still validated against TOOL_BY_NAME.
- **#2 AI answer cache** (NEW `ai-cache.ts`): in-memory 5-min TTL, 200-entry LRU, key = sha1(scope+mode+question+sorted
  sourceIds). Wraps the RAG/LLM answer in `/api/ask` (leading question only; follow-ups recompute). Scope in key = no
  cross-user bleed. Fail-open. Optionally memoises `/api/ori` plan.

## Wave 2 — sharper results + AI resilience + THE registry egress fix
- **⭐ Registry doc-blob egress fix** (`entity-registry.ts`): the document EntityDef pulled the heavy `extracted_text` blob on
  EVERY keyword search + reindex row = the likely LIVE leak. Added `indexSelectColumns` (heavy, embed-only); document
  `selectColumns`/`search.select` now LIGHT (no blob). `embeddings-reindex.ts allRows` + `index-hooks.ts reindexEntity` use
  `indexSelectColumns ?? selectColumns` so embeddings still get the body; passage reader (`doc-passages.ts`) does its own
  text read. VERIFIED reindex NOT emptied.
- **#3 task recency/overdue boost**: task cols are `deadline` (due) + `last_updated_at` (recency) — added to task search.select;
  rankBoost now fires recency (was dead) + a bounded TRUE-overdue boost (deadline<now && open && !archived).
- **#4 date/entity pre-filters** (`search.ts`): parseDateRange ("in June"/"June 2025"/"2025"/"last month") + resolveCompanyId →
  `.eq(company_id)`/`.gte/.lt(dateColumn)` before scoring (documents `issue_date`, meetings `meeting_date`). Best-effort/fail-open;
  mis-parse → no filter, never empties. (⚠️ tasks excluded from SEARCHABLE_DEFS so filters don't touch the task palette path.)
- **#5 prune meetings slice** (`/api/ask`): meetings now pruneByBudget'd (was the biggest unpruned context contributor).
- **B2 query-embed cache** (`embeddings.ts embedQuery`): 5-min TTL cache on the QUERY embed (not content embeds).
- **B3 graceful AI-free** (`ai-models.ts isAiExhausted` + AI_RESTING_NOTE): full-ladder exhaustion → degrade to resolver-only
  ("AI is resting — here's what I can answer natively") in `/api/ask` + `/api/ori`. No hang/500.
- **B4 quota meter** (NEW `/api/ai-usage` + palette empty-state card): "AI today: N% of cap" or "N calls · Xk tokens".
  ⚠️ pct is today-vs-monthly-cap + rates are 0 on free tier → reads 0% until paid rates set; calls·tokens is the live signal.

## Wave 3 — premium layer
- **C1 watchers** (NEW `ori/watchers.ts` + `tools-watchers.ts`): "tell me the moment X happens" — stored in automation_rules
  kind="watch" (task_id always null so the cron skips them). Evaluated EVENT-DRIVEN on the existing per-write hook
  (`index-hooks.ts` calls `fireWatchers` = `void evaluateWatchers().catch()` — NON-BLOCKING, can never throw into a write).
  3 conditions: task_status_becomes (±company), task_overdue, document_expiring(daysBefore). Deduped by stable lastFiredKey so
  the same event never double-fires. Tools: create_watcher/list_watchers/delete_watcher (undoable). NO catch-up sweep (only
  fires on next write of a matching row). Extensible switch (add a case + WATCHED_TYPES entry).
- **C4 macro→schedule bridge**: new automation_rules kind "scheduled_macro" (evaluator in automations.ts + fire in
  ori-automations cron) — at the due time it SURFACES the macro's steps as a confirm-prompt notification, **never auto-executes**
  (Tier-3 safe). Resolver "schedule/run <name> every monday / weekly". ⚠️ no list/cancel UI yet.
- **A5 Trash auto-purge** (NEW `/api/cron/purge-trash`, daily 04:00): hard-delete docs `intake_state='trash'` +
  `trashed_at ≤ now−30d`, bounded 200/run via deleteDocumentForever, logs system_events, fail-open.
- **C2 client freshness cache** (`command-palette.tsx`): ~2–3 min in-memory cache for pulse/briefing + memoise identical
  searches → fewer reads, snappier reopen.
- **C3 weekly cost/health digest** (NEW `ori/health-digest.ts` + morning-run, Mondays): AI usage + embeddings index size +
  task/doc counts + Trash size, owner-only push to /insights. Notes true egress must be read from the Supabase dashboard.

Tool count now ~160 across 9 tool files (0 duplicate names).

## Operational flags for the owner (relayed)
- ⚠️ **Vision model shuts down 2026-07-17** (`AI_VISION_MODELS` = llama-4-scout, 10 days) → OCR falls back to "rules",
  quietly weakening document embeddings. Set a replacement vision model via `AI_VISION_MODELS` env before then.
- Paid AI key/2nd provider is still the reliability ceiling for everything ORI does.
- Owner should still upgrade Supabase Pro as a safety net; egress should fall as indexing settles + these fixes land.

## Deferred / next (SPOTTED by agents)
- `buildContext` still `listDocuments()`-reads the whole (now-lighter, no-blob) library when any doc hit → narrow to the hit IDs.
- Nightly reindex still pages the full documents table pulling extracted_text for changed rows → page id+hash first, blob only
  for changed (needs registry `updatedColumn`, bigger).
- `buildAllTasks` still transfers all (bodyless) task_updates rows → a DISTINCT ON/aggregate RPC would collapse to 1 row/task (migration).
- Watchers: add `"overdue"` NotifKind + isCritical so blocked/overdue buzz through quiet hours; portal-target deep-link; one-shot
  catch-up evaluate in create_watcher; more condition kinds (priority Critical, assigned-to-X, risk High, pipeline Issued).
- scheduled_macro: a list/cancel surface + dedicated NotifKind.
- A4 compress-at-door (scanner) NOT built — high storage value but risks the capture flow; do carefully later.
- Server-side short cache (s-maxage) on pulse/briefing/ai-usage routes.

See [[ori_godmode_build_jul2026]], [[supabase_egress_jul2026]], [[ai_provider_gemini]].

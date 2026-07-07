# Supabase egress reduction (7 Jul 2026)

## Why
Supabase free-tier **egress hit 15.583 / 5 GB (312% over)**. Grace period ends
**3 Aug 2026**; after that requests 402. Egress = bytes the DB/Storage sends back
to the app. Everything else (storage size, DB size, realtime, edge fns) is well
within limits — this is purely an outbound-data problem.

## Audit (7-finder ultracode workflow)
Embeddings/semantic layer came back **CLEAN** (search computes similarity in the
DB, never ships vectors). Real offenders, ranked for a single-operator + few-dozen-
staff scale:
1. **Letterhead images** — `/letters` signs+serves 4 images × every company each load; fresh signed URL each time defeats browser cache → re-download.
2. **`listDocuments()` `select("*")`** — ships the full `extracted_text` OCR blob (tens–hundreds of KB/row) on Home, Brief, /documents and crons.
3. **`getAllTasks()`** — whole task graph re-fetched on every page load (React `cache()` is per-render only); ~7 pages + portal auto-refresh call it all day.
4. `visibleTaskIds()` 3–4 task scans/portal page.
5. Nightly reindex scans every table + per-write reindex hooks.
6. 3 morning crons each pull tasks+docs separately (4×+ before 9am).
Smaller: `/people` all leave+attendance no date filter (worsens monthly); `/documents` 12+ queries; PostgREST `companies(name)` embeds (portal search per-keystroke); polling loops (chat 5s, notif 15s, task-sync 5s).

## Quick wins SHIPPED (this session — NOT pushed, tsc clean, 215/215 tests)
- **#1 signed-URL memo** — `signDocumentFile()` (`src/lib/documents.ts`) now caches the signed URL per `path|expiry` (reused while >60s life left). Returns a STABLE url so the browser reuses its cached image instead of re-downloading. Fixes letterheads + doc previews + Brief logos in one place (they all call it). NB the signing itself never caused egress — the browser re-download did.
- **#2 document column trim** — `listDocuments`/`listIntakeDocuments` take `{ withText?: boolean }`; default omits `extracted_text` via new `DOC_LIGHT_COLUMNS` (all mapped cols minus the blob). `getDocument()` still returns full text. Only `sorting-desk.ts` reads text off lists → opted back in with `{ withText: true }`. Verified `/api/ask` uses doc metadata only (content search = FTS/semantic IDs), so ORI unaffected. Dynamic select string → cast `data as unknown as DocDbRow[]`.
- **#3 getAllTasks cross-request memo** — `src/lib/queries.ts`: 30s in-memory TTL memo (`_allTasksMemo`, promise-dedupe, never caches a rejected fetch) + `invalidateAllTasks()`. `getAllTasks` now `structuredClone`s the memo per call — REQUIRED because consumers mutate rows in place (`tasks-section.tsx:135` sets `r.unread`); clone keeps per-request isolation identical to the old per-render `cache()`.
  - **Did NOT use `unstable_cache`/`"use cache"`**: TaskRow is Date-heavy (unstable_cache JSON-corrupts Dates) and `"use cache"` needs `cacheComponents` in next.config (big, risky). In-memory memo is safe + reversible.
  - **KEY DISCOVERY:** `updateTag("tasks")`/`revalidateTag("tasks")` is sprinkled across ~every task-write path BUT nothing was ever tagged `"tasks"` (no `"use cache"`/`cacheTag` producer, getAllTasks used React `cache()`). So all that invalidation plumbing was **dormant/no-op**. Wired `invalidateAllTasks()` next to the tag calls in the operator-facing write paths: `task/actions.ts` (all sites), `api/action/route.ts`, `api/undo/route.ts`, `capture/actions.ts`, `meeting/actions.ts`. Portal/cron/other writes fall back to the 30s TTL (staff staleness ≤30s is fine).

## Owner recommendation given
Upgrade to Supabase **Pro (~$25/mo → 250 GB egress)** this week as the safety net so nothing 402s on 3 Aug; the quick wins should clear 5 GB anyway.
**Check FIRST (15 min, re-ranks everything):** dashboard Reports → **Storage vs Database egress split** (images vs blobs/queries); whether **Realtime is connected in prod** (if `NEXT_PUBLIC_SUPABASE_*` env unset, every client polls → polling fixes jump priority); `SELECT count(*), avg(length(extracted_text)) FROM documents`.

## Remaining (not done)
Structural: incremental reindex + batched write-hooks (#5); merge 3 morning crons (#6); shared batch name-resolver to kill PostgREST embeds; cache Brief/board. Smaller: date-scope `/people` leave+attendance to 60d (worsens monthly — do soon); lengthen polling intervals + since-cursors; trim other `select("*")` (requests/calendar/ai_jobs). Full ranked list was in the 7-finder synthesis.

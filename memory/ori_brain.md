# ORI as the brain — universal search / find / trace

Built Jun 2026 in seven waves; live on `master` ever since. Reference for how
search, Ask and trace fit together **today** (Sept 2026). For search ranking and
AI reliability see [[ori_search_and_ai_reliability]]; for the rules engine see
[[ori_automations]].

Owner's goal: "from major to the minor detail can be searched, found and even
traced. Everything from ORI search." It started because ORI answered "owner of Dar
Spices" with "not in CONTEXT" — the Ask context was blind to governance.

## The three systems, one brain

1. **ORI Ask** (`/api/ask/route.ts`) — the conversation / RAG.
2. **Deep search** (`/api/search` → `lib/search.ts` `unifiedSearch`) — drawn by
   **`components/studio/search.tsx`** (`StudioSearch`, since 24 Sept 2026: one
   ranked list, a quiet row of kinds, "Ask ORI" as the last row — or the first
   when the query reads like a question). It only renders; the data stays in
   `CommandPaletteProvider` (`components/command-palette.tsx`, mounted once in the
   root layout). Opens with **⌘K / Ctrl+K** or **Ctrl+Space**.
3. **Semantic index** (`lib/embeddings.ts` + `embeddings-reindex.ts`,
   gte-small / pgvector / `hybrid_search`) — gated by the `semanticSearch` setting.

## The entity registry — single source of truth

`src/lib/entity-registry.ts`: one `EntityDef` per type (table, id, columns,
`textFor`, `lifecycleFor`, a `search` block, a `trace` mode). Indexing, deep search,
the palette and trace all derive from it.

**Types today (nine):** `task`, `document`, `person`, `company`, `note`,
`vendor`, `asset`, `governance` (cap table, beneficial owners, signatories, key
persons — one type over four tables via composite ids, `GOV_BASE` 1e6/2e6/3e6/4e6
+ row id), `risk`. Letters, meetings, pipeline and commitments were dropped from
the registry when those features were removed.
- **Documents are searched but NOT embedded** (Aug 2026): the ⌘K hit is a plain
  SQL `ilike` on what the owner typed; nothing re-indexes a document on write.
- **Notes are owner-only** — the search runs behind the admin gate and a portal
  search must never read them.

⚠️ **Adding a type is more than one `EntityDef`.** Three hand-kept lists must
agree: `SourceType` in `lib/embeddings.ts`, `ENTITY_LABELS_ORDER` in
`lib/entity-meta.ts` (an exhaustive `Record`, so the compiler insists) and
**`SearchResultType` in `lib/search.ts`** (NOT checked by the compiler — a type
missing there compiles and then never appears). `embeddings.source_type` is plain
text, so no migration.

⚠️ **CLIENT/SERVER BOUNDARY (hard rule).** The registry imports the server-only
`sb`. Client components import labels/order from the client-safe
**`lib/entity-meta.ts`**, never the registry. A client VALUE-import of the registry
drags `@/db/supabase` into the browser bundle and every page dies with
"SUPABASE_SERVICE_ROLE_KEY is not set". `import type` is fine (erased). This
regressed once (Wave 2) and **neither tsc nor the tests caught it** — after moving
imports, always load a page.

## Indexing

- **Continuous**: `lib/index-hooks.ts` `reindexEntity(type,id)` /
  `removeEntityIndex(type,id)` on write paths; only a HARD delete calls
  `removeEntityIndex`. Convention: on create/update/archive, call `reindexEntity`.
- **Nightly catch-all**: `/api/cron/reindex` → `reindexAll`, derived from
  `ENTITY_DEFS`, so a new type auto-indexes nightly.
- **History is KEPT and labelled** (`embeddings.lifecycle` active|history,
  migration **0094**), never deleted; `removeOrphans` deletes only rows whose
  source is gone. `hybrid_search` takes `filter_lifecycle` (default `active`) —
  called with NAMED args, which is what made adding the parameter positionally safe.
- **Coverage self-audit**: `lib/coverage-audit.ts`, folded into `system-health.ts`;
  inert while `semanticSearch` is off.

## Ask

- Context covers governance/ownership (cap table, beneficial owners, signatories,
  key persons, current company `facts`, resolutions) plus vendors, assets and
  attendance/leave, alongside tasks. Conversational synonyms from
  `lib/synonyms.ts` (owner↔shareholder↔director, supplier↔vendor, rent↔lease…),
  shared with search.
- Passage citations; **graph traversal** for relational / multi-hop questions
  (`CONTEXT.graph`); a provenance line ("8 tasks · 2 documents · 1 governance
  record").
- **ORI memory** — `ai_memory` (migration **0095**), `lib/ai-memory.ts`: QA,
  preferences, "remember that…" (deterministic, works AI-off); `/api/ai-memory`.
- **Runs on Gemini** (`src/lib/ai-models.ts`: `gemini-3.1-flash-lite` →
  `gemini-3.5-flash-lite`, env-overridable). Groq is used only for voice
  (`whisper-large-v3-turbo`). Spend lands in `ai_usage` (migration **0096**) and
  honours `aiMonthlySpendCap` (0 = unlimited, fails open).

## Trace

`/api/trace?type=&id=` → newest-first events (≤200, best-effort): task →
updates + audit log; person → person events + leave requests + asset
assignments; company → facts ledger + resolutions + audit log; document → its
links + automation events; generic fallback → row state + automation events.
`components/trace-panel.tsx` self-mounts inside the palette provider and listens
for `window` event `cos:trace` `{type,id,title}`. Governance has no trace mapping.

## Open follow-ups

- ORI Ask is current-by-default (lifecycle `active`); a history toggle for Ask was
  never wired.
- Risk results link to `/` (no board page).
- `npm run eval:search` re-runs the search golden set; the owner can extend it.

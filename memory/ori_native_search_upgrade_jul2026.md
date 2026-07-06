---
name: ori_native_search_upgrade_jul2026
description: ORI ⌘K native search — made retrieval meaning-aware + space-blind + uncapped (semantic wired into the native list); UI redesign mockups pending owner pick.
metadata:
  type: project
---

Owner (7 Jul): the ⌘K NATIVE search "capped to 6", "terragreen business didn't show up", and
"if I search the same with AI ORI I get it — why not before AI". Wants native to feel addictive
BEFORE tapping AI, and a better layout ("meaning results in white boxes to the right"). Mapped the
whole palette + retrieval with 2 Explore agents.

## DIAGNOSIS (the knowledge gap)
- **Native search = word-matching only.** `unifiedSearch` (src/lib/search.ts) = per-token ilike +
  Postgres FTS (`search_documents`). It required EVERY literal token to match (strict AND gate) and
  matched letter-by-letter — so "terragreen" never matched "Terra Green" (the SPACE), and even if it
  had, the gate killed the company because "business" isn't in "Terra Green Ltd".
- **Semantic search (embeddings/hybrid_search) was LIVE but only wired into `/api/ask` (the AI)** —
  NOT into the native list. THAT is why AI found it and native didn't. (Semantic is ON: 1071 rows,
  embed edge fn works — see [[doc_intake_naming_sorting_jul2026]].)
- **The 6-cap** = `/api/search/route.ts` passed `unifiedSearch(q, 6, ...)` (perTypeLimit=6) + global
  `.slice(0,24)`. Screenshot's "FOUND IN 6 DOCUMENTS" = that cap.
- **"White boxes on the right" = NOT a real feature.** Palette is single-column (cmdk), grouped by
  type; the light bits are the smart/direct answer cards + the reference-number chips. A real right
  preview pane would be NEW (proposed in mockups).

## RETRIEVAL UPGRADES — BUILT, tsc clean, NOT pushed
`src/lib/search.ts`:
1. **Separator-blind matching** in `score()`: collapse `[\s\-_/]` on fields + query so "terragreen"→
   "Terra Green", "darspices"→"Dar Spices". Whole-query collapsed check (+44) + per-token collapsed
   check (+13).
2. **Generic scope words don't gate** — new `SOFT` set (business/document(s)/file(s)/record(s)/info/
   details/data/paper(s)/stuff/thing(s)…). Split `allTokens` → `gating` (distinctive, gate) +
   `softExtra` (boost only). So "terragreen business", "rakesh documents", "dar spices files" work.
   If ALL tokens are generic, keep them (bare "documents" still lists docs). Fetch net + FTS use
   allTokens (wide).
3. **Semantic wired into the native list** — after FTS augmentation, call `hybridSearch(query,
   {limit:24, lifecycle})`, group hits by type (skip task), batch-fetch rows via `getEntityDef(type)
   .search.select` + `.toResult`, merge (boost existing / add new scored by similarity, bypassing the
   token gate). So native retrieval is now as smart at FINDING as the AI. `(data??[]) as unknown as
   EntityRow[]` (supabase dynamic-select typing).
4. **Caps raised**: `unifiedSearch` default perTypeLimit 6→10, global slice 24/40 → 50/80; FTS p_limit
   → max(perTypeLimit*2,20). `/api/search/route.ts`: `unifiedSearch(q, 12, ...)` + tasks slice 8→12.
⚠️ Needs LIVE testing (login) — "terragreen business" should now surface the Terra Green COMPANY +
its docs/tasks. Semantic adds ~1 embed round-trip per search (acceptable; owner wants recall).

## UI REDESIGN — 6 mockups delivered (artifact "ori-search-mockups"), owner to pick
Same query "terragreen business" in each. All current elements preserved (Ask-ORI row, smart answer,
type groups, reference chips, doc reader, History toggle, kbd nav). Directions:
S1 Refined Groups (today + why-it-matched tags name/meaning/inside + counts) · **S2 Two-Pane Preview**
(list left, LIVE preview pane right — the "white boxes on the right" done right; Raycast/Linear feel;
RECOMMENDED skeleton) · S3 Entity Hero (winning entity as hero card + quick-links to its docs/tasks/
people) · S4 Relevance Stream (one blended ranked list, no type walls, why-tags) · S5 Faceted Rail
(left type-filter rail w/ counts) · S6 Answer-First (smart answer promoted to a card on top).
**Recommendation: S2 skeleton + S3 entity hero + S1/S4 why-it-matched tags + the raised caps
(already built); collapses to S1 single-column on mobile.** Owner picks → final composition → build.

See [[ori_brain]], [[doc_intelligence_gemini_search_jul2026]], [[ai_provider_gemini]].

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

## UI REDESIGN — BUILT (owner chose S2+S3+S1/S4 tags), tsc clean, NOT pushed
`src/components/command-palette.tsx` + `src/lib/search.ts`:
- **`matchKind`** added to `SearchResult` (search.ts): registry hits → "name", FTS body hits →
  "inside", semantic hits → "meaning". New `WhyTag` component renders meaning/inside tags on rows +
  hero + preview (name is the silent default).
- **Two-pane on desktop** (lg+): panel widened `lg:max-w-[52rem]`; `Command.List` + a right
  **preview pane** (`w-[260px]`, `hidden lg:flex`) wrapped in a flex row. `onValueChange={setActiveValue}`
  on `<Command>` tracks the highlighted item; each result Item's value carries a `__r_<type>_<id>`
  token parsed back to the `SearchResult` (`activeResult`). Preview = icon + type + WhyTag + title +
  badge + highlighted snippet + actions (Open / "Read in place" for docs / Trace / scoped quick-links
  "Its documents"). No fetch (identity + actions only). Collapses to single-column on <lg.
- **Entity hero** (S3): `heroResult` = top company/person with score ≥60, rendered as a teal card at
  the top of the list (MagneticItem, keyboard-selectable, `__r_` token) with inline quick-link chips;
  excluded from its own type group to avoid dup.
- **Scoped quick-links** `scopedLinks(r)`: company → Open company + `/documents?company=id`; person →
  Open profile + `/documents?person=id`.
Icons added: Building2. `useToast`-outside-provider error seen during build was the known HMR phantom
(ToastProvider wraps layout.tsx; fixed by dev restart, not code).

### Preview-pane fix (owner: "preview isn't loading") — DONE
Root cause: cmdk 1.1.1 fires `onValueChange` only on CHANGE, NOT for the initial auto-selected item →
pane started empty. Fixes: (1) `previewNode` seeds `r = activeResult ?? heroResult ?? results[0]` so the
pane always shows the top/hero result immediately; (2) `onMouseEnter`/`onFocus` on each result row + the
hero set `setActiveValue("__r_<type>_<id>")` so hover drives the preview precisely; (3) arrow-keys still
update via `onValueChange`. So: pane shows the hero on open, follows your mouse, and follows ↑↓.

## ⭐ NEXT STEP (owner-directed, START HERE next chat): improve ORI search — BOTH native + AI results
Owner wants the whole ORI search experience levelled up further — native ⌘K AND the AI (/api/ask) answers.
Native retrieval + the two-pane/hero/tags UI are now in (this file). Directions to explore next:
- **Native recall/ranking**: tune semantic vs keyword blend weights; surface tasks semantically in the
  palette too (currently semantic augment SKIPS task — resolve task hits in /api/search route); add
  per-entity "glance" stats to the preview pane + entity hero (needs a light `/api/entity-glance?type=&id=`
  — open tasks/people/docs/compliance counts) so the hero feels alive like the mockup; more `SOFT` scope
  words + `synonyms.ts` groups; consider a small typo/alias map for company nicknames.
- **AI (/api/ask) results**: richer synthesis, better passage citations, multi-hop, follow-ups; make the
  AI answer reuse the SAME improved retrieval (it already uses hybridSearch); the in-doc reader chat.
- **UI polish**: preview-pane live stats, "Read in place" opening the doc reader INSIDE the right pane
  (not full-screen), keyboard hint that ↑↓ drives the preview, mobile parity.
Files: `src/lib/search.ts` (unifiedSearch + score + semantic augment), `src/app/api/search/route.ts`,
`src/components/command-palette.tsx`, `src/app/api/ask/route.ts`, `src/lib/smart-answer.ts`,
`src/lib/synonyms.ts`, `src/lib/embeddings.ts` (hybridSearch). Semantic IS on (1071 rows). [[ori_brain]]

## UI REDESIGN — 6 mockups delivered (artifact "ori-search-mockups")
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

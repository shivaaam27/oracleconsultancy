// Client-safe entity presentation metadata (heading labels + palette order).
//
// This exists SEPARATELY from entity-registry.ts because the registry imports the
// server-only Supabase client (`sb`). A client component (entity-ui.tsx → the
// command palette) only needs the labels + order, so it must NOT transitively pull
// the server client into the browser bundle — doing so threw a fatal
// "SUPABASE_SERVICE_ROLE_KEY is not set" at module-eval and crashed the whole app.
// This module has NO server/DB imports (the SourceType import below is type-only,
// so it's erased at compile and pulls nothing in at runtime).
//
// KEEP the labels/order here in sync with the EntityDef uiLabel/searchOrder in
// src/lib/entity-registry.ts (the registry re-exports SEARCH_PALETTE_ORDER from
// here, so this is the single source for the palette grouping order).

import type { SourceType } from "@/lib/embeddings";

export type EntityType = SourceType;

/** Heading label + palette position per entity type. searchOrder < 0 = not shown
 *  as its own deep-index group in the palette (tasks keep their own rich rows). */
export const ENTITY_LABELS_ORDER: Record<EntityType, { uiLabel: string; searchOrder: number }> = {
  task:       { uiLabel: "Tasks",        searchOrder: -1 },
  person:     { uiLabel: "People",       searchOrder: 0 },
  company:    { uiLabel: "Companies",    searchOrder: 1 },
  governance: { uiLabel: "Governance",   searchOrder: 2 },
  risk:       { uiLabel: "Risks",        searchOrder: 3 },
  document:   { uiLabel: "Documents",    searchOrder: 4 },
  note:       { uiLabel: "Notes",        searchOrder: 5 },
  vendor:     { uiLabel: "Vendors",      searchOrder: 7 },
  asset:      { uiLabel: "Assets",       searchOrder: 8 },
  pipeline:   { uiLabel: "Applications", searchOrder: 9 },
  commitment: { uiLabel: "Commitments",  searchOrder: 10 },
};

/** The searchable types in display order, with their headings — what the command
 *  palette groups results by (replaces the old hard-coded TYPE_ORDER/TYPE_META). */
export const SEARCH_PALETTE_ORDER: { type: EntityType; uiLabel: string }[] =
  (Object.keys(ENTITY_LABELS_ORDER) as EntityType[])
    .filter((t) => ENTITY_LABELS_ORDER[t].searchOrder >= 0)
    .sort((a, b) => ENTITY_LABELS_ORDER[a].searchOrder - ENTITY_LABELS_ORDER[b].searchOrder)
    .map((t) => ({ type: t, uiLabel: ENTITY_LABELS_ORDER[t].uiLabel }));

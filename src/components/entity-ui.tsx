// Entity UI map — the CLIENT-safe icon + accent for every searchable entity type.
//
// Lifted verbatim from the command palette's old TYPE_META so the icon/tint for
// each entity now live in ONE place. This is the visual half of the entity
// registry: src/lib/entity-registry.ts owns the data/labels/order (server-safe,
// no React/lucide), and this file owns the icons/colours (client-safe, lucide).
// The two are paired by `EntityType`.
//
// Adding a new searchable entity = one EntityDef in entity-registry.ts + one row
// here; the palette then groups + renders it without further edits.

import {
  Users, Building2, FileText, Truck, Laptop, Landmark,
  AlertTriangle, Workflow, ScrollText, StickyNote, DraftingCompass, type LucideIcon,
} from "lucide-react";
import type { EntityType } from "@/lib/entity-meta";
import { SEARCH_PALETTE_ORDER } from "@/lib/entity-meta";

/** Icon + accent tint per entity type. Mirrors the old TYPE_META exactly. */
export const ENTITY_UI: Record<EntityType, { icon: LucideIcon; tint: string }> = {
  person:     { icon: Users,         tint: "text-sky-500" },
  company:    { icon: Building2,     tint: "text-violet-500" },
  document:   { icon: FileText,      tint: "text-amber-500" },
  vendor:     { icon: Truck,         tint: "text-teal-500" },
  asset:      { icon: Laptop,        tint: "text-indigo-500" },
  governance: { icon: Landmark,      tint: "text-amber-600" },
  risk:       { icon: AlertTriangle, tint: "text-rose-600" },
  pipeline:   { icon: Workflow,      tint: "text-cyan-600" },
  commitment: { icon: ScrollText,    tint: "text-lime-600" },
  project:    { icon: DraftingCompass,       tint: "text-orange-500" },
  // Tasks aren't in the deep-index search groups (they keep their own task rows),
  // but the map is keyed by EntityType so we give them a sensible default.
  task:       { icon: FileText,      tint: "text-fg-muted" },
  // Notes are not searchable yet either (no EntityDef until Phase 6), but the map is
  // exhaustive over EntityType, so the compiler demanded this row the moment "note"
  // joined the union — which is how it should work.
  note:       { icon: StickyNote,    tint: "text-yellow-500" },
};

/** A palette heading entry: label + type + icon/tint, ready to render. */
export type PaletteTypeMeta = { type: EntityType; label: string; icon: LucideIcon; tint: string };

/**
 * Build the palette's TYPE_META (label from the registry's `uiLabel`, icon/tint
 * from ENTITY_UI) and TYPE_ORDER (the registry's searchOrder), so the command
 * palette derives both from the registry instead of hard-coding them.
 *
 * Returns:
 *  - `order`: the searchable types in display order (replaces TYPE_ORDER).
 *  - `meta`:  type → { label, icon, tint } (replaces TYPE_META).
 */
export function buildPaletteTypeMeta(): {
  order: EntityType[];
  meta: Record<EntityType, PaletteTypeMeta>;
} {
  const order: EntityType[] = [];
  const meta = {} as Record<EntityType, PaletteTypeMeta>;
  for (const { type, uiLabel } of SEARCH_PALETTE_ORDER) {
    order.push(type);
    meta[type] = { type, label: uiLabel, icon: ENTITY_UI[type].icon, tint: ENTITY_UI[type].tint };
  }
  return { order, meta };
}

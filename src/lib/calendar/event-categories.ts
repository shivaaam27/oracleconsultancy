import { sb } from "@/db/supabase";

export type EventCategory = { id: number; name: string };

/** The owner-managed event category list (Board / Site visit / …), A→Z. */
export async function listEventCategories(): Promise<EventCategory[]> {
  const { data } = await sb.from("event_categories").select("id,name").eq("active", true).order("name");
  return (data ?? []).map((c) => ({ id: c.id as number, name: c.name as string }));
}

/**
 * Resolve a typed category NAME to its id — matching case-insensitively, creating
 * the category on the fly if it's new (so the owner can name a category straight
 * from the event form, e.g. type "Board meeting" and it's saved for next time).
 * Blank → null (uncategorised).
 */
export async function resolveEventCategoryId(name: string | null | undefined): Promise<number | null> {
  const clean = (name ?? "").trim();
  if (!clean) return null;
  const { data: existing } = await sb.from("event_categories").select("id").ilike("name", clean).maybeSingle();
  if (existing) return existing.id as number;
  const { data: created, error } = await sb.from("event_categories").insert({ name: clean }).select("id").single();
  if (error || !created) return null;
  return created.id as number;
}

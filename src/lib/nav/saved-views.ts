import { sb } from "@/db/supabase";

/**
 * Saved views for ANY list (Stage 5 of the ERPNext redesign).
 *
 * A saved view is just a name plus the list's query string, so "Overdue, DSC
 * Ltd, sorted by deadline" becomes one click. It generalises what Tasks already
 * had: the same `settings` row shape, keyed per list — `task.savedViews`,
 * `document.savedViews`, and so on. No migration; the Tasks key is unchanged, so
 * every view the owner already saved still works.
 *
 * ⚠️ A list can only have saved views if its filters live in the URL. That is
 * the Stage 2 rule ("sorting and filtering are URLs, never component state") and
 * this is the feature that pays for it — a list filtered with useState has
 * nothing to save.
 */

export type SavedView = { id: string; name: string; query: string };

function settingsKey(listKey: string) {
  return `${listKey}.savedViews`;
}

export async function getSavedViewsFor(listKey: string): Promise<SavedView[]> {
  const { data, error } = await sb
    .from("settings")
    .select("value")
    .eq("key", settingsKey(listKey))
    .maybeSingle();
  if (error || !data) return [];
  const raw = data.value as string | null;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (v) => v && typeof v.id === "string" && typeof v.name === "string" && typeof v.query === "string"
      );
    }
  } catch {
    /* a corrupt row must not take the page down */
  }
  return [];
}

export async function setSavedViewsFor(listKey: string, views: SavedView[]): Promise<void> {
  await sb
    .from("settings")
    .upsert({ key: settingsKey(listKey), value: JSON.stringify(views) }, { onConflict: "key" });
}

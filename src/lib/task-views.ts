import { sb } from "@/db/supabase";

export type SavedView = { id: string; name: string; query: string };

const KEY = "task.savedViews";

export async function getSavedViews(): Promise<SavedView[]> {
  const { data, error } = await sb
    .from("settings")
    .select("value")
    .eq("key", KEY)
    .maybeSingle();
  if (error || !data) return [];
  const raw = data.value as string | null;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed))
      return parsed.filter(
        (v) => v && typeof v.id === "string" && typeof v.name === "string" && typeof v.query === "string"
      );
  } catch {}
  return [];
}

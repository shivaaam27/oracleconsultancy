import { sb } from "@/db/supabase";
import type { PersonPackPurpose } from "@/lib/people/person-pack-shared";

/**
 * Per-person Prepare-pack preferences, so an operator's choices (which sections
 * to include + which request items they unticked) stick across reopens and
 * refreshes. Stored as one row per person+purpose in the key/value `settings`
 * table (no migration needed); `excluded` holds the unticked request labels.
 * Only the reader is left: nothing saves new preferences any more, but rows
 * already stored are still honoured.
 */
export type PackPrefs = { sections: string | null; excluded: string[] };

function prefKey(personId: number, purpose: PersonPackPurpose) {
  return `v2.packpref.${personId}.${purpose}`;
}

export async function getPackPrefs(
  personId: number,
  purpose: PersonPackPurpose
): Promise<PackPrefs | null> {
  const { data } = await sb
    .from("settings")
    .select("value")
    .eq("key", prefKey(personId, purpose))
    .maybeSingle();
  if (!data?.value) return null;
  try {
    const parsed = JSON.parse(data.value as string) as Partial<PackPrefs>;
    return {
      sections: typeof parsed.sections === "string" ? parsed.sections : null,
      excluded: Array.isArray(parsed.excluded) ? parsed.excluded.map(String) : [],
    };
  } catch {
    return null;
  }
}

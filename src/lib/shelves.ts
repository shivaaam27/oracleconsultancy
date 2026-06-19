// Custom shelves (Part D) — owner-extensible folders beyond the built-in eight.
// A new shelf is normally PROPOSED (a profile_suggestions row, kind "new-shelf")
// and created on accept; the owner can also add one directly. Documents route to
// a custom shelf when their text matches its keywords (see pickShelf).

import { sb } from "@/db/supabase";
import { cache } from "react";
import type { CustomShelf } from "@/lib/documents-shared";

/** All custom shelves, oldest first (so codes stay stable in display order). */
export const listCustomShelves = cache(async (): Promise<CustomShelf[]> => {
  const { data } = await sb
    .from("custom_shelves")
    .select("name,code,keywords")
    .order("id", { ascending: true });
  return (data ?? []).map((r) => ({
    name: r.name as string,
    code: r.code as string,
    keywords: ((r.keywords as string | null) ?? "").split(",").map((k) => k.trim()).filter(Boolean),
  }));
});

/** Create a custom shelf. Code is the next two-digit number after the built-in
 *  eight (09, 10, …). Idempotent on name (unique) — a duplicate is a no-op. */
export async function createCustomShelf(opts: {
  name: string;
  keywords: string[];
  createdBy?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const name = opts.name.trim();
  if (!name) return { ok: false, error: "A shelf needs a name." };
  try {
    const { data: existing } = await sb.from("custom_shelves").select("id").eq("name", name).maybeSingle();
    if (existing) return { ok: true }; // already there
    const { count } = await sb.from("custom_shelves").select("id", { count: "exact", head: true });
    const code = String(9 + (count ?? 0)).padStart(2, "0");
    const keywords = opts.keywords.map((k) => k.trim().toLowerCase()).filter(Boolean).join(",");
    const { error } = await sb.from("custom_shelves").insert({
      name, code, keywords, created_at: new Date().toISOString(), created_by: opts.createdBy ?? "web-ui",
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not create the shelf." };
  }
}

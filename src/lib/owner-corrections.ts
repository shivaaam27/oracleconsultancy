// Owner-correction memory (self-learning). When the owner assigns or corrects a
// document's owner, remember it keyed by the document's distinctive words, so the
// next similar document resolves to that company/person on its own — no AI, no
// guessing. Sibling of routing-corrections (category). Best-effort throughout.

import { sb } from "@/db/supabase";
import { distinctiveTokens } from "@/lib/documents-shared";

export type OwnerHit = { ownerType: "company" | "person"; ownerId: number };

/** Remember that documents like this one belong to a given owner. */
export async function recordOwnerCorrection(opts: {
  title?: string | null;
  issuer?: string | null;
  docType?: string | null;
  ownerType: "company" | "person";
  ownerId: number;
}): Promise<void> {
  try {
    if (!opts.ownerId) return;
    const tokens = distinctiveTokens(`${opts.title ?? ""} ${opts.issuer ?? ""} ${opts.docType ?? ""}`);
    if (tokens.length < 2) return; // too little signal
    const keywords = tokens.join(",");
    const now = new Date().toISOString();
    const { data: existing } = await sb
      .from("owner_corrections")
      .select("id,hits")
      .eq("keywords", keywords)
      .eq("owner_type", opts.ownerType)
      .eq("owner_id", opts.ownerId)
      .maybeSingle();
    if (existing) {
      await sb.from("owner_corrections").update({ hits: ((existing.hits as number) ?? 1) + 1, updated_at: now }).eq("id", existing.id as number);
    } else {
      // A different owner for the same signature replaces the old learning.
      await sb.from("owner_corrections").delete().eq("keywords", keywords);
      await sb.from("owner_corrections").insert({
        keywords, owner_type: opts.ownerType, owner_id: opts.ownerId, sample_title: opts.title ?? null, hits: 1, created_at: now, updated_at: now,
      });
    }
  } catch { /* best-effort */ }
}

/** The owner previously chosen for documents like this, if a learned correction
 *  matches strongly. Null when nothing learned applies. */
export async function learnedOwnerFor(text: string): Promise<OwnerHit | null> {
  try {
    const tokens = new Set(distinctiveTokens(text, 14));
    if (tokens.size === 0) return null;
    const { data } = await sb
      .from("owner_corrections")
      .select("keywords,owner_type,owner_id,hits")
      .order("hits", { ascending: false })
      .limit(300);
    let best: { hit: OwnerHit; overlap: number; hits: number } | null = null;
    for (const r of data ?? []) {
      const stored = (r.keywords as string).split(",").filter(Boolean);
      if (!stored.length) continue;
      const overlap = stored.filter((t) => tokens.has(t)).length;
      const enough = stored.length <= 2 ? overlap === stored.length : overlap >= 2;
      if (!enough) continue;
      const hits = (r.hits as number) ?? 1;
      if (!best || overlap > best.overlap || (overlap === best.overlap && hits > best.hits)) {
        best = { hit: { ownerType: r.owner_type as "company" | "person", ownerId: r.owner_id as number }, overlap, hits };
      }
    }
    return best?.hit ?? null;
  } catch {
    return null;
  }
}

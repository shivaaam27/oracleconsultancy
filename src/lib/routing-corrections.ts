// Learning loop (Part C). When the owner re-categorises a filed document, the fix
// is remembered as a (keywords → category) example. Future intake checks these
// first, so the next similar document follows the correction — deterministic, so
// it works with AI off and never drifts. Best-effort: a learning failure never
// affects whether the document was saved.

import { sb } from "@/db/supabase";
import { DOC_CATEGORIES, distinctiveTokens } from "@/lib/documents-shared";

const VALID = new Set<string>(DOC_CATEGORIES as readonly string[]);

/** Record that the owner moved a document to `toCategory`. Keyed by the document's
 *  distinctive tokens; an identical signature bumps `hits` instead of duplicating. */
export async function recordCategoryCorrection(opts: {
  title?: string | null;
  issuer?: string | null;
  docType?: string | null;
  toCategory: string;
}): Promise<void> {
  try {
    if (!opts.toCategory || !VALID.has(opts.toCategory)) return;
    const tokens = distinctiveTokens(`${opts.title ?? ""} ${opts.issuer ?? ""} ${opts.docType ?? ""}`);
    if (tokens.length < 2) return; // too little signal to learn from
    const keywords = tokens.join(",");
    const now = new Date().toISOString();
    const { data: existing } = await sb
      .from("routing_corrections")
      .select("id,hits")
      .eq("keywords", keywords)
      .maybeSingle();
    if (existing) {
      await sb
        .from("routing_corrections")
        .update({ to_category: opts.toCategory, hits: ((existing.hits as number) ?? 1) + 1, updated_at: now })
        .eq("id", existing.id as number);
    } else {
      await sb.from("routing_corrections").insert({
        keywords, to_category: opts.toCategory, sample_title: opts.title ?? null, hits: 1, created_at: now, updated_at: now,
      });
    }
  } catch { /* best-effort */ }
}

/** The category the owner has previously chosen for documents like this one, if a
 *  learned correction matches strongly (most of its tokens present in the text).
 *  Returns null when nothing learned applies — the caller keeps its own guess. */
export async function learnedCategoryFor(text: string): Promise<string | null> {
  try {
    const tokens = new Set(distinctiveTokens(text, 12));
    if (tokens.size === 0) return null;
    const { data } = await sb
      .from("routing_corrections")
      .select("keywords,to_category,hits")
      .order("hits", { ascending: false })
      .limit(200);
    let best: { cat: string; overlap: number; hits: number } | null = null;
    for (const r of data ?? []) {
      const stored = (r.keywords as string).split(",").filter(Boolean);
      if (stored.length === 0) continue;
      const overlap = stored.filter((t) => tokens.has(t)).length;
      // Match when ALL stored tokens are present (≤2 stored) or ≥2 overlap otherwise.
      const enough = stored.length <= 2 ? overlap === stored.length : overlap >= 2;
      if (!enough) continue;
      const hits = (r.hits as number) ?? 1;
      if (!best || overlap > best.overlap || (overlap === best.overlap && hits > best.hits)) {
        best = { cat: r.to_category as string, overlap, hits };
      }
    }
    return best?.cat ?? null;
  } catch {
    return null;
  }
}

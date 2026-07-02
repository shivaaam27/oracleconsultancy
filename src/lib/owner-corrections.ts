// Owner-correction memory (self-learning). When the owner assigns or corrects a
// document's owner, remember it keyed by the document's distinctive words, so the
// next similar document resolves to that company/person on its own — no AI, no
// guessing. Sibling of routing-corrections (category). Best-effort throughout.

import { sb } from "@/db/supabase";
import { distinctiveTokens } from "@/lib/documents-shared";

export type OwnerHit = { ownerType: "company" | "person"; ownerId: number };

// Words that appear on MANY companies' documents (a business licence, an annual
// return, a tax certificate…). A signature built only from these is not specific
// to any one owner, so learning on it would mis-file across companies. A learned
// rule must carry at least one token OUTSIDE this set — a company code/alias/name
// or a person's name — the thing that actually identifies the owner.
const GENERIC_DOC_WORDS = new Set([
  "business", "licence", "license", "certificate", "permit", "registration", "register",
  "annual", "return", "company", "limited", "document", "official", "original", "copy",
  "tax", "income", "statement", "receipt", "payment", "invoice", "letter", "form", "application",
  "national", "republic", "tanzania", "authority", "ministry", "general", "office", "department",
  "revenue", "social", "security", "fund", "insurance", "policy", "contract", "agreement",
  "clearance", "compliance", "employer", "employee", "staff", "renewal", "valid", "number",
]);

/** Stable signature tokens: distinctive words with 4-digit YEARS stripped (so a
 *  renewal of the same document keeps the same fingerprint year-to-year). */
function signatureTokens(text: string, max = 8): string[] {
  return distinctiveTokens(text, max + 4).filter((t) => !/^\d{4}$/.test(t)).slice(0, max);
}

/** True when at least one token identifies a SPECIFIC owner (not a generic
 *  document word), so a learned rule can't grab another company's same-type doc. */
function hasDistinctiveToken(tokens: string[]): boolean {
  return tokens.some((t) => !GENERIC_DOC_WORDS.has(t));
}

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
    const tokens = signatureTokens(`${opts.title ?? ""} ${opts.issuer ?? ""} ${opts.docType ?? ""}`);
    if (tokens.length < 2) return; // too little signal
    // Refuse to learn from a purely generic signature (e.g. "business licence
    // certificate") — it would mis-route every other company's same-type doc.
    if (!hasDistinctiveToken(tokens)) return;
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
      // Keep any sibling rule for a DIFFERENT owner sharing this signature — do
      // NOT delete it. Now that a signature must carry a distinctive owner token,
      // a genuine collision is rare, and learnedOwnerFor resolves ties to nobody
      // rather than letting one correction silently erase another (audit #224).
      await sb.from("owner_corrections").insert({
        keywords, owner_type: opts.ownerType, owner_id: opts.ownerId, sample_title: opts.title ?? null, hits: 1, created_at: now, updated_at: now,
      });
    }
  } catch { /* best-effort */ }
}

/** The owner previously chosen for documents like this, if a learned correction
 *  matches strongly AND unambiguously. Null when nothing learned applies, the
 *  overlap is only on generic words, or two owners tie (ambiguous → resolve none). */
export async function learnedOwnerFor(text: string): Promise<OwnerHit | null> {
  try {
    const tokens = new Set(signatureTokens(text, 16));
    if (tokens.size === 0) return null;
    const { data } = await sb
      .from("owner_corrections")
      .select("keywords,owner_type,owner_id,hits")
      .order("hits", { ascending: false })
      .limit(300);
    // Rank candidates by (distinctive overlap, then hits); collect the winning
    // tier so a tie between DIFFERENT owners resolves nobody.
    let best: { overlap: number; hits: number } | null = null;
    const winners: OwnerHit[] = [];
    for (const r of data ?? []) {
      const stored = (r.keywords as string).split(",").filter(Boolean);
      if (!stored.length) continue;
      const shared = stored.filter((t) => tokens.has(t));
      // Must share enough AND at least one DISTINCTIVE (owner-identifying) token —
      // an overlap only on generic words ("business","licence") is not a match.
      const enough = stored.length <= 2 ? shared.length === stored.length : shared.length >= 2;
      if (!enough || !hasDistinctiveToken(shared)) continue;
      const overlap = shared.length;
      const hits = (r.hits as number) ?? 1;
      const hit: OwnerHit = { ownerType: r.owner_type as "company" | "person", ownerId: r.owner_id as number };
      if (!best || overlap > best.overlap || (overlap === best.overlap && hits > best.hits)) {
        best = { overlap, hits };
        winners.length = 0;
        winners.push(hit);
      } else if (overlap === best.overlap && hits === best.hits) {
        winners.push(hit);
      }
    }
    if (!best) return null;
    // Ambiguous — the strongest match names more than one distinct owner.
    const distinct = new Map(winners.map((w) => [`${w.ownerType}:${w.ownerId}`, w]));
    return distinct.size === 1 ? [...distinct.values()][0] : null;
  } catch {
    return null;
  }
}

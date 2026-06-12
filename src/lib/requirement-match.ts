// Pure, server-safe matching between a saved document and a requirement
// checklist item. Used by BOTH people (requirements.ts) and companies
// (company-requirements.ts) to auto-link a filed document to the item it
// satisfies. No DB imports.
//
// Why this exists: auto-linking used to key on the broad document *category*
// only. Most staff items share category "Other" (so never linked) and several
// items share one category (so the wrong box got ticked). This matcher reads the
// item label + document title/type, expands domain synonyms, scores every
// (item, document) pair, then assigns globally best-first so each document and
// each item is used at most once — deterministic, no collisions.

export type MatchItem = { id: number; label: string; category: string | null };
export type MatchDoc = { id: number; title: string; category: string | null; docType: string | null };

// Words that carry no matching signal — dropped before scoring.
const STOP = new Set([
  "the", "and", "for", "of", "a", "an", "to", "or", "with", "staff", "member",
  "details", "detail", "document", "documents", "copy", "scan", "form", "letter", "letters",
]);

// Concept synonym groups. If a token from a group appears, the whole group is
// added to that side's concept set, so "National ID" ↔ "NIDA card",
// "CV" ↔ "résumé", "Work permit" ↔ "residence permit", etc. all match.
const SYNONYMS: string[][] = [
  ["nationalid", "national", "nida", "identification", "identity", "id"],
  ["tin", "taxpayer", "taxid"],
  ["nssf", "socialsecurity", "social", "security", "pension"],
  ["wcf", "compensation"],
  ["passport"],
  ["visa"],
  ["permit", "residence", "resident", "work"],
  ["immigration"],
  ["contract", "employment", "agreement", "appointment", "offer", "engagement"],
  ["cv", "resume", "curriculum", "vitae"],
  ["bank", "account", "banking"],
  ["certificate", "diploma", "degree", "academic", "transcript", "professional", "qualification", "certificates"],
  ["medical", "health", "fitness", "fit"],
  ["emergency", "kin"],
  ["photo", "photograph", "picture", "passportphoto"],
  ["reference", "referee", "recommendation", "references"],
  ["licence", "license", "trading"],
  ["registration", "brela", "incorporation", "registered"],
  ["vat", "vrn"],
  ["paye", "sdl"],
  ["insurance", "policy", "cover"],
  ["lease", "tenancy", "rent"],
  ["statutory", "register", "registers"],
];

function tokens(s: string): Set<string> {
  return new Set(
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "") // strip accents: résumé → resume
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 2 && !STOP.has(t))
  );
}

function concept(base: Set<string>): Set<string> {
  const out = new Set(base);
  for (const group of SYNONYMS) {
    if (group.some((g) => base.has(g))) for (const g of group) out.add(g);
  }
  return out;
}

/** Higher = better. 0 means no meaningful relationship. */
export function matchScore(item: MatchItem, doc: MatchDoc): number {
  const it = concept(tokens(item.label));
  if (it.size === 0) return 0;
  const dt = concept(tokens([doc.title, doc.docType ?? ""].filter(Boolean).join(" ")));
  let overlap = 0;
  for (const t of it) if (dt.has(t)) overlap++;
  let s = overlap * 2;
  // A matching, *specific* category is a supporting signal — but "Other" is too
  // broad to mean anything, so it earns no bonus.
  if (item.category && doc.category && item.category === doc.category && item.category !== "Other") s += 2;
  return s;
}

// Need at least one real concept-token overlap (or a specific-category match) to
// link — keeps unrelated "Other" documents from being attached.
const THRESHOLD = 2;

/**
 * Globally assign documents to items, best score first, each used at most once.
 * Returns item.id → doc.id for the links that should be made.
 */
export function matchDocumentsToItems(items: MatchItem[], docs: MatchDoc[]): Map<number, number> {
  const pairs: { itemId: number; docId: number; s: number }[] = [];
  for (const it of items) {
    for (const d of docs) {
      const s = matchScore(it, d);
      if (s >= THRESHOLD) pairs.push({ itemId: it.id, docId: d.id, s });
    }
  }
  // Deterministic ordering: best score wins; ties broken by id so results are stable.
  pairs.sort((a, b) => b.s - a.s || a.itemId - b.itemId || a.docId - b.docId);

  const usedItems = new Set<number>();
  const usedDocs = new Set<number>();
  const out = new Map<number, number>();
  for (const p of pairs) {
    if (usedItems.has(p.itemId) || usedDocs.has(p.docId)) continue;
    out.set(p.itemId, p.docId);
    usedItems.add(p.itemId);
    usedDocs.add(p.docId);
  }
  return out;
}

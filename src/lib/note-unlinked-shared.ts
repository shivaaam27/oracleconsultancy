import type { LinkType } from "@/lib/note-links-shared";

/**
 * "You wrote Terra Green Ltd but did not link it." Deferred from Phase 3, built
 * with Phase 4. Client-safe: pure matching, no database, no ProseMirror.
 *
 * ⚠️ THIS SUGGESTS. IT NEVER LINKS BY ITSELF. That is the standing rule from the
 * document-intelligence rebuild (§6 of the notes plan): intelligence may READ and
 * SUGGEST, and anything that writes needs the owner to press a button. It is also
 * why accepting a suggestion **rewrites the text into a real `@` mention** rather
 * than quietly inserting a `note_links` row — links stay derived from the writing,
 * so there is still exactly one way a link exists.
 */

export type LinkCandidate = {
  entity: LinkType;
  id: number;
  code: string | null;
  label: string;
  /** What to look for in the text — a company name, a person's name, a task code. */
  needle: string;
  sublabel?: string;
};

/**
 * Short needles are worse than useless: two- and three-letter names ("PES", "MES",
 * initials) hit inside ordinary words and in other names, and every false offer
 * costs more attention than the link saves. Task CODES are exempt — "TG-006" is
 * unambiguous at six characters and is exactly the thing people type by hand.
 */
const MIN_NEEDLE = 4;

/** Never crowd the writing. Five is enough to be useful and few enough to ignore. */
export const MAX_SUGGESTIONS = 5;

/** Letters, digits and the marks that appear INSIDE names — so "Terra Green Ltd."
 *  matches at a full stop, and "TG-006" is not split at its hyphen. */
function isWordChar(ch: string | undefined): boolean {
  return ch != null && /[\p{L}\p{N}]/u.test(ch);
}

/**
 * Where `needle` appears in `text` as a whole word, or -1.
 *
 * Case-insensitive, because the owner types "terra green" as often as the proper
 * name. Boundary-checked so "Pamoja" does not match inside "Pamojaplus".
 */
export function findWholeWord(text: string, needle: string, from = 0): number {
  if (!needle) return -1;
  const haystack = text.toLowerCase();
  const target = needle.toLowerCase();
  let at = haystack.indexOf(target, from);
  while (at !== -1) {
    const before = haystack[at - 1];
    const after = haystack[at + target.length];
    if (!isWordChar(before) && !isWordChar(after)) return at;
    at = haystack.indexOf(target, at + 1);
  }
  return -1;
}

/**
 * Which candidates are named in the text but not yet linked.
 *
 * `alreadyLinked` is the set of `entity:id` the document already mentions — passed
 * in rather than recomputed here so this stays pure and the caller uses the SAME
 * extractor the server derives `note_links` from.
 *
 * Ordered longest-needle-first so "Terra Green Ltd" is offered rather than a
 * shorter name that happens to sit inside it.
 */
export function findUnlinked(
  text: string,
  candidates: LinkCandidate[],
  alreadyLinked: ReadonlySet<string>,
): LinkCandidate[] {
  if (!text.trim()) return [];

  const out: LinkCandidate[] = [];
  const claimed = new Set<string>();

  const ordered = [...candidates].sort((a, b) => b.needle.length - a.needle.length);

  for (const c of ordered) {
    if (out.length >= MAX_SUGGESTIONS) break;

    const needle = c.needle.trim();
    // A task code is precise enough to be safe at any length; a name is not.
    const longEnough = c.entity === "task" ? needle.length >= 3 : needle.length >= MIN_NEEDLE;
    if (!longEnough) continue;

    const key = `${c.entity}:${c.id}`;
    if (alreadyLinked.has(key) || claimed.has(key)) continue;
    if (findWholeWord(text, needle) === -1) continue;

    claimed.add(key);
    out.push(c);
  }

  return out;
}

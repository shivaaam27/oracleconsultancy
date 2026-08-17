/**
 * `#tags`, derived from what you wrote. Phase 2 of memory/notes_module_plan.md.
 *
 * Client-safe on purpose (no database import — see notes-shared.ts for why that
 * matters): the same parser runs on the server when a note is saved and in the UI
 * when a tag needs highlighting, so the two can never disagree about what a tag is.
 *
 * The rule, deliberately narrow: `#` immediately followed by a letter, then letters,
 * digits, hyphens or underscores. It must sit at a word boundary, so a URL fragment
 * (`…/page#section`), a hex colour (`#2490ef`) and a hash in the middle of a word are
 * all ignored — that last one is why `#` alone or `#1` is not a tag.
 */

const TAG_RE = /(^|[\s(【[{"'>])#([a-zA-Z][a-zA-Z0-9_-]{0,39})\b/g;

/** Every distinct tag in a piece of text, lower-cased, in the order written. */
export function parseTags(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(TAG_RE)) {
    const tag = m[2].toLowerCase();
    if (seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  // A ceiling so one pathological note cannot write a thousand rows.
  return out.slice(0, 50);
}

/** `#word` → the display form, without the hash. */
export function tagLabel(tag: string): string {
  return tag.replace(/^#/, "");
}

/* ------------------------------------------------------------------ *
 * @mentions — pure, client-safe parsing/highlighting helpers.
 * A mention is "@" immediately followed by a known team member's name.
 * ------------------------------------------------------------------ */

export type MentionCandidate = { id: number; name: string };

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Builds a regex that matches "@<name>" for any candidate (longest name
 *  first so "Parin Manek" wins over a hypothetical "Parin"). */
function mentionRegex(candidates: MentionCandidate[]): RegExp | null {
  if (candidates.length === 0) return null;
  const names = candidates
    .map((c) => c.name)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .map(escapeRegex);
  if (names.length === 0) return null;
  return new RegExp(`@(${names.join("|")})`, "gi");
}

/** The candidate ids actually @mentioned in the text. */
export function parseMentionIds(body: string, candidates: MentionCandidate[]): number[] {
  const re = mentionRegex(candidates);
  if (!re) return [];
  const byName = new Map(candidates.map((c) => [c.name.toLowerCase(), c.id]));
  const ids = new Set<number>();
  for (const m of body.matchAll(re)) {
    const id = byName.get(m[1].toLowerCase());
    if (id != null) ids.add(id);
  }
  return [...ids];
}

export type Segment = { text: string; mention: boolean };

/** Splits a body into plain / mention segments for highlighted rendering. */
export function segmentMentions(body: string, candidates: MentionCandidate[]): Segment[] {
  const re = mentionRegex(candidates);
  if (!re) return [{ text: body, mention: false }];
  const out: Segment[] = [];
  let last = 0;
  for (const m of body.matchAll(re)) {
    const start = m.index ?? 0;
    if (start > last) out.push({ text: body.slice(last, start), mention: false });
    out.push({ text: m[0], mention: true });
    last = start + m[0].length;
  }
  if (last < body.length) out.push({ text: body.slice(last), mention: false });
  return out;
}

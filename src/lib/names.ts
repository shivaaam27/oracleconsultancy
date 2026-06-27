/* ------------------------------------------------------------------ *
 * Name helpers — pure, no deps, safe to import from client components.
 *
 * Greetings should address the person by their given (first) name, not
 * an honorific. "Mr Pulin Manek" → "Pulin", "Dr Aisha" → "Aisha".
 * ------------------------------------------------------------------ */

/** Honorifics we strip when they lead a name (case-insensitive, optional
 *  trailing dot). Lower-cased for comparison. */
const HONORIFICS = new Set([
  "mr",
  "mrs",
  "ms",
  "miss",
  "dr",
  "prof",
  "chef",
  "eng",
  "rev",
  "sir",
  "madam",
  "mx",
  "hon",
]);

/**
 * The given name with a leading honorific stripped.
 *
 *   "Mr Pulin Manek" → "Pulin"
 *   "Pulin Manek"    → "Pulin"
 *   "Dr Aisha"       → "Aisha"
 *   "Pulin"          → "Pulin"   (single word — returned as-is)
 *   ""               → ""        (empty — returned as-is)
 *
 * If every token is an honorific (e.g. "Dr"), the first token is kept so we
 * never return an empty greeting from a non-empty name.
 */
export function getGivenName(name: string): string {
  const tokens = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return name;

  for (const token of tokens) {
    const bare = token.replace(/\.$/, "").toLowerCase();
    if (!HONORIFICS.has(bare)) return token;
  }

  // All tokens were honorifics — fall back to the first token.
  return tokens[0];
}

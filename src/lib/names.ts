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

/**
 * Up to two initials for an avatar, IGNORING a leading honorific so the mark
 * reflects the real name — not the title.
 *
 *   "Mr Vishal Pragji"  → "VP"   (not "MV")
 *   "Mrs Jane Doe"      → "JD"
 *   "Vishal Pragji"     → "VP"   (first + last)
 *   "Vishal"            → "VI"   (single name — first two letters)
 *   ""                  → "?"
 *
 * First + last initials (matches "first name and last name initials"). Safe for
 * company names too — they never lead with an honorific, so nothing is stripped.
 */
export function getInitials(name: string): string {
  let parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  // Drop any leading honorific tokens ("Mr", "Mrs", "Ms", "Dr"…).
  while (parts.length > 1 && HONORIFICS.has(parts[0].replace(/\.$/, "").toLowerCase())) {
    parts = parts.slice(1);
  }
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return ((parts[0][0] ?? "") + (parts[parts.length - 1][0] ?? "")).toUpperCase();
}

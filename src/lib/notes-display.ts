// Client-safe helper for surfacing "notes" fields in read views.
// Filters out auto-generated placeholder notes so cards/popups stay clean —
// only meaningful, human-entered notes are shown at a glance.

const PLACEHOLDER_NOTE_PREFIXES = [
  "Auto-captured from Accountable column",
];

/** Returns the note to display, or null if it's empty or a known placeholder. */
export function displayNote(notes: string | null | undefined): string | null {
  const t = (notes ?? "").trim();
  if (!t) return null;
  if (PLACEHOLDER_NOTE_PREFIXES.some((p) => t.startsWith(p))) return null;
  return t;
}

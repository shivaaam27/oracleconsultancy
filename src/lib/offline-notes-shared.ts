/* ------------------------------------------------------------------ *
 * Turning a note typed offline into a real note.
 *
 * Pure, and separate from the route, so it can be tested without a database —
 * this is the code that decides what the owner's writing becomes, and getting it
 * wrong quietly mangles the thing he wrote.
 *
 * No `sb`, no server-only imports: safe on both sides.
 * ------------------------------------------------------------------ */

export const MAX_TEXT = 100_000;
export const MAX_TITLE = 300;

/** A Tiptap document node — only the shape this file produces. */
export type Doc = {
  type: "doc";
  content: Array<{ type: "paragraph"; content?: Array<{ type: "text"; text: string }> }>;
};

/**
 * Plain text becomes a Tiptap document, one paragraph per line.
 *
 * ⚠️ A BLANK LINE STAYS A BLANK LINE. Collapsing them would silently reflow
 * somebody's writing — the paragraph breaks are the writing. An empty paragraph
 * node is exactly what the editor produces for an empty line, so what opens in
 * COS matches what was typed on the device.
 */
export function textToDoc(text: string): Doc {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  return {
    type: "doc",
    content: lines.map((line) =>
      line.trim() ? { type: "paragraph" as const, content: [{ type: "text" as const, text: line }] } : { type: "paragraph" as const }
    ),
  };
}

/**
 * The title: the first line with anything on it.
 *
 * The writing surface has no title box on purpose — offline you want somewhere
 * to type, not a form — so the note names itself the way a person would.
 */
export function titleFromText(text: string): string {
  const line = text.replace(/\r\n/g, "\n").split("\n").find((l) => l.trim());
  return (line ?? "").trim().slice(0, MAX_TITLE);
}

/** Is this a real ISO date? The device's clock is trusted for WHEN a note was
 *  written — it is the only clock that was there — but not blindly. */
export function isIsoDate(v: unknown): v is string {
  return typeof v === "string" && v.length >= 10 && !Number.isNaN(Date.parse(v));
}

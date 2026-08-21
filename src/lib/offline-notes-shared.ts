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

/* ------------------------------------------------------------------ *
 * Stage 2 and 3 — notes that are already on the device.
 *
 * Stage 1 only ever made NEW notes, which is why it carried no risk: a thought
 * that has never existed cannot collide with anything. Reading and editing what
 * is already there is a different problem, and these are the pure parts of it.
 * ------------------------------------------------------------------ */

/** A node in a Tiptap document, seen from outside. Deliberately loose: this file
 *  must cope with every node the editor can produce, including ones added later. */
export type DocNode = {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown> | null;
  marks?: Array<{ type?: string }> | null;
  content?: DocNode[] | null;
};

/** Nodes that stand on their own line when a document is flattened to text.
 *  A `tableCell` counts: two cells on one row are two facts, not one word. */
const BLOCK_TYPES = new Set([
  "paragraph",
  "heading",
  "listItem",
  "taskItem",
  "blockquote",
  "codeBlock",
  "callout",
  "tableCell",
  "tableHeader",
]);

/** Everything inside a node, run together — this is one line's worth. */
function inlineText(node: DocNode): string {
  if (typeof node.text === "string") return node.text;
  // A picture has no words in it. Its alt text is a label, not writing.
  if (node.type === "image") return "";
  return (Array.isArray(node.content) ? node.content : []).map(inlineText).join("");
}

/**
 * A document as plain text, one block per line.
 *
 * ⚠️ This must agree with what the editor stores in `body_text`, because that is
 * what search and the AI read. The editor uses Tiptap's own `getText()`, which
 * puts a newline between block nodes and nothing between inline ones — so that
 * is what this does. It will not match character-for-character on exotic nodes,
 * and it does not need to: offline it is used for the list snippet and for
 * filling the box when a plain note is rewritten, never as the stored value on a
 * note the editor also touched.
 *
 * ⚠️ A BLOCK THAT CONTAINS OTHER BLOCKS DOES NOT EMIT A LINE OF ITS OWN — it
 * recurses. A list item wrapping a paragraph is one line, not one line and an
 * empty one; getting this wrong sprinkles blank lines through every list.
 */
export function docText(doc: unknown): string {
  const out: string[] = [];

  const walk = (node: DocNode) => {
    if (!node || typeof node !== "object") return;
    const kids = Array.isArray(node.content) ? node.content : [];
    const hasBlockChild = kids.some((k) => BLOCK_TYPES.has(k?.type ?? ""));
    if (BLOCK_TYPES.has(node.type ?? "") && !hasBlockChild) {
      out.push(inlineText(node));
      return;
    }
    for (const k of kids) walk(k);
  };

  const root = (doc ?? {}) as DocNode;
  for (const k of Array.isArray(root.content) ? root.content : []) walk(k);
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Can this note survive a trip through a plain-text box and back?
 *
 * ⚠️ THE WHOLE POINT: offline the writing surface is plain text, and replacing a
 * note's body with plain text would silently destroy a table, a picture, a
 * mention or a tick-box. So a note only offers full editing offline when there is
 * genuinely nothing to lose — everything else is added to instead of rewritten.
 *
 * Plain means: paragraphs, holding unmarked text. Bold counts as formatting; so
 * does a heading, a list and a link. That is a strict test on purpose. Being
 * told "you can add to this one" is a small disappointment; losing the table out
 * of a note you wrote three months ago is not.
 */
export function docIsPlain(doc: unknown): boolean {
  const root = (doc ?? {}) as DocNode;
  if (root.type !== "doc") return false;
  const blocks = Array.isArray(root.content) ? root.content : [];
  for (const b of blocks) {
    if (b?.type !== "paragraph") return false;
    if (b.attrs && Object.values(b.attrs).some((v) => v != null)) return false;
    for (const inline of Array.isArray(b.content) ? b.content : []) {
      if (inline?.type !== "text") return false;
      if (Array.isArray(inline.marks) && inline.marks.length > 0) return false;
    }
  }
  return true;
}

/**
 * Add writing to the end of a document, leaving everything above untouched.
 *
 * ⚠️ THIS IS WHY OFFLINE EDITING IS SAFE. An append cannot destroy what it does
 * not touch, and — the part that matters for syncing — two appends to the same
 * note in either order give the same note. So when a note has moved on at the
 * server while a device was away, the device's addition still simply goes on the
 * end. There is nothing to merge and nothing to choose between.
 */
export function appendToDoc(doc: unknown, text: string): { type: "doc"; content: DocNode[] } {
  const root = (doc ?? {}) as DocNode;
  const existing = Array.isArray(root.content) ? root.content.slice() : [];
  const added = textToDoc(text).content as DocNode[];
  // One blank line between what was there and what is being added, unless the
  // note already ends in one — otherwise the addition reads as the same thought.
  const last = existing[existing.length - 1];
  const endsBlank = last?.type === "paragraph" && !(Array.isArray(last.content) && last.content.length);
  const spacer: DocNode[] = existing.length && !endsBlank ? [{ type: "paragraph" }] : [];
  return { type: "doc", content: [...existing, ...spacer, ...added] };
}


/**
 * Where a block ends up when it is dragged somewhere else.
 *
 * Pure, and separate from the editor, because this is the part that is easy to
 * get wrong and impossible to eyeball: the block is DELETED first, so every
 * position after it shifts up by one, and a target BELOW the original therefore
 * has to be reduced by one. Off by one here and the paragraph lands one place
 * further down than the finger said — which looks like the drag "not quite
 * working" and is very hard to see in a long note.
 *
 * `sizes` is each top-level block's ProseMirror `nodeSize`, in order. `to` is the
 * gap the block is dropped into: 0 is above everything, `sizes.length` is below
 * everything.
 */
export function blockMovePlan(
  sizes: number[],
  from: number,
  to: number
): { deleteFrom: number; deleteTo: number; insertAt: number } | null {
  if (from < 0 || from >= sizes.length) return null;
  // Dropping a block back where it already is, on either side, changes nothing.
  if (to === from || to === from + 1) return null;

  const start = (list: number[], index: number) => {
    let pos = 0;
    for (let i = 0; i < index && i < list.length; i++) pos += list[i];
    return pos;
  };

  const deleteFrom = start(sizes, from);
  const deleteTo = deleteFrom + sizes[from];
  const without = sizes.filter((_, i) => i !== from);
  const landing = to > from ? to - 1 : to;
  return { deleteFrom, deleteTo, insertAt: start(without, landing) };
}

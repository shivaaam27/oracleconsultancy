"use client";

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/**
 * A soft tint behind the line you are writing on.
 *
 * ⚠️ WHY THIS EXISTS. The owner reported losing his place on the page: "the cursor
 * disappears and [it is] hard to place or see where I am." Measured first — the mouse
 * pointer is a normal I-beam everywhere over the note, so nothing was hiding it. The
 * thing that was hard to see is the **caret**, and it was hard to see for a reason we
 * chose ourselves: Phase 1.5 removed the focus ring from the writing surface (the blue
 * box round the whole page, which he rightly hated), on the grounds that "the blinking
 * caret is the focus indicator for a text surface". That left a 1px, near-black caret
 * as the ONLY signal of where you are, on a white sheet 68 characters wide.
 *
 * CSS can recolour a caret but cannot thicken one — there is no `caret-width`, and
 * `caret-shape` is not usable in practice. Drawing our own caret means hiding the
 * native one and tracking the selection by hand, which breaks IME and text selection;
 * the same trick already caused trouble in `CaretInput`. So the answer is not a bigger
 * caret but a bigger **target for the eye**: tint the block the caret sits in, the way
 * iA Writer and Ulysses do. You find your place by the band, not by hunting a hairline.
 *
 * Three things keep it from becoming the clutter he objected to before:
 *  • it only shows **while the editor is focused** — gated in globals.css on
 *    `.ProseMirror-focused`, the class the library keeps for the purpose, NOT on
 *    `:focus`, which stops matching when the whole window loses focus and would make
 *    the band flicker off every time you switched app and back. A note you are only
 *    reading is clean paper;
 *  • it disappears the moment you **select** anything — a selection is its own,
 *    louder marker, and two highlights at once is noise;
 *  • it skips tables, code blocks and rules, where a band across the block reads as a
 *    bug rather than a hint.
 *
 * To remove it entirely: drop this extension from `note-editor.tsx`. Nothing else
 * depends on it.
 */
export const ActiveLine = Extension.create({
  name: "activeLine",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        // Its own key, like every other plugin in this editor — see note-mention.tsx
        // for what a collision costs.
        key: new PluginKey("noteActiveLine"),
        props: {
          decorations(state) {
            const { selection } = state;

            // A real selection already shows you where you are, in a stronger colour.
            if (!selection.empty) return DecorationSet.empty;

            const $from = selection.$from;
            if ($from.depth === 0) return DecorationSet.empty;

            // The TOP-LEVEL block the caret is in: depth 1. Using the innermost node
            // instead would tint a single list item's paragraph and jump about as you
            // moved between them.
            const pos = $from.before(1);
            const node = state.doc.nodeAt(pos);
            if (!node) return DecorationSet.empty;

            // A band across a table or a code block looks like a rendering fault, not
            // a hint — those blocks have their own strong shape already.
            if (SKIP.has(node.type.name)) return DecorationSet.empty;

            return DecorationSet.create(state.doc, [
              Decoration.node(pos, pos + node.nodeSize, { class: "note-active-line" }),
            ]);
          },
        },
      }),
    ];
  },
});

/* Blocks that already have a strong shape of their own. A band across them reads
   as a rendering fault rather than a hint — and on a CALLOUT it actually masked the
   thing's own tint, so a "Careful" callout kept looking blue while the caret was in
   it (measured, not guessed). */
const SKIP = new Set(["table", "codeBlock", "horizontalRule", "callout"]);

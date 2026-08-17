"use client";

import { Node, mergeAttributes } from "@tiptap/core";

/**
 * A callout — the boxed aside for the thing you must not miss.
 *
 * The one block a note wanted that blockquote could not do: a quote says "someone
 * else said this", a callout says "pay attention to this". Three tones, because
 * that is how many distinctions are worth making — a note is not a status board.
 *
 * `content: "block+"` rather than `"paragraph+"` so a callout can hold a list,
 * which is what most of them turn out to want.
 *
 * No dependency: this is ~40 lines of node definition and some CSS. The tone lives
 * on a `data-tone` attribute so `globals.css` styles it with the existing Desk
 * semantic colours and there is no colour logic in the JavaScript at all.
 */

export const CALLOUT_TONES = ["info", "warn", "success"] as const;
export type CalloutTone = (typeof CALLOUT_TONES)[number];

export const CALLOUT_TONE_LABELS: Record<CalloutTone, string> = {
  info: "Note",
  warn: "Careful",
  success: "Good",
};

function isTone(v: unknown): v is CalloutTone {
  return typeof v === "string" && (CALLOUT_TONES as readonly string[]).includes(v);
}

export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      tone: {
        default: "info" as CalloutTone,
        parseHTML: (el) => {
          const t = el.getAttribute("data-tone");
          return isTone(t) ? t : "info";
        },
        renderHTML: (attrs) => ({ "data-tone": isTone(attrs.tone) ? attrs.tone : "info" }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-callout]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-callout": "", class: "note-callout" }), 0];
  },

  /* Deliberately NO custom commands. `wrapIn("callout", { tone })`,
     `updateAttributes("callout", …)` and `lift("callout")` are built in and do the
     whole job, and a thin `setCallout()` wrapper would only add a name to remember
     plus the generic-typing gymnastics that Tiptap's command augmentation needs. */

  addKeyboardShortcuts() {
    return {
      // Backspace at the very start lifts the content out rather than deleting the
      // block wholesale — the same courtesy blockquote gives.
      Backspace: ({ editor }) => {
        const { empty, $anchor } = editor.state.selection;
        if (!empty || $anchor.parentOffset !== 0) return false;
        if (!editor.isActive(this.name)) return false;
        return editor.commands.lift(this.name);
      },
    };
  },
});

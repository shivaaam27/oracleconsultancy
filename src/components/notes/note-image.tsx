"use client";

import { Node, mergeAttributes } from "@tiptap/core";

/**
 * A picture in a note.
 *
 * ⚠️ THE `src` IS A PERMANENT ROUTE, NEVER A SIGNED URL. The node is stored in
 * `body_json` for good; a Supabase signed URL dies within the hour, so a note
 * written today would show broken pictures tomorrow. It therefore holds only the
 * DOCUMENT ID and points at `/api/notes/file/<id>`, which mints a fresh signature
 * per request. The event-attachment work learned exactly this — "a signed URL
 * expires, a calendar entry does not" — and it applies with more force here,
 * because a note is meant to be read years later.
 *
 * The file itself is an ordinary `documents` row (category "Attachment"), so a
 * picture pasted into a note is findable in the Documents library like any other
 * file, and the note gets a `document` link out of it for free.
 */
export const NoteImage = Node.create({
  name: "noteImage",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      documentId: {
        default: null,
        parseHTML: (el) => Number(el.getAttribute("data-document-id")) || null,
        renderHTML: (a) => ({ "data-document-id": String(a.documentId) }),
      },
      alt: {
        default: "",
        parseHTML: (el) => el.getAttribute("alt") ?? "",
        renderHTML: (a) => ({ alt: (a.alt as string) || "" }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "img[data-document-id]" }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const id = (node.attrs as { documentId?: number }).documentId;
    return [
      "img",
      mergeAttributes(HTMLAttributes, {
        src: `/api/notes/file/${id}`,
        class: "note-image",
        // The picture is decoration in a document; the surrounding text carries the
        // meaning. An empty alt is the correct value when there is nothing to add,
        // and the owner can type one in the file's own title on /documents.
        loading: "lazy",
        draggable: "false",
      }),
    ];
  },
});

"use client";

import { TaskItem } from "@tiptap/extension-list";

/**
 * The checklist item, plus one attribute: `todoId`.
 *
 * Phase 4 of memory/notes_module_plan.md. A tick-box line in a note can be
 * promoted into a real `todos` row — the same row type as every other to-do in
 * COS, so it inherits the reminder cron, the push and the morning digest. The id
 * of that row is written onto the line so that:
 *
 *  • the same line cannot be promoted twice, and
 *  • the line can show that it is already on the owner's plate.
 *
 * ⚠️ The id in the document is a POINTER, not the truth. The owner can delete the
 * to-do from the to-do list, which knows nothing about notes, so the editor asks
 * the server which ids are still live (`noteTodoStates`) rather than believing
 * what its own document says. A stale pointer shows as un-promoted, which is the
 * safe way round — the worst case is promoting it again.
 *
 * Extending the extension rather than writing a new node keeps every behaviour
 * TaskItem already has (nesting, Enter/Backspace handling, the checkbox) and
 * costs four lines.
 */
export const NoteTaskItem = TaskItem.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      todoId: {
        default: null,
        parseHTML: (el) => {
          const raw = el.getAttribute("data-todo-id");
          const n = Number(raw);
          return Number.isInteger(n) && n > 0 ? n : null;
        },
        renderHTML: (attrs) => (attrs.todoId ? { "data-todo-id": String(attrs.todoId) } : {}),
      },
    };
  },
});

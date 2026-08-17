"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { TaskList, TaskItem } from "@tiptap/extension-list";
import { useState } from "react";
import { Bold, Italic, Strikethrough, List, ListOrdered, ListChecks, Quote, Code2, Minus, Undo2, Redo2, Heading1, Heading2 } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * PHASE 0 SPIKE — throwaway. Answers four questions before a schema is written:
 *
 *  1. Does Tiptap render in the App Router without a hydration mismatch?
 *     (`immediatelyRender: false` is mandatory — see memory/notes_module_plan.md §2.)
 *  2. Does it take Desk styling, or does it drag its own look in?
 *  3. Do the two storage columns the plan wants — `body_json` + `body_text` —
 *     really fall out of the editor for free? (Shown live in the panel below.)
 *  4. What does it cost in JavaScript? (Measured from a production build, not here.)
 *
 * Delete this file and `src/app/lab/notes-editor/` when Phase 1 starts — the real
 * editor will not look like this.
 */

/** Desk ladder: 28px secondary controls, 6px corners, one blue. */
const btn = "inline-flex h-7 min-w-7 items-center justify-center gap-1 rounded-md px-1.5 text-[12px] font-medium transition-colors";

export function NoteEditorSpike() {
  const [saved, setSaved] = useState<string>("not typed yet");

  const editor = useEditor({
    // THE line that matters under SSR. Without it: hydration mismatch on every load.
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, HTMLAttributes: { class: "text-accent underline underline-offset-2" } },
      }),
      Placeholder.configure({ placeholder: "Write anything — rough is fine…" }),
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    content:
      "<h2>Spike</h2><p>Type here. <strong>Bold</strong>, <em>italic</em>, a list, a checkbox:</p><ul data-type=\"taskList\"><li data-type=\"taskItem\" data-checked=\"false\"><div><p>tick me</p></div></li></ul>",
    editorProps: {
      attributes: {
        // The canvas is deliberately NOT 13px Desk body text: a writing surface
        // wants a comfortable size and measure. Documented exception (plan §4).
        class: "note-canvas outline-none",
      },
    },
    onUpdate: ({ editor }) => {
      const json = editor.getJSON();
      const text = editor.getText();
      setSaved(`json ${JSON.stringify(json).length} chars · text ${text.length} chars · ${text.trim().split(/\s+/).filter(Boolean).length} words`);
    },
  });

  if (!editor) {
    // Reserve the space so the page doesn't jump when the editor mounts.
    return <div className="h-64 rounded-md border border-border bg-bg-elev" aria-hidden />;
  }

  const on = (active: boolean) =>
    active ? "bg-accent text-accent-fg" : "text-fg-muted hover:bg-bg-muted hover:text-fg";

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar built from the Desk kit's own shapes — testing question 2. */}
      <div className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-bg-elev p-1">
        <button type="button" title="Undo" onClick={() => editor.chain().focus().undo().run()} className={cn(btn, on(false))}><Undo2 size={13} /></button>
        <button type="button" title="Redo" onClick={() => editor.chain().focus().redo().run()} className={cn(btn, on(false))}><Redo2 size={13} /></button>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        <button type="button" title="Heading 1" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} className={cn(btn, on(editor.isActive("heading", { level: 1 })))}><Heading1 size={13} /></button>
        <button type="button" title="Heading 2" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={cn(btn, on(editor.isActive("heading", { level: 2 })))}><Heading2 size={13} /></button>
        <button type="button" title="Bold" onClick={() => editor.chain().focus().toggleBold().run()} className={cn(btn, on(editor.isActive("bold")))}><Bold size={13} /></button>
        <button type="button" title="Italic" onClick={() => editor.chain().focus().toggleItalic().run()} className={cn(btn, on(editor.isActive("italic")))}><Italic size={13} /></button>
        <button type="button" title="Strikethrough" onClick={() => editor.chain().focus().toggleStrike().run()} className={cn(btn, on(editor.isActive("strike")))}><Strikethrough size={13} /></button>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        <button type="button" title="Bullet list" onClick={() => editor.chain().focus().toggleBulletList().run()} className={cn(btn, on(editor.isActive("bulletList")))}><List size={13} /></button>
        <button type="button" title="Numbered list" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={cn(btn, on(editor.isActive("orderedList")))}><ListOrdered size={13} /></button>
        <button type="button" title="Checklist" onClick={() => editor.chain().focus().toggleTaskList().run()} className={cn(btn, on(editor.isActive("taskList")))}><ListChecks size={13} /></button>
        <button type="button" title="Quote" onClick={() => editor.chain().focus().toggleBlockquote().run()} className={cn(btn, on(editor.isActive("blockquote")))}><Quote size={13} /></button>
        <button type="button" title="Code block" onClick={() => editor.chain().focus().toggleCodeBlock().run()} className={cn(btn, on(editor.isActive("codeBlock")))}><Code2 size={13} /></button>
        <button type="button" title="Divider" onClick={() => editor.chain().focus().setHorizontalRule().run()} className={cn(btn, on(false))}><Minus size={13} /></button>
      </div>

      <div className="rounded-md border border-border bg-bg-elev px-4 py-3">
        <EditorContent editor={editor} />
      </div>

      {/* Question 3: the two columns the plan wants, straight off the editor. */}
      <p className="text-[11px] text-fg-muted" data-spike-readout>
        body_json + body_text: {saved}
      </p>
    </div>
  );
}

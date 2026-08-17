"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { TaskList, TaskItem } from "@tiptap/extension-list";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, List, ListOrdered, ListChecks,
  Quote, Code2, Minus, Undo2, Redo2, Heading1, Heading2, Heading3, Link2, Check, Loader2, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { saveNoteBody } from "@/app/notes/actions";

/**
 * The note canvas. Phase 1 of memory/notes_module_plan.md.
 *
 * Grown out of the Phase 0 spike, which established three things this file relies
 * on: `immediatelyRender: false` is mandatory under SSR, StarterKit v3 already
 * carries link/underline/lists/code/undo, and `getJSON()` + `getText()` give us the
 * two columns the table stores. It is mounted through `note-editor-mount.tsx`
 * because Next 16 refuses `ssr: false` inside a Server Component.
 *
 * Autosave: debounced, and guarded by the row's `updated_at`. If the note changed
 * elsewhere the save is REFUSED rather than applied — the owner keeps what they are
 * typing and is told, which is the only honest way to handle two open tabs.
 */

type SaveState =
  | { kind: "idle" }
  | { kind: "dirty" }
  | { kind: "saving" }
  | { kind: "saved"; at: string }
  | { kind: "stale" }
  | { kind: "error"; message: string };

const AUTOSAVE_MS = 900;

/** Desk ladder: 28px secondary controls, 6px corners. */
const btn = "inline-flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 transition-colors";

export function NoteEditor({
  noteId,
  initialBody,
  initialUpdatedAt,
}: {
  noteId: number;
  initialBody: unknown;
  initialUpdatedAt: string;
}) {
  const [state, setState] = useState<SaveState>({ kind: "idle" });
  // The timestamp the server last confirmed. The staleness guard compares against
  // this, so it has to be a ref: the debounced timer closes over it.
  const seenUpdatedAt = useRef(initialUpdatedAt);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorRef = useRef<Editor | null>(null);

  const flush = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor) return;
    setState({ kind: "saving" });
    const res = await saveNoteBody({
      id: noteId,
      bodyJson: editor.getJSON(),
      bodyText: editor.getText(),
      expectedUpdatedAt: seenUpdatedAt.current,
    });
    if (res.ok) {
      seenUpdatedAt.current = res.updatedAt;
      setState({ kind: "saved", at: res.updatedAt });
    } else if (res.reason === "stale") {
      // Deliberately do NOT overwrite and do NOT reload: what is on screen is the
      // owner's most recent thinking. They decide.
      setState({ kind: "stale" });
    } else {
      setState({ kind: "error", message: res.message });
    }
  }, [noteId]);

  const editor = useEditor({
    immediatelyRender: false, // mandatory under SSR — see the Phase 0 note
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, autolink: true, HTMLAttributes: { class: "text-accent underline underline-offset-2" } },
      }),
      Placeholder.configure({ placeholder: "Write anything — rough is fine. Tidy it later." }),
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    content: (initialBody as never) ?? "",
    editorProps: { attributes: { class: "note-canvas outline-none min-h-[24rem]" } },
    onCreate: ({ editor }) => { editorRef.current = editor; },
    onUpdate: () => {
      setState((s) => (s.kind === "stale" ? s : { kind: "dirty" }));
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => { void flush(); }, AUTOSAVE_MS);
    },
  });

  // Save on the way out: closing the tab or navigating away must not lose the last
  // few seconds of typing.
  useEffect(() => {
    const onLeave = () => {
      if (timer.current) { clearTimeout(timer.current); void flush(); }
    };
    window.addEventListener("beforeunload", onLeave);
    return () => {
      window.removeEventListener("beforeunload", onLeave);
      onLeave();
    };
  }, [flush]);

  // ⌘S / Ctrl+S saves now, because people press it whatever you tell them.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (timer.current) clearTimeout(timer.current);
        void flush();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flush]);

  if (!editor) return <div className="min-h-[24rem] rounded-md border border-border bg-bg-elev" aria-hidden />;

  const tone = (active: boolean) => (active ? "bg-accent text-accent-fg" : "text-fg-muted hover:bg-bg-muted hover:text-fg");

  const setLink = () => {
    const previous = editor.getAttributes("link").href as string | undefined;
    const href = window.prompt("Link to (leave empty to remove)", previous ?? "https://");
    if (href === null) return;
    if (!href.trim()) { editor.chain().focus().unsetLink().run(); return; }
    editor.chain().focus().extendMarkRange("link").setLink({ href: href.trim() }).run();
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Toolbar. Phase 2 adds the `/` menu; until then every control is visible,
          because a formatting tool you cannot find does not exist. */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-1 rounded-md border border-border bg-bg-elev p-1">
        <button type="button" title="Undo" onClick={() => editor.chain().focus().undo().run()} className={cn(btn, tone(false))}><Undo2 size={13} /></button>
        <button type="button" title="Redo" onClick={() => editor.chain().focus().redo().run()} className={cn(btn, tone(false))}><Redo2 size={13} /></button>
        <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />
        <button type="button" title="Heading 1" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} className={cn(btn, tone(editor.isActive("heading", { level: 1 })))}><Heading1 size={13} /></button>
        <button type="button" title="Heading 2" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={cn(btn, tone(editor.isActive("heading", { level: 2 })))}><Heading2 size={13} /></button>
        <button type="button" title="Heading 3" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} className={cn(btn, tone(editor.isActive("heading", { level: 3 })))}><Heading3 size={13} /></button>
        <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />
        <button type="button" title="Bold" onClick={() => editor.chain().focus().toggleBold().run()} className={cn(btn, tone(editor.isActive("bold")))}><Bold size={13} /></button>
        <button type="button" title="Italic" onClick={() => editor.chain().focus().toggleItalic().run()} className={cn(btn, tone(editor.isActive("italic")))}><Italic size={13} /></button>
        <button type="button" title="Underline" onClick={() => editor.chain().focus().toggleUnderline().run()} className={cn(btn, tone(editor.isActive("underline")))}><UnderlineIcon size={13} /></button>
        <button type="button" title="Strikethrough" onClick={() => editor.chain().focus().toggleStrike().run()} className={cn(btn, tone(editor.isActive("strike")))}><Strikethrough size={13} /></button>
        <button type="button" title="Link" onClick={setLink} className={cn(btn, tone(editor.isActive("link")))}><Link2 size={13} /></button>
        <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />
        <button type="button" title="Bullet list" onClick={() => editor.chain().focus().toggleBulletList().run()} className={cn(btn, tone(editor.isActive("bulletList")))}><List size={13} /></button>
        <button type="button" title="Numbered list" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={cn(btn, tone(editor.isActive("orderedList")))}><ListOrdered size={13} /></button>
        <button type="button" title="Checklist" onClick={() => editor.chain().focus().toggleTaskList().run()} className={cn(btn, tone(editor.isActive("taskList")))}><ListChecks size={13} /></button>
        <button type="button" title="Quote" onClick={() => editor.chain().focus().toggleBlockquote().run()} className={cn(btn, tone(editor.isActive("blockquote")))}><Quote size={13} /></button>
        <button type="button" title="Code block" onClick={() => editor.chain().focus().toggleCodeBlock().run()} className={cn(btn, tone(editor.isActive("codeBlock")))}><Code2 size={13} /></button>
        <button type="button" title="Divider" onClick={() => editor.chain().focus().setHorizontalRule().run()} className={cn(btn, tone(false))}><Minus size={13} /></button>

        <span className="grow" />
        <SaveBadge state={state} />
      </div>

      <div className="rounded-md border border-border bg-bg-elev px-4 py-3">
        <EditorContent editor={editor} />
      </div>

      {state.kind === "stale" && (
        <p className="flex items-start gap-2 rounded-md border border-warn/30 bg-warn-soft/40 px-3 py-2 text-[12px] text-fg">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warn" />
          <span>
            This note was changed somewhere else — maybe another tab. <strong>Nothing you have typed here is lost</strong>,
            and nothing has been overwritten. Copy what you need, then reload the page to see the other version.
          </span>
        </p>
      )}
    </div>
  );
}

function SaveBadge({ state }: { state: SaveState }) {
  const base = "inline-flex h-7 items-center gap-1.5 px-2 text-[11px] font-medium";
  if (state.kind === "saving") return <span className={cn(base, "text-fg-muted")}><Loader2 size={12} className="animate-spin" /> Saving…</span>;
  if (state.kind === "saved") return <span className={cn(base, "text-success")}><Check size={12} /> Saved</span>;
  if (state.kind === "dirty") return <span className={cn(base, "text-fg-subtle")}>Unsaved…</span>;
  if (state.kind === "stale") return <span className={cn(base, "text-warn")}><AlertTriangle size={12} /> Changed elsewhere</span>;
  if (state.kind === "error") return <span className={cn(base, "text-danger")} title={state.message}><AlertTriangle size={12} /> Not saved</span>;
  // Idle renders NOTHING. It used to say "Saved", which was indistinguishable from a
  // save that had just happened — so the badge claimed credit for work it had not
  // done. Silence is the honest state before the first keystroke.
  return null;
}

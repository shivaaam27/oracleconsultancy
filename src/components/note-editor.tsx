"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { TaskList, TaskItem } from "@tiptap/extension-list";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, List, ListOrdered, ListChecks,
  Quote, Code2, Minus, Undo2, Redo2, Link2, Check, Loader2, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { FluidSelect, type FluidOption } from "@/components/fluid-select";
import { saveNoteBody, renameNote } from "@/app/notes/actions";

/**
 * The note sheet: title and body on ONE piece of paper.
 *
 * The first cut of this was four stacked bordered boxes — title box, meta box,
 * toolbar box, body box — which is what the owner rightly called ugly. A note should
 * read as a sheet you write on, so: one surface, a quiet toolbar strip along its top,
 * and the title living INSIDE the paper rather than in a form field above it.
 *
 * Three specifics that were wrong and are fixed here:
 *  • the title wore the app's global input chrome (a stray 0.8px box, and a blue ring
 *    on click). It uses `.bare-field` now — the documented opt-out in globals.css.
 *  • three separate H1/H2/H3 buttons became one "style" menu, which is how every
 *    editor worth copying does it.
 *  • selecting text now raises a small bubble menu, so the common marks are where
 *    your eyes already are.
 */

type SaveState =
  | { kind: "idle" }
  | { kind: "dirty" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "stale" }
  | { kind: "error"; message: string };

const AUTOSAVE_MS = 900;

const STYLE_OPTIONS: FluidOption[] = [
  { value: "p", label: "Body" },
  { value: "h1", label: "Heading 1" },
  { value: "h2", label: "Heading 2" },
  { value: "h3", label: "Heading 3" },
];

export function NoteEditor({
  noteId,
  initialTitle,
  initialBody,
  initialUpdatedAt,
}: {
  noteId: number;
  initialTitle: string;
  initialBody: unknown;
  initialUpdatedAt: string;
}) {
  const [state, setState] = useState<SaveState>({ kind: "idle" });
  const [title, setTitle] = useState(initialTitle);
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
      setState({ kind: "saved" });
    } else if (res.reason === "stale") {
      setState({ kind: "stale" });
    } else {
      setState({ kind: "error", message: res.message });
    }
  }, [noteId]);

  const editor = useEditor({
    immediatelyRender: false, // mandatory under SSR (Phase 0 finding)
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, autolink: true, HTMLAttributes: { class: "text-accent underline underline-offset-2" } },
      }),
      Placeholder.configure({ placeholder: "Start writing. Rough is fine — tidy it later." }),
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    content: (initialBody as never) ?? "",
    editorProps: { attributes: { class: "note-canvas outline-none" } },
    onCreate: ({ editor }) => { editorRef.current = editor; },
    onUpdate: () => {
      setState((s) => (s.kind === "stale" ? s : { kind: "dirty" }));
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => { void flush(); }, AUTOSAVE_MS);
    },
  });

  // Save on the way out — closing the tab must not cost the last few seconds.
  useEffect(() => {
    const onLeave = () => { if (timer.current) { clearTimeout(timer.current); void flush(); } };
    window.addEventListener("beforeunload", onLeave);
    return () => { window.removeEventListener("beforeunload", onLeave); onLeave(); };
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

  const commitTitle = () => {
    if (title.trim() === initialTitle.trim()) return;
    void renameNote(noteId, title);
  };

  if (!editor) {
    return <div className="min-h-[70vh] rounded-lg border border-border bg-bg-elev" aria-hidden />;
  }

  const currentStyle =
    editor.isActive("heading", { level: 1 }) ? "h1" :
    editor.isActive("heading", { level: 2 }) ? "h2" :
    editor.isActive("heading", { level: 3 }) ? "h3" : "p";

  const setStyle = (key: string) => {
    const chain = editor.chain().focus();
    if (key === "p") chain.setParagraph().run();
    else chain.setHeading({ level: Number(key.slice(1)) as 1 | 2 | 3 }).run();
  };

  return (
    /* ONE sheet. The toolbar is a strip along its top, separated by a hairline —
       not a floating box of its own. */
    <div className="flex h-[calc(100dvh-11rem)] min-h-[24rem] flex-col overflow-hidden rounded-lg border border-border bg-bg-elev shadow-sm">
      <div className="flex shrink-0 flex-wrap items-center gap-0.5 border-b border-border bg-bg-subtle/80 px-2 py-1.5">
        <ToolButton title="Undo" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}><Undo2 size={14} /></ToolButton>
        <ToolButton title="Redo" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}><Redo2 size={14} /></ToolButton>

        <Divider />

        {/* One style menu instead of three heading buttons — and the app's own
            anchored dropdown, not a native <select>: the OS popup ignores our
            styling and looks wrong on a flat toolbar, which is exactly why
            combobox.tsx replaced every native datalist in this codebase. */}
        <FluidSelect
          value={currentStyle}
          options={STYLE_OPTIONS}
          onSelect={setStyle}
          buttonClassName="h-7 min-w-[6.5rem] justify-between rounded-md border-0 bg-transparent px-2 text-[12px] font-medium text-fg hover:bg-bg-muted"
        />

        <Divider />

        <ToolButton title="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}><Bold size={14} /></ToolButton>
        <ToolButton title="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic size={14} /></ToolButton>
        <ToolButton title="Underline" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon size={14} /></ToolButton>
        <ToolButton title="Strikethrough" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough size={14} /></ToolButton>
        <ToolButton title="Link" active={editor.isActive("link")} onClick={() => promptLink(editor)}><Link2 size={14} /></ToolButton>

        <Divider />

        <ToolButton title="Bulleted list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}><List size={14} /></ToolButton>
        <ToolButton title="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered size={14} /></ToolButton>
        <ToolButton title="Checklist" active={editor.isActive("taskList")} onClick={() => editor.chain().focus().toggleTaskList().run()}><ListChecks size={14} /></ToolButton>

        <Divider />

        <ToolButton title="Quote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote size={14} /></ToolButton>
        <ToolButton title="Code block" active={editor.isActive("codeBlock")} onClick={() => editor.chain().focus().toggleCodeBlock().run()}><Code2 size={14} /></ToolButton>
        <ToolButton title="Divider" onClick={() => editor.chain().focus().setHorizontalRule().run()}><Minus size={14} /></ToolButton>

        <span className="grow" />
        <SaveBadge state={state} />
      </div>

      {/* Selecting text raises the marks where the eyes already are. */}
      <BubbleMenu editor={editor} className="flex items-center gap-0.5 rounded-md border border-border bg-bg-elev p-1 shadow-md">
        <ToolButton title="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}><Bold size={13} /></ToolButton>
        <ToolButton title="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic size={13} /></ToolButton>
        <ToolButton title="Underline" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon size={13} /></ToolButton>
        <ToolButton title="Link" active={editor.isActive("link")} onClick={() => promptLink(editor)}><Link2 size={13} /></ToolButton>
      </BubbleMenu>

      {/* The paper. Generous padding, and the writing measured to ~68 characters —
          the title sits in here too, which is what makes it feel like one sheet. */}
      <div
        className="min-h-0 flex-1 cursor-text overflow-y-auto px-6 py-7 sm:px-10 sm:py-9"
        onMouseDown={(e) => {
          // Only when the padding itself is clicked — never steal a click aimed at
          // the text, a link or the title.
          if (e.target !== e.currentTarget) return;
          e.preventDefault();
          editor.chain().focus("end").run();
        }}
      >
        <div className="mx-auto w-full max-w-[68ch]">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); commitTitle(); editor.chain().focus().run(); }
            }}
            placeholder="Title"
            aria-label="Note title"
            /* `.bare-field` is the documented opt-out from the global input well +
               focus ring (globals.css). Without it this field draws a stray box and
               flashes blue when clicked — the owner's first complaint. */
            className="bare-field mb-1 w-full text-[26px] font-semibold leading-tight tracking-[-0.01em] text-fg outline-none placeholder:text-fg-subtle/60"
          />
          <EditorContent editor={editor} />
        </div>
      </div>

      {state.kind === "stale" && (
        <p className="flex items-start gap-2 border-t border-warn/30 bg-warn-soft/40 px-6 py-3 text-[12px] text-fg">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warn" />
          <span>
            This note changed somewhere else — probably another tab. <strong>Nothing you have typed is lost</strong> and
            nothing has been overwritten. Copy what you need, then reload to see the other version.
          </span>
        </p>
      )}
    </div>
  );
}

function promptLink(editor: Editor) {
  const previous = editor.getAttributes("link").href as string | undefined;
  const href = window.prompt("Link to (leave empty to remove)", previous ?? "https://");
  if (href === null) return;
  if (!href.trim()) { editor.chain().focus().unsetLink().run(); return; }
  editor.chain().focus().extendMarkRange("link").setLink({ href: href.trim() }).run();
}

function Divider() {
  return <span className="mx-1 h-4 w-px shrink-0 bg-border" aria-hidden />;
}

/** 28px, 6px corners — the Desk secondary tier. Active is the SOFT accent, not a
 *  solid blue fill: a toolbar of solid blue chips shouts over the writing. */
function ToolButton({
  title, onClick, active = false, disabled = false, children,
}: {
  title: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors disabled:opacity-40",
        active ? "bg-accent-soft text-accent" : "text-fg-muted hover:bg-bg-muted hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

function SaveBadge({ state }: { state: SaveState }) {
  const base = "inline-flex h-7 items-center gap-1.5 px-2 text-[11px] font-medium";
  if (state.kind === "saving") return <span className={cn(base, "text-fg-muted")}><Loader2 size={12} className="animate-spin" /> Saving…</span>;
  if (state.kind === "saved") return <span className={cn(base, "text-success")}><Check size={12} /> Saved</span>;
  if (state.kind === "dirty") return <span className={cn(base, "text-fg-subtle")}>Editing…</span>;
  if (state.kind === "stale") return <span className={cn(base, "text-warn")}><AlertTriangle size={12} /> Changed elsewhere</span>;
  if (state.kind === "error") return <span className={cn(base, "text-danger")} title={state.message}><AlertTriangle size={12} /> Not saved</span>;
  // Idle says nothing: claiming "Saved" before a keystroke is a lie.
  return null;
}

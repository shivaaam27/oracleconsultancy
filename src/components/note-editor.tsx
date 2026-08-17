"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import type { Content } from "@tiptap/core";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { TaskList } from "@tiptap/extension-list";
import { NoteTaskItem } from "@/components/note-task-item";
import { Table, TableRow, TableCell, TableHeader } from "@tiptap/extension-table";
import { SlashCommands } from "@/components/note-slash-menu";
import { Mention, MentionPickers } from "@/components/note-mention";
import { ActiveLine } from "@/components/note-active-line";
import { NoteImage } from "@/components/note-image";
import { Callout, CALLOUT_TONES, CALLOUT_TONE_LABELS } from "@/components/note-callout";
import { NoteAiPanel } from "@/components/note-ai-panel";
import { attachFileAtCaret, filesFrom } from "@/lib/note-upload";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, List, ListOrdered, ListChecks,
  Quote, Code2, Minus, Undo2, Redo2, Link2, Check, Loader2, AlertTriangle,
  Table as TableIcon, Rows3, Columns3, Trash2, ListPlus, Bell, Paperclip, Info, GripVertical,
  Sparkles, X,
} from "lucide-react";
import { DragHandle } from "@tiptap/extension-drag-handle-react";
import { cn } from "@/lib/cn";
import { FluidSelect, type FluidOption } from "@/components/fluid-select";
import { extractMentions } from "@/lib/note-links-shared";
import { findUnlinked, findWholeWord, type LinkCandidate } from "@/lib/note-unlinked-shared";
import { useToast } from "@/components/toast";
import { noteTodoStates, promoteNoteLine, reindexNote, removeNoteTodo, saveNoteBody } from "@/app/notes/actions";

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
/** How long the writing must stop before the note is re-embedded. Deliberately far
 *  longer than the autosave — see `scheduleReindex`. */
const REINDEX_IDLE_MS = 20_000;

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
  candidates,
}: {
  noteId: number;
  initialTitle: string;
  initialBody: unknown;
  initialUpdatedAt: string;
  candidates: LinkCandidate[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [state, setState] = useState<SaveState>({ kind: "idle" });
  const [title, setTitle] = useState(initialTitle);
  /** The title as `flush` should send it. A ref as well as state because `flush`
   *  is a `useCallback` and would otherwise close over a stale title. */
  const titleRef = useRef(initialTitle);
  const titleField = useRef<HTMLTextAreaElement | null>(null);
  const seenUpdatedAt = useRef(initialUpdatedAt);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorRef = useRef<Editor | null>(null);
  /** Which records the note mentions, as one comparable string. Seeded from the
   *  body we were given, so the first save after a reload does not refresh for
   *  nothing. */
  const seenMentions = useRef(mentionSignature(initialBody));
  /** A save is in the air / another was asked for while it was. See `flush`. */
  const saving = useRef(false);
  const pendingSave = useRef(false);

  const flush = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor) return;

    /* ⚠️ ONE SAVE AT A TIME. Without this guard the editor reports "Changed
       elsewhere" against ITSELF, which is the worst possible false alarm: the
       warning exists to mean "another tab has your note", and it was firing while
       one person typed in one window.

       How it happened: save A goes out carrying timestamp T0 and is still in
       flight when the debounce fires save B — which also carries T0, because A has
       not come back yet to move it on. A lands and the row becomes T1, so B's
       precondition no longer matches and the server correctly calls it stale. The
       concurrency guard was doing its job; there were simply two writers, and both
       of them were us.

       So saves are serialised. A save asked for while one is running does not
       queue up behind it — it just sets a flag, and ONE more save runs at the end
       with whatever the document says by then, which is the only version that
       matters. Found while testing Phase 3; it predates it. */
    if (saving.current) { pendingSave.current = true; return; }
    saving.current = true;

    setState({ kind: "saving" });
    const bodyJson = plainDoc(editor.getJSON());
    const bodyText = editor.getText();
    // The unlinked-mention scan runs off this, so it refreshes once per save
    // rather than once per keystroke.
    setDocText(bodyText);
    const res = await saveNoteBody({
      id: noteId,
      bodyJson,
      bodyText,
      /* ⚠️ THE TITLE GOES WITH THE BODY, in the same statement. It used to have
         its own `renameNote` action, and that made the title a SECOND writer to
         the row: renaming bumped `updated_at` where the editor could not see it,
         so the very next keystroke saved against a timestamp that had moved and
         came back stale. The note then showed "Changed elsewhere" and **stopped
         saving the body** — after nothing more unusual than typing a title, which
         is what everyone does first. Measured and reproduced, Phase 3.
         One row, one writer, one precondition. Do not split them again. */
      title: titleRef.current,
      expectedUpdatedAt: seenUpdatedAt.current,
    });
    saving.current = false;

    if (res.ok) {
      seenUpdatedAt.current = res.updatedAt;
      setState({ kind: "saved" });
      // The Links rail is server-rendered, so it would sit stale until a reload.
      // Refresh it — but ONLY when the set of mentions actually changed, never on
      // an ordinary keystroke batch: `router.refresh()` re-runs the page's server
      // components, and doing that every 900ms while someone is writing is both
      // wasteful and a good way to make the editor feel laggy. (It preserves
      // client state, so the editor itself is untouched either way.)
      const signature = mentionSignature(bodyJson);
      if (signature !== seenMentions.current) {
        seenMentions.current = signature;
        router.refresh();
      }
      // The writing changed, so the index is now behind. Start the long idle clock.
      scheduleReindex();
    } else if (res.reason === "stale") {
      setState({ kind: "stale" });
    } else {
      setState({ kind: "error", message: res.message });
    }

    // Someone asked to save while that one was in the air. Run once more, now.
    // Not after a stale or an error though: repeating a save the server has just
    // refused would spin, and the owner needs to see the warning stay put.
    if (pendingSave.current) {
      pendingSave.current = false;
      if (res.ok) void flushRef.current?.();
    }
  }, [noteId, router]);

  // `flush` calls itself for the queued save, so it needs a stable handle on its
  // own latest version — a plain recursive reference would capture a stale one.
  const flushRef = useRef(flush);
  flushRef.current = flush;

  /* -------- "you wrote it but did not link it" (unlinked mentions) -------- */

  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [docText, setDocText] = useState("");

  /** Recomputed from the plain text on every save, not every keystroke — scanning
   *  the whole note against every company, person and open task code on each
   *  character would be work nobody asked for. */
  const unlinked = useMemo(() => {
    if (candidates.length === 0 || !docText.trim()) return [];
    const linked = new Set(mentionSignature(editorRef.current?.getJSON()).split(",").filter(Boolean));
    return findUnlinked(docText, candidates, linked).filter((c) => !dismissed.has(`${c.entity}:${c.id}`));
  }, [candidates, docText, dismissed]);

  /**
   * Accept a suggestion: find where the name is written and turn THAT TEXT into a
   * real mention.
   *
   * ⚠️ It deliberately does not just insert a link row. Links are derived from the
   * document, so a row written on the side would be wiped by the next save — and
   * more importantly the note would then claim a link its own words knew nothing
   * about. Rewriting the text keeps one mechanism and one source of truth.
   */
  const linkSuggestion = (c: LinkCandidate) => {
    const editor = editorRef.current;
    if (!editor) return;

    let found: { from: number; to: number } | null = null;
    editor.state.doc.descendants((node, pos) => {
      if (found || !node.isText || !node.text) return true;
      const at = findWholeWord(node.text, c.needle);
      if (at === -1) return true;
      found = { from: pos + at, to: pos + at + c.needle.length };
      return false;
    });

    if (!found) {
      // The words moved between the scan and the click.
      toast("That text has changed — it is not there any more.", { tone: "danger" });
      setDismissed((s) => new Set(s).add(`${c.entity}:${c.id}`));
      return;
    }

    const { from, to } = found;
    editor
      .chain()
      .focus()
      .insertContentAt({ from, to }, {
        type: "mention",
        attrs: { entity: c.entity, id: c.id, code: c.code, label: c.label },
      })
      .run();

    if (timer.current) clearTimeout(timer.current);
    void flush();
    toast(`Linked ${c.label}.`, { tone: "success" });
  };

  /* ---------------- attachments: files and pictures ---------------- */

  const [uploading, setUploading] = useState(0);
  const fileInput = useRef<HTMLInputElement | null>(null);

  /**
   * One file at a time, in the order they were given. Sequential rather than
   * parallel on purpose: each insert moves the caret, and firing several uploads
   * at once would race to insert at a position the others had already shifted.
   */
  const attachFiles = useCallback(async (files: File[]) => {
    const editor = editorRef.current;
    if (!editor || files.length === 0) return;
    setUploading((n) => n + files.length);
    try {
      for (const file of files) {
        const res = await attachFileAtCaret(editor, noteId, file);
        if (!res.ok) { toast(res.error, { tone: "danger" }); continue; }
        // Save straight away. The picture asks `/api/notes/file/<id>` for its bytes
        // immediately, and that route only serves files a note actually links to —
        // so the document must not be left waiting on the next autosave.
        if (timer.current) clearTimeout(timer.current);
        await flushRef.current?.();
        router.refresh();
      }
    } finally {
      setUploading((n) => Math.max(0, n - files.length));
    }
  }, [noteId, router, toast]);

  /** Shared by paste and drop. Returns true when it has taken the files, which
   *  tells ProseMirror not to also handle the event. */
  const takeFiles = useCallback((data: DataTransfer | null): boolean => {
    const files = filesFrom(data);
    if (files.length === 0) return false;
    void attachFiles(files);
    return true;
  }, [attachFiles]);

  /* ---------------- checklist lines → real to-dos (Phase 4) ---------------- */

  /**
   * Which promoted lines still have a live to-do behind them, keyed by id.
   *
   * ⚠️ The `todoId` written into the document is a POINTER, not the truth. The
   * owner can delete a to-do from the to-do list, which knows nothing about notes,
   * and the line would then claim to be on a list it had fallen off. So the ids in
   * the document are checked against the database when the note opens, and a line
   * whose to-do has gone simply offers to promote again — the safe way round.
   */
  const [livePromotions, setLivePromotions] = useState<Record<number, boolean>>({});
  const [promoting, setPromoting] = useState(false);

  useEffect(() => {
    const ids = promotedIds(initialBody);
    if (ids.length === 0) return;
    let live = true;
    void noteTodoStates(ids)
      .then((states) => { if (live) setLivePromotions(states); })
      .catch(() => { /* a stale badge is not worth an error */ });
    return () => { live = false; };
  }, [initialBody]);

  const promoteLine = async (target: TaskLine, when: "tomorrow" | null) => {
    setPromoting(true);
    try {
      // 09:00 tomorrow, local — the hour the owner's day starts, and the same hour
      // the morning digest goes out, so a reminder lands with everything else.
      let remindAt: string | null = null;
      if (when === "tomorrow") {
        const at = new Date();
        at.setDate(at.getDate() + 1);
        at.setHours(9, 0, 0, 0);
        remindAt = at.toISOString();
      }
      const res = await promoteNoteLine({ noteId, title: target.text, remindAt });
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }

      // Write the id onto the line, then save at once — if the note were closed
      // before the next autosave the to-do would exist with nothing pointing at it,
      // and the line would offer to promote all over again.
      editorRef.current
        ?.chain()
        .focus()
        .command(({ tr }) => { tr.setNodeAttribute(target.pos, "todoId", res.todoId); return true; })
        .run();
      setLivePromotions((m) => ({ ...m, [res.todoId]: false }));
      if (timer.current) clearTimeout(timer.current);
      void flush();

      toast(remindAt ? "On your to-do list — you'll be reminded at 9am." : "On your to-do list.", { tone: "success" });
      router.refresh();
    } finally {
      setPromoting(false);
    }
  };

  const unpromoteLine = async (target: TaskLine) => {
    if (target.todoId == null) return;
    const res = await removeNoteTodo(target.todoId, noteId);
    if (!res.ok) { toast("Could not remove that to-do.", { tone: "danger" }); return; }
    editorRef.current
      ?.chain()
      .focus()
      .command(({ tr }) => { tr.setNodeAttribute(target.pos, "todoId", null); return true; })
      .run();
    setLivePromotions((m) => { const next = { ...m }; delete next[target.todoId!]; return next; });
    if (timer.current) clearTimeout(timer.current);
    void flush();
    toast("Taken off your to-do list.", { tone: "success" });
    router.refresh();
  };

  const editor = useEditor({
    immediatelyRender: false, // mandatory under SSR (Phase 0 finding)
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, autolink: true, HTMLAttributes: { class: "text-accent underline underline-offset-2" } },
      }),
      // The placeholder is where `/` and `@` are actually discovered — there is no
      // other tutorial, and a gesture nobody knows about does not exist.
      Placeholder.configure({ placeholder: "Start writing. Press / for headings and tables, @ to link a task or person…" }),
      TaskList,
      // TaskItem + a `todoId`, so a ticked line can be promoted to a real to-do
      // and cannot be promoted twice — see note-task-item.tsx.
      NoteTaskItem.configure({ nested: true }),
      // Tables: resizable columns, and a header row by default from the / menu.
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      // `/` on an empty line opens the block menu — see note-slash-menu.tsx.
      SlashCommands,
      // `@` links a task/person/company/document, `[[` links another note. The
      // `note_links` rows are derived from these nodes on save, the same way
      // `#tags` come out of the text — see note-mention.tsx.
      Mention,
      MentionPickers.configure({ noteId }),
      // A soft band behind the line you are on, so your place is findable on a big
      // white sheet — see note-active-line.tsx. Drop this line to remove it.
      ActiveLine,
      // Pictures. The src is a permanent route, never a signed URL — see
      // note-image.tsx for why that matters to a note read years later.
      NoteImage,
      // The boxed aside — blockquote says "someone said this", a callout says
      // "do not miss this". Three tones, styled entirely from `data-tone` in CSS.
      Callout,
    ],
    editorProps: {
      attributes: { class: "note-canvas outline-none" },
      /* Paste a screenshot, drop a file. Both go through the SAME upload path as
         the toolbar button (lib/note-upload.ts), so there is one place where a
         file becomes a document and a link. Returning false for anything without
         files leaves ordinary text paste and drag-to-reorder untouched. */
      handlePaste: (_view, event) => takeFiles(event.clipboardData),
      handleDrop: (_view, event) => takeFiles((event as DragEvent).dataTransfer),
    },
    content: (initialBody as never) ?? "",
    onCreate: ({ editor }) => { editorRef.current = editor; },
    onUpdate: () => {
      setState((s) => (s.kind === "stale" ? s : { kind: "dirty" }));
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => { void flush(); }, AUTOSAVE_MS);
    },
  });

  /* Put the note in the search index once the writing has genuinely stopped.
     ⚠️ NOT on save. Autosave fires about a second after the last keystroke, and
     re-embedding on that cadence is money on fire for no benefit — nobody searches
     for a sentence they are still typing. 20 seconds of quiet, and again when the
     note is closed; the nightly reindex sweep is the backstop. */
  const indexTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleReindex = useCallback(() => {
    if (indexTimer.current) clearTimeout(indexTimer.current);
    indexTimer.current = setTimeout(() => { void reindexNote(noteId); }, REINDEX_IDLE_MS);
  }, [noteId]);

  useEffect(() => {
    return () => {
      if (indexTimer.current) clearTimeout(indexTimer.current);
      // Closing the note is the clearest "I have finished" there is.
      void reindexNote(noteId);
    };
  }, [noteId]);

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

  // Clicking an @mention opens that record. The chip raises a window event rather
  // than navigating itself, because a ProseMirror plugin has no router — and a
  // `location.assign` would throw away the client router for a full page load.
  // The pending edit is flushed FIRST: leaving a note by clicking a link inside it
  // must not cost the sentence you were writing.
  useEffect(() => {
    const onOpen = (e: Event) => {
      const href = (e as CustomEvent<{ href?: string }>).detail?.href;
      if (!href) return;
      if (timer.current) clearTimeout(timer.current);
      void flush().finally(() => router.push(href));
    };
    window.addEventListener("cos:note-open", onOpen);
    return () => window.removeEventListener("cos:note-open", onOpen);
  }, [flush, router]);

  /** Typing the title marks the note dirty and rides the same debounce as the
   *  body — one writer, one save. Blur just brings that save forward. */
  const onTitleChange = (value: string) => {
    setTitle(value);
    titleRef.current = value;
    setState((s) => (s.kind === "stale" ? s : { kind: "dirty" }));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void flush(); }, AUTOSAVE_MS);
  };

  const commitTitle = () => {
    if (timer.current) clearTimeout(timer.current);
    void flush();
  };

  /* Grow the title box to its own content. `height: auto` first, or the box can
     only ever get taller — measuring `scrollHeight` against a height already set
     never reports a SMALLER number. Runs on every title change, and once on mount
     for a note that arrives with a long title already. It also has to re-run when
     the window narrows, because that is when a title starts needing two lines. */
  useEffect(() => {
    const el = titleField.current;
    if (!el) return;
    const fit = () => {
      el.style.height = "auto";
      /* `scrollHeight` measures the CONTENT box, but the element is `border-box`
         (Tailwind's default), so `height: scrollHeight` leaves the border eating
         the last 2px and clipping the descenders on the final line — measured.
         Add whatever the border and padding take. */
      const chrome = el.offsetHeight - el.clientHeight;
      el.style.height = `${el.scrollHeight + chrome}px`;
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [title, editor]);

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

  /* The checklist line the caret is in — the thing "Make a to-do" acts on. Read
     fresh on each render rather than held in state: the caret moves constantly and
     a stale copy would promote the wrong line. */
  const line = currentTaskItem(editor);
  const linePromoted = line != null && line.todoId != null && livePromotions[line.todoId] !== undefined;

  return (
    /* ONE sheet. The toolbar is a strip along its top, separated by a hairline —
       not a floating box of its own. */
    <div className="flex h-[calc(100dvh-11rem)] min-h-[24rem] flex-col overflow-hidden rounded-lg border border-border bg-bg-elev shadow-sm">
      {/* ⚠️ ONE ROW ON A PHONE, wrapping only from `sm` up. At 375px this toolbar
          wrapped to THREE rows — 71px of controls above a note before a word was
          written, on the screen with the least room to give. It scrolls sideways
          instead, so every tool is still reachable and the writing keeps its
          height. (`slim-scroll` hides the bar until it is used.) */}
      <div className="slim-scroll flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-border bg-bg-subtle/80 px-2 py-1.5 sm:flex-wrap sm:overflow-x-visible">
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

        <Divider />

        {/* You can also just paste a screenshot or drop a file onto the page —
            this is the discoverable version of the same thing. */}
        <ToolButton
          title="Attach a file or picture — or just paste one in"
          onClick={() => fileInput.current?.click()}
          disabled={uploading > 0}
        >
          {uploading > 0 ? <Loader2 size={14} className="animate-spin" /> : <Paperclip size={14} />}
        </ToolButton>
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";   // so picking the same file twice still fires
            void attachFiles(files);
          }}
        />

        <span className="grow" />
        <SaveBadge state={state} />
      </div>

      {/* A checklist line can become a real to-do — Phase 4. The bar only appears
          while the caret is IN a tick-box line, the same discipline the table bar
          follows: a permanent button that does nothing 99% of the time is what a
          lesser version ships. */}
      {line && (
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border bg-accent-soft/40 px-2 py-1">
          <span className="mr-1 inline-flex items-center gap-1.5 px-1 text-[11px] font-medium text-accent">
            <ListChecks size={12} /> Checklist
          </span>
          {linePromoted ? (
            <>
              <span className="inline-flex items-center gap-1 text-[11px] text-success">
                <Check size={12} /> On your to-do list
              </span>
              <button
                type="button"
                onClick={() => void unpromoteLine(line)}
                className="inline-flex h-6 items-center rounded-md px-1.5 text-[11px] font-medium text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg"
              >
                Take it off
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={!line.text.trim() || promoting}
                onClick={() => void promoteLine(line, null)}
                className="inline-flex h-6 items-center gap-1.5 rounded-md bg-accent px-2 text-[11px] font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                <ListPlus size={12} /> Make a to-do
              </button>
              <button
                type="button"
                disabled={!line.text.trim() || promoting}
                onClick={() => void promoteLine(line, "tomorrow")}
                className="inline-flex h-6 items-center gap-1.5 rounded-md px-1.5 text-[11px] font-medium text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg disabled:opacity-40"
              >
                <Bell size={12} /> Remind me tomorrow
              </button>
              {!line.text.trim() && <span className="px-1 text-[10.5px] text-fg-subtle">Write the line first</span>}
            </>
          )}
        </div>
      )}

      {/* Callout tone — again, only while the caret is inside one. */}
      {editor.isActive("callout") && (
        <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border bg-bg-subtle/70 px-2 py-1">
          <span className="mr-1 inline-flex items-center gap-1.5 px-1 text-[11px] font-medium text-fg-muted">
            <Info size={12} /> Callout
          </span>
          {CALLOUT_TONES.map((tone) => (
            <button
              key={tone}
              type="button"
              onClick={() => editor.chain().focus().updateAttributes("callout", { tone }).run()}
              aria-pressed={editor.isActive("callout", { tone })}
              className={cn(
                "h-6 rounded-md px-2 text-[11px] font-medium transition-colors",
                editor.isActive("callout", { tone })
                  ? "bg-accent-soft text-accent"
                  : "text-fg-muted hover:bg-bg-muted hover:text-fg",
              )}
            >
              {CALLOUT_TONE_LABELS[tone]}
            </button>
          ))}
          <span className="grow" />
          <button
            type="button"
            onClick={() => editor.chain().focus().lift("callout").run()}
            className="h-6 rounded-md px-1.5 text-[11px] font-medium text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg"
          >
            Remove the box
          </button>
        </div>
      )}

      {editor.isActive("table") && (
        <div className="flex shrink-0 flex-wrap items-center gap-0.5 border-b border-border bg-accent-soft/40 px-2 py-1">
          <span className="mr-1 inline-flex items-center gap-1.5 px-1 text-[11px] font-medium text-accent">
            <TableIcon size={12} /> Table
          </span>
          <ToolButton title="Add row below" onClick={() => editor.chain().focus().addRowAfter().run()}><Rows3 size={13} /></ToolButton>
          <ToolButton title="Add column right" onClick={() => editor.chain().focus().addColumnAfter().run()}><Columns3 size={13} /></ToolButton>
          <ToolButton title="Delete row" onClick={() => editor.chain().focus().deleteRow().run()}><Rows3 size={13} className="text-danger" /></ToolButton>
          <ToolButton title="Delete column" onClick={() => editor.chain().focus().deleteColumn().run()}><Columns3 size={13} className="text-danger" /></ToolButton>
          <ToolButton title="Delete the whole table" onClick={() => editor.chain().focus().deleteTable().run()}><Trash2 size={13} className="text-danger" /></ToolButton>
          <span className="grow" />
          <span className="px-1 text-[10.5px] text-fg-muted">Tab moves to the next cell</span>
        </div>
      )}

      {/* Grab a block and move it. The handle floats beside whichever block the
          mouse is over, so nothing is added to the page until you reach for it —
          which is the only way to put a control on every paragraph without the
          note turning into a builder UI. */}
      <DragHandle editor={editor}>
        <div
          className="mr-1 flex h-6 w-4 cursor-grab items-center justify-center rounded text-fg-subtle transition-colors hover:bg-bg-muted hover:text-fg-muted active:cursor-grabbing"
          title="Drag to move this block"
          aria-hidden
        >
          <GripVertical size={13} />
        </div>
      </DragHandle>

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
        /* `overflow-y-scroll`, not `auto`: the gutter is then reserved at ALL times,
           so the centred measure cannot re-centre when a note grows past one screen —
           the text used to jump 7.6px left mid-sentence (measured). `slim-scroll`
           keeps the bar invisible until you hover, so nothing is gained visually by
           letting it appear and disappear.
           ⚠️ `scrollbarGutter` is set INLINE because Tailwind v4's Lightning CSS
           strips it out of globals.css entirely — the `.note-scroller` rule never
           reached the browser (verified: absent from the served stylesheet, while
           neighbouring rules arrived). An inline style bypasses that pipeline. */
        style={{ scrollbarGutter: "stable both-edges" }}
        className="note-scroller slim-scroll min-h-0 flex-1 cursor-text overflow-y-scroll px-6 py-7 sm:px-10 sm:py-9"
        onMouseDown={(e) => {
          // Only when the padding itself is clicked — never steal a click aimed at
          // the text, a link or the title.
          if (e.target !== e.currentTarget) return;
          e.preventDefault();
          editor.chain().focus("end").run();
        }}
      >
        <div className="mx-auto w-full max-w-[68ch]">
          {/* ⚠️ A TEXTAREA, NOT AN INPUT — the title has to WRAP.
              As a single-line input, a long title just scrolled sideways inside its
              own box: on a 375px phone the field was 294px wide holding 759px of
              text, so the owner could never see the title he had written (measured).
              A title on paper wraps, so this one does; it auto-grows to fit and
              Enter still moves to the body rather than making a second line. */}
          <textarea
            ref={titleField}
            rows={1}
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); commitTitle(); editor.chain().focus().run(); }
            }}
            placeholder="Title"
            aria-label="Note title"
            /* `.bare-field` is the documented opt-out from the global input well +
               focus ring (globals.css). Without it this field draws a stray box and
               flashes blue when clicked — the owner's first complaint.
               22px on a phone: 26px is a lot of the screen when the line is short. */
            className="bare-field note-title-field mb-1 w-full resize-none overflow-hidden break-words text-[22px] font-semibold leading-tight tracking-[-0.01em] text-fg outline-none placeholder:text-fg-subtle/60 sm:text-[26px]"
          />
          <EditorContent editor={editor} />
        </div>
      </div>

      {/* AI (Phase 5). Every action is a PROPOSAL — nothing here touches the note
          until Accept, and accepting a rewrite snapshots the old version first. */}
      <NoteAiPanel
        noteId={noteId}
        getText={() => editorRef.current?.getText() ?? ""}
        hasRichBlocks={() => {
          const ed = editorRef.current;
          if (!ed) return false;
          // A whole-note rewrite comes back as plain paragraphs, so anything with
          // its own shape would be flattened. Warn rather than forbid.
          let rich = false;
          ed.state.doc.descendants((node) => {
            if (rich) return false;
            if (RICH_BLOCKS.has(node.type.name)) { rich = true; return false; }
            return true;
          });
          return rich;
        }}
        onApplyPolish={(text) => {
          const ed = editorRef.current;
          if (!ed) return;
          ed.chain().focus().setContent(textToDoc(text)).run();
          if (timer.current) clearTimeout(timer.current);
          void flush();
        }}
        onInsertSummary={(points) => {
          const ed = editorRef.current;
          if (!ed) return;
          // As a callout at the very top — which is what callouts were built for.
          ed.chain().focus().insertContentAt(0, {
            type: "callout",
            attrs: { tone: "info" },
            content: [{
              type: "bulletList",
              content: points.map((p) => ({
                type: "listItem",
                content: [{ type: "paragraph", content: [{ type: "text", text: p }] }],
              })),
            }],
          }).run();
          if (timer.current) clearTimeout(timer.current);
          void flush();
        }}
        onApplyTitle={(next) => {
          setTitle(next);
          titleRef.current = next;
          if (timer.current) clearTimeout(timer.current);
          void flush();
        }}
      />

      {/* Names you wrote without linking. A quiet strip at the FOOT of the sheet,
          so it never pushes the writing about, and every chip can be waved away.
          It offers; it never links by itself — see lib/note-unlinked-shared.ts. */}
      {unlinked.length > 0 && (
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-t border-border bg-bg-subtle/60 px-3 py-1.5">
          <span className="inline-flex items-center gap-1.5 text-[11px] text-fg-subtle">
            <Sparkles size={11} /> Mentioned, not linked:
          </span>
          {unlinked.map((c) => (
            <span key={`${c.entity}:${c.id}`} className="inline-flex items-center overflow-hidden rounded-md border border-border bg-bg-elev">
              <button
                type="button"
                onClick={() => linkSuggestion(c)}
                title={`Link ${c.label}`}
                className="inline-flex h-6 items-center gap-1 px-1.5 text-[11px] font-medium text-fg transition-colors hover:bg-accent-soft hover:text-accent"
              >
                <Link2 size={10} />
                {c.entity === "task" && c.code ? c.code : c.label}
              </button>
              <button
                type="button"
                aria-label={`Ignore ${c.label}`}
                title="Not this one"
                onClick={() => setDismissed((s) => new Set(s).add(`${c.entity}:${c.id}`))}
                className="inline-flex h-6 w-5 items-center justify-center border-l border-border text-fg-subtle transition-colors hover:bg-bg-muted hover:text-fg"
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}

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

/**
 * ⚠️ THE DOCUMENT MUST BE CLONED BEFORE IT CROSSES A SERVER ACTION.
 *
 * ProseMirror builds every node's `attrs` with `Object.create(null)`, and React's
 * Server Action serialiser drops a null-prototype object — **silently**. The note
 * saved perfectly; `body_text` was right; and every `mention` node arrived on the
 * server as a bare `{"type":"mention"}` with its entity, id and label gone, so
 * `note_links` came out empty and no link, backlink or Notes tab ever appeared.
 * Nothing errored anywhere.
 *
 * A JSON round-trip rebuilds the same data with ordinary object prototypes. It
 * costs one serialise of a small document per save — which is what gets stored
 * anyway — and it is the only thing standing between the editor and this bug.
 *
 * If a future node type carries attributes and its links stop appearing, look
 * here first.
 */
function plainDoc(doc: unknown): unknown {
  return JSON.parse(JSON.stringify(doc));
}

/** Blocks a whole-note rewrite would flatten — the AI returns plain prose, so a
 *  table, a picture or a callout would not survive being replaced by it. */
const RICH_BLOCKS = new Set(["table", "noteImage", "callout", "codeBlock", "taskList"]);

/** Plain text back into a document: blank lines separate paragraphs, the way
 *  anybody writing prose expects. */
function textToDoc(text: string): Content {
  const paras = text
    .split(/\n{2,}/)
    .map((p) => p.replace(/\n/g, " ").trim())
    .filter(Boolean);
  return {
    type: "doc",
    content: paras.length
      ? paras.map((p) => ({ type: "paragraph", content: [{ type: "text", text: p }] }))
      : [{ type: "paragraph" }],
  } as Content;
}

/** The checklist line the caret is sitting in. */
type TaskLine = { pos: number; text: string; todoId: number | null };

/**
 * Find the tick-box line under the caret, if there is one.
 *
 * Walks OUT from the caret rather than searching the document, so it is O(depth)
 * and cannot pick the wrong line when two say the same thing.
 */
function currentTaskItem(editor: Editor): TaskLine | null {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth);
    if (node.type.name === "taskItem") {
      const raw = (node.attrs as { todoId?: unknown }).todoId;
      const todoId = Number.isInteger(raw) && Number(raw) > 0 ? Number(raw) : null;
      return { pos: $from.before(depth), text: node.textContent.trim(), todoId };
    }
  }
  return null;
}

/** Every `todoId` already written into the document — the ids to check are live. */
function promotedIds(doc: unknown): number[] {
  const ids: number[] = [];
  const walk = (node: unknown, depth: number): void => {
    if (depth > 60 || node == null || typeof node !== "object") return;
    if (Array.isArray(node)) { for (const c of node) walk(c, depth + 1); return; }
    const n = node as Record<string, unknown>;
    const raw = (n.attrs as { todoId?: unknown } | undefined)?.todoId;
    if (n.type === "taskItem" && Number.isInteger(raw) && Number(raw) > 0) ids.push(Number(raw));
    if (Array.isArray(n.content)) walk(n.content, depth + 1);
  };
  walk(doc, 0);
  return ids;
}

/** The note's links, flattened to a string so "did the links change?" is one
 *  comparison. Uses the same extractor the server derives `note_links` from, so
 *  the two can never disagree about what counts as a link. */
function mentionSignature(body: unknown): string {
  return extractMentions(body).map((m) => `${m.entity}:${m.id}`).join(",");
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

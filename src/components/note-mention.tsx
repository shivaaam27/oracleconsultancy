"use client";

import { Extension, Node, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import Suggestion, { type SuggestionOptions } from "@tiptap/suggestion";
import { ReactRenderer } from "@tiptap/react";
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { Building2, FileText, ListChecks, StickyNote, User, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { createMenuPositioner } from "@/lib/suggestion-position";
import { linkHref, mentionText, type LinkType, type MentionRef } from "@/lib/note-links-shared";

/**
 * `@` and `[[` — the linking gesture. Phase 3 of memory/notes_module_plan.md.
 *
 * Type `@` for a task, person, company or document; type `[[` for another note
 * (the Obsidian idiom, which is the one linking gesture everyone already knows).
 * What you pick becomes a `mention` node in the document, and the link rows in
 * `note_links` are DERIVED from those nodes on save — the same rule `body_text`
 * and `#tags` follow. There is no second way to make a link, so a link can never
 * disagree with the writing.
 *
 * Four things here that were decided rather than defaulted:
 *
 *  • **`allowSpaces: false`.** With spaces allowed, an email address ("write to
 *    sam@oracle.co.tz about…") keeps the menu open for the rest of the sentence.
 *    One word is plenty against a five-item shortlist, and the API matches
 *    `%word%` so "@suchak" still finds "Kishan Suchak".
 *  • **The label is snapshotted into the document** so the sentence still reads
 *    correctly years later — but the link panels re-resolve the live name, so a
 *    renamed company shows its new name there. Text and index, each right.
 *  • **`renderText` emits "@Name"**, which is what lands in `body_text` and
 *    therefore what the shelf's plain search can find. An opaque token would make
 *    every mentioned name invisible to search.
 *  • **It positions through `layoutRect()`**, like the `/` menu — the portal
 *    renders at `zoom: 0.8` and a raw `getBoundingClientRect()` lands 20% out.
 *    Notes are admin-only today, so this costs nothing and is already right.
 */

const ICONS: Record<LinkType, LucideIcon> = {
  task: ListChecks,
  person: User,
  company: Building2,
  document: FileText,
  note: StickyNote,
};

/** Written out rather than pluralised by appending "s" — which produced
 *  "COMPANYS" and would have produced "PERSONS". */
const GROUP_LABELS: Record<LinkType, string> = {
  task: "Tasks",
  person: "People",
  company: "Companies",
  document: "Documents",
  note: "Notes",
};

/* ------------------------------------------------------------------ */
/* The node                                                            */
/* ------------------------------------------------------------------ */

/** An inline atom: one indivisible chip. Backspace removes the whole mention
 *  rather than eating it a letter at a time, which is what people expect. */
export const Mention = Node.create({
  name: "mention",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      entity: { default: null, parseHTML: (el) => el.getAttribute("data-entity"), renderHTML: (a) => ({ "data-entity": a.entity }) },
      id: { default: null, parseHTML: (el) => Number(el.getAttribute("data-id")) || null, renderHTML: (a) => ({ "data-id": String(a.id) }) },
      code: { default: null, parseHTML: (el) => el.getAttribute("data-code"), renderHTML: (a) => (a.code ? { "data-code": a.code } : {}) },
      label: { default: "", parseHTML: (el) => el.getAttribute("data-label") ?? el.textContent ?? "", renderHTML: (a) => ({ "data-label": a.label }) },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-mention]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const ref = node.attrs as unknown as MentionRef;
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-mention": "",
        "data-mention-href": linkHref(ref),
        class: "note-mention",
        title: `Open this ${ref.entity}`,
      }),
      mentionText(ref),
    ];
  },

  /** What `editor.getText()` sees — and therefore `body_text`, search and AI. */
  renderText({ node }) {
    return mentionText(node.attrs as unknown as MentionRef);
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleDOMEvents: {
            // Clicking a chip opens the record. Inside a contenteditable an <a>
            // does not reliably navigate, and hard-navigating with
            // `location.assign` would throw away the client router — so this
            // raises a window event that `note-editor.tsx` turns into a
            // `router.push`. The same shape as the `cos:trace` event elsewhere.
            mousedown: (_view, event) => {
              const el = (event.target as HTMLElement | null)?.closest?.("[data-mention-href]");
              const href = el?.getAttribute("data-mention-href");
              if (!href) return false;
              event.preventDefault();
              window.dispatchEvent(new CustomEvent("cos:note-open", { detail: { href } }));
              return true;
            },
          },
        },
      }),
    ];
  },
});

/* ------------------------------------------------------------------ */
/* The picker                                                          */
/* ------------------------------------------------------------------ */

type PickItem = MentionRef & { sublabel?: string };
type MenuHandle = { onKeyDown: (props: { event: KeyboardEvent }) => boolean };

const MentionList = forwardRef<MenuHandle, { items: PickItem[]; command: (item: PickItem) => void; scope: "all" | "note" }>(
  function MentionList({ items, command, scope }, ref) {
    const [active, setActive] = useState(0);
    useEffect(() => setActive(0), [items]);

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (event.key === "ArrowDown") { setActive((i) => (i + 1) % Math.max(items.length, 1)); return true; }
        if (event.key === "ArrowUp") { setActive((i) => (i - 1 + items.length) % Math.max(items.length, 1)); return true; }
        if (event.key === "Enter" || event.key === "Tab") {
          if (items[active]) { command(items[active]); return true; }
          // Nothing to pick: let Enter make a new paragraph rather than swallowing it.
          return false;
        }
        return false;
      },
    }));

    if (items.length === 0) {
      return (
        <div className="w-[19rem] rounded-lg border border-border bg-bg-elev p-3 text-sm text-fg-muted shadow-lg">
          {scope === "note" ? "No other note matches." : "Nothing matches. Keep typing, or press Escape."}
        </div>
      );
    }

    // Grouped by type, in the order the API returns them (task → person → company
    // → document), which is roughly how often each is actually mentioned.
    const groups: { type: LinkType; items: PickItem[] }[] = [];
    for (const item of items) {
      const g = groups.find((x) => x.type === item.entity);
      if (g) g.items.push(item); else groups.push({ type: item.entity, items: [item] });
    }

    return (
      <div className="max-h-[19rem] w-[19rem] overflow-y-auto rounded-lg border border-border bg-bg-elev p-1 shadow-lg">
        {groups.map((g) => (
          <div key={g.type}>
            {scope === "all" && (
              <p className="px-2 pb-0.5 pt-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-fg-subtle">
                {GROUP_LABELS[g.type]}
              </p>
            )}
            {g.items.map((item) => {
              const i = items.indexOf(item);
              const Icon = ICONS[item.entity];
              return (
                <button
                  key={`${item.entity}:${item.id}`}
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => { e.preventDefault(); command(item); }}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors",
                    i === active ? "bg-accent-soft" : "hover:bg-bg-muted",
                  )}
                >
                  <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded bg-bg-subtle", i === active && "bg-bg-elev text-accent")}>
                    <Icon size={13} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-1.5">
                      {item.code && <span className="shrink-0 font-mono text-xs text-fg-subtle">{item.code}</span>}
                      <span className="truncate text-sm font-medium text-fg">{item.label}</span>
                    </span>
                    {item.sublabel && <span className="block truncate text-xs text-fg-muted">{item.sublabel}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    );
  },
);

/**
 * ⚠️ EVERY `Suggestion()` IN ONE EDITOR NEEDS ITS OWN `pluginKey`.
 *
 * `@tiptap/suggestion` defaults to `new PluginKey("suggestion")`, so the moment a
 * second one is added ProseMirror throws *"Adding different instances of a keyed
 * plugin (suggestion$)"* and the whole note page dies with "Something went wrong"
 * — not a warning, a blank screen. This editor now runs three (the `/` menu, `@`
 * and `[[`), so each carries a distinct key. Add a fourth trigger, add a key.
 */
const AT_KEY = new PluginKey("noteMentionAt");
const NOTE_KEY = new PluginKey("noteMentionWiki");

/** One picker, two triggers. `noteId` is only used to keep a note out of its own
 *  `[[` list — linking a note to itself is noise, never information. */
function mentionSuggestion(opts: {
  char: string;
  scope: "all" | "note";
  noteId: number | null;
  pluginKey: PluginKey;
}): Partial<SuggestionOptions> {
  return {
    char: opts.char,
    pluginKey: opts.pluginKey,
    // See the header: spaces would keep the menu open across a whole sentence.
    allowSpaces: false,
    // Not inside code — a `@` in a snippet is a `@`.
    allow: ({ editor }) => !editor.isActive("codeBlock") && !editor.isActive("code"),
    items: async ({ query }) => {
      try {
        const params = new URLSearchParams({ q: query, scope: opts.scope });
        if (opts.noteId != null) params.set("exclude", String(opts.noteId));
        const res = await fetch(`/api/note-mentions?${params}`, { cache: "no-store" });
        if (!res.ok) return [];
        const json = (await res.json()) as { items?: PickItem[] };
        return json.items ?? [];
      } catch {
        // Offline, or the request was superseded. An empty shortlist is the right
        // failure: it never costs what the owner was typing.
        return [];
      }
    },
    command: ({ editor, range, props }) => {
      const item = props as PickItem;
      editor
        .chain()
        .focus()
        .insertContentAt(range, [
          { type: "mention", attrs: { entity: item.entity, id: item.id, code: item.code, label: item.label } },
          // A trailing space, so you can keep typing the sentence.
          { type: "text", text: " " },
        ])
        .run();
    },
    render: () => {
      let component: ReactRenderer<MenuHandle> | null = null;
      // Shared with the `/` menu — see lib/suggestion-position.ts. It is what keeps
      // the picker on screen when the caret is at the foot of a long note.
      const menu = createMenuPositioner();
      const close = () => {
        menu.detach();
        (component?.element as HTMLElement | undefined)?.remove();
      };
      return {
        onStart: (props) => {
          component = new ReactRenderer(MentionList, { editor: props.editor, props: { ...props, scope: opts.scope } });
          const el = component.element as HTMLElement;
          document.body.appendChild(el);
          menu.attach(el, () => props.clientRect?.());
        },
        onUpdate: (props) => {
          component?.updateProps({ ...props, scope: opts.scope });
          menu.update(() => props.clientRect?.());
        },
        onKeyDown: (props) => {
          if (props.event.key === "Escape") { close(); return true; }
          return component?.ref?.onKeyDown(props) ?? false;
        },
        onExit: () => { close(); component?.destroy(); },
      };
    },
  };
}

/**
 * The extension. `MentionPickers.configure({ noteId })` plus the `Mention` node is
 * everything `@` and `[[` need.
 */
export const MentionPickers = Extension.create<{ noteId: number | null }>({
  name: "mentionPickers",
  addOptions() {
    return { noteId: null };
  },
  addProseMirrorPlugins() {
    return [
      Suggestion({ editor: this.editor, ...mentionSuggestion({ char: "@", scope: "all", noteId: this.options.noteId, pluginKey: AT_KEY }) }),
      Suggestion({ editor: this.editor, ...mentionSuggestion({ char: "[[", scope: "note", noteId: this.options.noteId, pluginKey: NOTE_KEY }) }),
    ];
  },
});

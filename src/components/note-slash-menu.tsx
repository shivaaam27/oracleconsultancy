"use client";

import { Extension } from "@tiptap/core";
import Suggestion, { type SuggestionOptions } from "@tiptap/suggestion";
import { PluginKey } from "@tiptap/pm/state";
import { ReactRenderer } from "@tiptap/react";
import type { Editor, Range } from "@tiptap/core";
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import {
  Heading1, Heading2, Heading3, List, ListOrdered, ListChecks, Quote, Code2,
  Minus, Table as TableIcon, CalendarDays, Type, AtSign, Link2, Info, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { createMenuPositioner } from "@/lib/suggestion-position";

/**
 * The `/` menu. Phase 2 of memory/notes_module_plan.md.
 *
 * Type `/` on an empty line and every block this editor can make is one keystroke
 * away, filtered as you type — the gesture everyone already knows from Notion and
 * Craft, and the reason the toolbar does not need to grow for ever.
 *
 * Two things worth keeping in mind when this list grows:
 *  • it positions through `layoutRect()`, not `getBoundingClientRect()`. The portal
 *    renders at `zoom: 0.8` and a raw rect lands 20% out; notes are admin-only today,
 *    so the zoom is 1 and it makes no difference — but the day a note appears in the
 *    portal, this is already right. (See lib/zoom.ts for the whole story.)
 *  • every item is a plain command over the editor chain, so adding one is one entry
 *    in ITEMS. No new plumbing.
 */

const SLASH_KEY = new PluginKey("noteSlashCommands");

type SlashItem = {
  title: string;
  hint: string;
  icon: LucideIcon;
  group: "Style" | "Lists" | "Blocks" | "Insert";
  /** Typed shortcuts — "h1", "todo", "tbl" — matched as well as the title. */
  keywords: string[];
  run: (editor: Editor, range: Range) => void;
};

const ITEMS: SlashItem[] = [
  { title: "Body text", hint: "Plain paragraph", icon: Type, group: "Style", keywords: ["p", "paragraph", "text", "body"],
    run: (e, r) => e.chain().focus().deleteRange(r).setParagraph().run() },
  { title: "Heading 1", hint: "Big section title", icon: Heading1, group: "Style", keywords: ["h1", "title", "big"],
    run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 1 }).run() },
  { title: "Heading 2", hint: "Section title", icon: Heading2, group: "Style", keywords: ["h2", "sub"],
    run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 2 }).run() },
  { title: "Heading 3", hint: "Small title", icon: Heading3, group: "Style", keywords: ["h3"],
    run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 3 }).run() },

  { title: "Checklist", hint: "Tick things off", icon: ListChecks, group: "Lists", keywords: ["todo", "task", "tick", "check", "box"],
    run: (e, r) => e.chain().focus().deleteRange(r).toggleTaskList().run() },
  { title: "Bulleted list", hint: "Simple list", icon: List, group: "Lists", keywords: ["ul", "bullet", "dot"],
    run: (e, r) => e.chain().focus().deleteRange(r).toggleBulletList().run() },
  { title: "Numbered list", hint: "Ordered steps", icon: ListOrdered, group: "Lists", keywords: ["ol", "number", "1."],
    run: (e, r) => e.chain().focus().deleteRange(r).toggleOrderedList().run() },

  { title: "Quote", hint: "Set text apart", icon: Quote, group: "Blocks", keywords: ["blockquote", "cite"],
    run: (e, r) => e.chain().focus().deleteRange(r).toggleBlockquote().run() },
  { title: "Code block", hint: "Monospaced", icon: Code2, group: "Blocks", keywords: ["code", "pre", "snippet"],
    run: (e, r) => e.chain().focus().deleteRange(r).toggleCodeBlock().run() },
  { title: "Table", hint: "3 × 3, with a header row", icon: TableIcon, group: "Blocks", keywords: ["table", "grid", "tbl", "rows"],
    run: (e, r) => e.chain().focus().deleteRange(r).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  { title: "Callout", hint: "Boxed, for the thing not to miss", icon: Info, group: "Blocks", keywords: ["callout", "box", "note", "aside", "warning", "tip"],
    run: (e, r) => e.chain().focus().deleteRange(r).wrapIn("callout", { tone: "info" }).run() },
  { title: "Divider", hint: "A line across", icon: Minus, group: "Blocks", keywords: ["hr", "rule", "line", "---"],
    run: (e, r) => e.chain().focus().deleteRange(r).setHorizontalRule().run() },

  { title: "Today's date", hint: "Written out in full", icon: CalendarDays, group: "Insert", keywords: ["date", "today", "now"],
    run: (e, r) => e.chain().focus().deleteRange(r).insertContent(
      new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
    ).run() },

  /* These two do not link anything themselves — they type the trigger and hand
     over to the `@` / `[[` picker in note-mention.tsx. That is the point: the
     gesture you learn here is the one you use everywhere afterwards, and there is
     still only ONE way a link gets made. */
  { title: "Link a record", hint: "Task, person, company or document", icon: AtSign, group: "Insert", keywords: ["@", "mention", "link", "task", "person", "company", "doc"],
    run: (e, r) => e.chain().focus().deleteRange(r).insertContent("@").run() },
  { title: "Link a note", hint: "Another note in the shelf", icon: Link2, group: "Insert", keywords: ["[[", "note", "wiki", "backlink"],
    run: (e, r) => e.chain().focus().deleteRange(r).insertContent("[[").run() },
];

function match(item: SlashItem, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return item.title.toLowerCase().includes(q) || item.keywords.some((k) => k.startsWith(q) || k.includes(q));
}

type MenuHandle = { onKeyDown: (props: { event: KeyboardEvent }) => boolean };

const SlashList = forwardRef<MenuHandle, { items: SlashItem[]; command: (item: SlashItem) => void }>(
  function SlashList({ items, command }, ref) {
    const [active, setActive] = useState(0);
    useEffect(() => setActive(0), [items]);

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (event.key === "ArrowDown") { setActive((i) => (i + 1) % items.length); return true; }
        if (event.key === "ArrowUp") { setActive((i) => (i - 1 + items.length) % items.length); return true; }
        if (event.key === "Enter" || event.key === "Tab") {
          if (items[active]) command(items[active]);
          return true;
        }
        return false;
      },
    }));

    if (items.length === 0) {
      return (
        <div className="w-[17rem] rounded-lg border border-border bg-bg-elev p-3 text-sm text-fg-muted shadow-lg">
          Nothing matches. Keep typing, or press Escape to write a plain <span className="font-mono">/</span>.
        </div>
      );
    }

    // Group headings, in the order the groups first appear.
    const groups: { label: string; items: SlashItem[] }[] = [];
    for (const item of items) {
      const g = groups.find((x) => x.label === item.group);
      if (g) g.items.push(item); else groups.push({ label: item.group, items: [item] });
    }

    return (
      <div className="max-h-[19rem] w-[17rem] overflow-y-auto rounded-lg border border-border bg-bg-elev p-1 shadow-lg">
        {groups.map((g) => (
          <div key={g.label}>
            <p className="px-2 pb-0.5 pt-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-fg-subtle">{g.label}</p>
            {g.items.map((item) => {
              const i = items.indexOf(item);
              const Icon = item.icon;
              return (
                <button
                  key={item.title}
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
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-fg">{item.title}</span>
                    <span className="block truncate text-xs text-fg-muted">{item.hint}</span>
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

/** The extension. Add it to the editor's `extensions` and `/` works. */
export const SlashCommands = Extension.create({
  name: "slashCommands",
  addOptions() {
    return {
      suggestion: {
        char: "/",
        // ⚠️ Its own key. `@tiptap/suggestion` defaults every instance to
        // `PluginKey("suggestion")`, and a second one in the same editor makes
        // ProseMirror throw "Adding different instances of a keyed plugin
        // (suggestion$)" — which takes the whole note page down, not just the
        // menu. `@` and `[[` in note-mention.tsx carry their own keys too.
        pluginKey: SLASH_KEY,
        // Only at the start of an empty-ish block: a `/` mid-sentence is a slash.
        startOfLine: true,
        command: ({ editor, range, props }) => (props as SlashItem).run(editor, range),
        items: ({ query }) => ITEMS.filter((i) => match(i, query)).slice(0, 12),
        render: () => {
          let component: ReactRenderer<MenuHandle> | null = null;
          // Positioning lives in lib/suggestion-position.ts — shared with the `@`
          // and `[[` pickers, and the only thing that guarantees the menu cannot
          // run off the bottom of a long note. Read its header before changing it.
          const menu = createMenuPositioner();
          const close = () => {
            menu.detach();
            (component?.element as HTMLElement | undefined)?.remove();
          };
          return {
            onStart: (props) => {
              component = new ReactRenderer(SlashList, { editor: props.editor, props });
              const el = component.element as HTMLElement;
              document.body.appendChild(el);
              menu.attach(el, () => props.clientRect?.());
            },
            onUpdate: (props) => {
              component?.updateProps(props);
              menu.update(() => props.clientRect?.());
            },
            onKeyDown: (props) => {
              if (props.event.key === "Escape") { close(); return true; }
              return component?.ref?.onKeyDown(props) ?? false;
            },
            onExit: () => { close(); component?.destroy(); },
          };
        },
      } satisfies Partial<SuggestionOptions>,
    };
  },
  addProseMirrorPlugins() {
    return [Suggestion({ editor: this.editor, ...this.options.suggestion })];
  },
});

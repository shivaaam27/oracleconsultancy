/**
 * Notes — the CLIENT-SAFE half: types and pure helpers, no database.
 *
 * ⚠️ This file exists because of a hard rule in CLAUDE.md, and I walked straight
 * into it: `src/lib/notes.ts` imports the server-only `sb`, so a CLIENT component
 * importing anything from it (even a type-adjacent helper) drags `@/db/supabase`
 * into the browser bundle and every page dies with "SUPABASE_SERVICE_ROLE_KEY is
 * not set". Same shape as `documents-shared.ts` / `vendors-shared.ts` / and
 * `entity-meta.ts` — the client-safe twin of a server module.
 *
 * FORWARD RULE: anything a client component needs from Notes goes HERE. Never
 * import `@/lib/notes` from a `"use client"` file.
 */

/** A ProseMirror/Tiptap document. Deliberately opaque — nothing outside the editor
 *  should reach into the node tree. */
export type NoteBody = unknown;

export type NoteRow = {
  id: number;
  title: string;
  bodyJson: NoteBody | null;
  bodyText: string;
  folderId: number | null;
  folderName: string | null;
  pinnedAt: string | null;
  archived: boolean;
  kind: string;
  createdAt: string;
  updatedAt: string;
};

export type NoteFolder = { id: number; name: string; sortOrder: number; count: number };

/** The list row: everything but the body JSON, which can be large and is never
 *  needed to draw a list. `snippet` is cut from the derived plain text. */
export type NoteListRow = Omit<NoteRow, "bodyJson"> & { snippet: string };

/** First line of real text, for the list. The title is usually the first line, so
 *  the snippet deliberately skips it — showing the title twice tells you nothing. */
export function snippetOf(bodyText: string, title: string): string {
  const text = bodyText.replace(/\s+/g, " ").trim();
  const withoutTitle = title && text.startsWith(title) ? text.slice(title.length).trim() : text;
  return withoutTitle.slice(0, 160);
}

/** A note's display name. An untitled note is NORMAL here — the owner types the
 *  body first and the title second, or never — so it falls back to the first line
 *  rather than showing a blank row. */
export function noteTitle(n: { title: string; snippet?: string; bodyText?: string }): string {
  const t = n.title.trim();
  if (t) return t;
  const body = (n.snippet ?? n.bodyText ?? "").trim();
  return body ? body.slice(0, 60) : "Untitled note";
}

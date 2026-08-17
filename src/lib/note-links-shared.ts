/**
 * Note links — the CLIENT-SAFE half. Phase 3 of memory/notes_module_plan.md.
 *
 * ⚠️ Same rule as `notes-shared.ts`, and for the same reason: `lib/note-links.ts`
 * imports the server-only `sb`, so anything a `"use client"` file needs must live
 * HERE. Importing the server twin from a client component drags `@/db/supabase`
 * into the browser bundle and every page dies with "SUPABASE_SERVICE_ROLE_KEY is
 * not set". It has happened twice in this module already.
 */

/** The record types a note can point at. Kept small on purpose: these are the five
 *  the owner actually writes about. Adding one means teaching the picker where to
 *  search and `lib/note-links.ts` how to resolve a label — nothing else. */
export const LINK_TYPES = ["task", "person", "company", "document", "note"] as const;
export type LinkType = (typeof LINK_TYPES)[number];

export function isLinkType(v: unknown): v is LinkType {
  return typeof v === "string" && (LINK_TYPES as readonly string[]).includes(v);
}

/** What an `@mention` node carries in the document, and what a picker returns. */
export type MentionRef = {
  entity: LinkType;
  id: number;
  /** Task codes, for display without a join. Null for everything else. */
  code: string | null;
  /** The label as it was at the moment of writing. Snapshotted INTO THE DOCUMENT
   *  (so the sentence still reads correctly years later) but never trusted by the
   *  link panels, which re-resolve the live name. */
  label: string;
};

/** A link row as the panels want it: the reference plus a freshly resolved label. */
export type ResolvedLink = MentionRef & {
  href: string;
  /** Live name from the target's own table. Falls back to the snapshot when the
   *  target has been deleted, so a link never renders as a blank row. */
  label: string;
  sublabel?: string;
  /** True when the target no longer exists — shown as "no longer available"
   *  rather than quietly vanishing, because a missing link IS information. */
  missing?: boolean;
};

/** Where a link goes when clicked. One place, so the panels, the chips inside the
 *  editor and the record tabs can never disagree about a URL. */
export function linkHref(ref: { entity: LinkType; id: number; code: string | null }): string {
  switch (ref.entity) {
    // Tasks live at their CODE, not their id — `taskHref()`'s rule, restated here
    // because this file must stay free of server imports.
    case "task": return ref.code ? `/task/${encodeURIComponent(ref.code)}` : "/?tab=tasks";
    case "person": return `/people/${ref.id}`;
    case "company": return `/companies/${ref.id}`;
    case "document": return `/documents?doc=${ref.id}`;
    case "note": return `/notes/${ref.id}`;
  }
}

export const LINK_TYPE_LABELS: Record<LinkType, string> = {
  task: "Task",
  person: "Person",
  company: "Company",
  document: "Document",
  note: "Note",
};

/** A note as it appears on some OTHER record's Notes tab. Lives here rather than
 *  in the server twin because the tab that draws it is a client component. */
export type LinkedNote = {
  id: number;
  title: string;
  snippet: string;
  updatedAt: string;
  archived: boolean;
};

/* ------------------------------------------------------------------ */
/* Deriving links from the document                                    */
/* ------------------------------------------------------------------ */

/**
 * Pull every `@mention` / `[[note]]` out of a Tiptap document.
 *
 * This is the whole link mechanism. Links are DERIVED from the body on save, in
 * the same action as `body_text` and `#tags` — the rule this table follows from
 * the plan: if two things can drift apart, they will. There is deliberately no
 * second way to add a link (no "attach note" button on a task), because a link
 * created away from the writing is a link the writing does not know about.
 *
 * Written defensively: `body_json` is opaque JSON out of a third-party editor, so
 * every node is treated as untrusted shape rather than assumed.
 */
export function extractMentions(doc: unknown): MentionRef[] {
  const found: MentionRef[] = [];
  const seen = new Set<string>();

  const add = (entity: LinkType, id: number, code: string | null, label: string): void => {
    const key = `${entity}:${id}`;
    if (seen.has(key)) return;
    seen.add(key);
    found.push({ entity, id, code, label });
  };

  const walk = (node: unknown, depth: number): void => {
    // A pathological document should never take the save path down with it.
    if (depth > 60 || node == null || typeof node !== "object") return;

    if (Array.isArray(node)) {
      for (const child of node) walk(child, depth + 1);
      return;
    }

    const n = node as Record<string, unknown>;

    const attrs = (n.attrs && typeof n.attrs === "object" ? n.attrs : null) as Record<string, unknown> | null;

    if (n.type === "mention" && attrs) {
      const entity = attrs.entity;
      const id = Number(attrs.id);
      if (isLinkType(entity) && Number.isInteger(id) && id > 0) {
        add(entity, id, typeof attrs.code === "string" && attrs.code ? attrs.code : null, typeof attrs.label === "string" ? attrs.label : "");
      }
      // A mention is an atom — nothing inside it to walk.
      return;
    }

    /* A picture is a link too. It carries a `documents` row exactly like an `@`
       document mention does, so it belongs in `note_links` for the same reasons:
       the Documents library can show where a file is used, and deleting the note
       tidies up after itself. Handled here rather than in a second extractor so
       there stays ONE answer to "what does this note point at". */
    if (n.type === "noteImage" && attrs) {
      const id = Number(attrs.documentId);
      if (Number.isInteger(id) && id > 0) add("document", id, null, typeof attrs.alt === "string" ? attrs.alt : "");
      return;
    }

    if (Array.isArray(n.content)) walk(n.content, depth + 1);
  };

  walk(doc, 0);
  return found;
}

/** How a mention reads in plain text — and therefore in `body_text`, which is what
 *  search, previews and (later) the embedding actually see. Writing "@Kishan
 *  Suchak" rather than an opaque token is what keeps a mentioned name findable by
 *  the shelf's plain search. */
export function mentionText(ref: { entity: LinkType; code: string | null; label: string }): string {
  if (ref.entity === "note") return `[[${ref.label}]]`;
  if (ref.entity === "task" && ref.code) return `@${ref.code}`;
  return `@${ref.label}`;
}

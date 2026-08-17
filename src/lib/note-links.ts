import { sb } from "@/db/supabase";
import {
  extractMentions,
  linkHref,
  type LinkedNote,
  type LinkType,
  type MentionRef,
  type ResolvedLink,
} from "@/lib/note-links-shared";
import { snippetOf } from "@/lib/notes-shared";
import type { LinkCandidate } from "@/lib/note-unlinked-shared";

/* ------------------------------------------------------------------ */
/* Note links — the server half. Phase 3 of memory/notes_module_plan.md */
/*                                                                     */
/* ⚠️ CLIENT COMPONENTS MUST NOT IMPORT THIS FILE. It pulls in `sb`,   */
/* which drags @/db/supabase into the browser bundle and kills every    */
/* page with "SUPABASE_SERVICE_ROLE_KEY is not set". The client-safe    */
/* twin is `note-links-shared.ts`.                                      */
/*                                                                     */
/* Owner-only, like the rest of Notes: these run behind the admin gate  */
/* and have no caller scoping. A note linked to a task is still         */
/* invisible on the staff portal — linking is not sharing.              */
/* ------------------------------------------------------------------ */

/**
 * Rewrite a note's links to match its body.
 *
 * Replace-all rather than a diff, for the same reason `syncTags` does: a note has
 * a handful of links, so working out the difference costs more than redoing it.
 *
 * Called from the save action, in the same breath as `body_text` and `#tags`.
 * Never from a cron — if a derived thing can lag behind its source, it will.
 *
 * Failure is swallowed on purpose: a link index is a convenience, and losing the
 * owner's writing to keep it consistent would be the wrong trade.
 */
export async function syncNoteLinks(noteId: number, bodyJson: unknown): Promise<void> {
  try {
    const refs = extractMentions(bodyJson);
    await sb.from("note_links").delete().eq("note_id", noteId);
    if (refs.length === 0) return;
    await sb.from("note_links").insert(
      refs.map((r) => ({
        note_id: noteId,
        target_type: r.entity,
        target_id: r.id,
        target_code: r.code,
      })),
    );
  } catch {
    /* never fail a save for the link index */
  }
}

/* ------------------------------------------------------------------ */
/* Resolving labels                                                    */
/* ------------------------------------------------------------------ */

/**
 * Turn bare `{type,id}` references into rows a panel can draw.
 *
 * The live name is read from the target's own table rather than trusted from the
 * document's snapshot, so a renamed company shows its new name in the Links panel
 * while the sentence that mentions it keeps the words that were written. A target
 * that has been deleted comes back `missing: true` rather than disappearing —
 * "this pointed at something that is gone" is information, and silently dropping
 * the row would hide it.
 *
 * One query per type present, never one per link.
 */
export async function resolveLinks(refs: MentionRef[]): Promise<ResolvedLink[]> {
  if (refs.length === 0) return [];

  const byType = new Map<LinkType, number[]>();
  for (const r of refs) {
    const list = byType.get(r.entity) ?? [];
    list.push(r.id);
    byType.set(r.entity, list);
  }

  const resolved = new Map<string, { label: string; sublabel?: string; code?: string | null }>();
  const key = (t: LinkType, id: number) => `${t}:${id}`;

  await Promise.all(
    [...byType.entries()].map(async ([type, ids]) => {
      switch (type) {
        case "task": {
          const { data } = await sb.from("tasks").select("id,code,action_item,status,companies(name)").in("id", ids);
          for (const r of data ?? []) {
            resolved.set(key("task", r.id as number), {
              label: (r.action_item as string) || (r.code as string),
              sublabel: [(r.companies as unknown as { name?: string } | null)?.name, r.status as string].filter(Boolean).join(" · "),
              code: (r.code as string) ?? null,
            });
          }
          break;
        }
        case "person": {
          const { data } = await sb.from("people").select("id,name,role,active").in("id", ids);
          for (const r of data ?? []) {
            resolved.set(key("person", r.id as number), {
              label: r.name as string,
              sublabel: [(r.role as string | null) || null, r.active === false ? "Inactive" : null].filter(Boolean).join(" · ") || undefined,
            });
          }
          break;
        }
        case "company": {
          const { data } = await sb.from("companies").select("id,name,code_prefix").in("id", ids);
          for (const r of data ?? []) {
            resolved.set(key("company", r.id as number), {
              label: r.name as string,
              sublabel: (r.code_prefix as string | null) || undefined,
            });
          }
          break;
        }
        case "document": {
          const { data } = await sb.from("documents").select("id,title,category,archived").in("id", ids);
          for (const r of data ?? []) {
            resolved.set(key("document", r.id as number), {
              label: (r.title as string) || "Untitled document",
              sublabel: [(r.category as string | null) || null, r.archived ? "Archived" : null].filter(Boolean).join(" · ") || undefined,
            });
          }
          break;
        }
        case "note": {
          const { data } = await sb.from("notes").select("id,title,body_text,archived").in("id", ids);
          for (const r of data ?? []) {
            const title = ((r.title as string) || "").trim();
            const body = (r.body_text as string) || "";
            resolved.set(key("note", r.id as number), {
              label: title || snippetOf(body, "").slice(0, 60) || "Untitled note",
              sublabel: [title ? snippetOf(body, title).slice(0, 70) : null, r.archived ? "Archived" : null].filter(Boolean).join(" · ") || undefined,
            });
          }
          break;
        }
      }
    }),
  );

  return refs.map((r) => {
    const hit = resolved.get(key(r.entity, r.id));
    const code = hit?.code !== undefined ? hit.code : r.code;
    return {
      ...r,
      code: code ?? null,
      // Fall back to what the document remembers, so a deleted target still reads
      // as the thing it was rather than as a blank row.
      label: hit?.label ?? r.label ?? "(no longer available)",
      sublabel: hit?.sublabel,
      href: linkHref({ entity: r.entity, id: r.id, code: code ?? null }),
      missing: !hit,
    };
  });
}

/** What this note points AT. */
export async function outgoingLinks(noteId: number): Promise<ResolvedLink[]> {
  const { data } = await sb
    .from("note_links")
    .select("target_type,target_id,target_code")
    .eq("note_id", noteId)
    .order("id");
  const refs: MentionRef[] = (data ?? []).map((r) => ({
    entity: r.target_type as LinkType,
    id: r.target_id as number,
    code: (r.target_code as string | null) ?? null,
    label: "",
  }));
  return resolveLinks(refs);
}

export type Backlink = {
  noteId: number;
  title: string;
  snippet: string;
  updatedAt: string;
  archived: boolean;
  href: string;
};

/**
 * What points AT this note — the Backlinks panel.
 *
 * This is the query the `(target_type, target_id)` index exists for, and the whole
 * reason `note_links` is a table rather than a column of JSON on `notes`.
 */
export async function backlinks(noteId: number): Promise<Backlink[]> {
  const { data } = await sb
    .from("note_links")
    .select("note_id,notes!note_links_note_id_notes_id_fk(id,title,body_text,updated_at,archived)")
    .eq("target_type", "note")
    .eq("target_id", noteId);

  const rows = (data ?? [])
    .map((r) => {
      const n = (r as { notes?: unknown }).notes;
      const note = (Array.isArray(n) ? n[0] : n) as
        | { id: number; title: string; body_text: string; updated_at: string; archived: boolean }
        | undefined;
      if (!note) return null;
      const title = (note.title || "").trim();
      const body = note.body_text || "";
      return {
        noteId: note.id,
        title: title || snippetOf(body, "").slice(0, 60) || "Untitled note",
        snippet: snippetOf(body, title).slice(0, 120),
        updatedAt: note.updated_at,
        archived: note.archived,
        href: `/notes/${note.id}`,
      };
    })
    .filter((r): r is Backlink => r !== null);

  // Freshest first, and an archived note sinks to the bottom rather than vanishing.
  return rows.sort((a, b) =>
    Number(a.archived) - Number(b.archived) || b.updatedAt.localeCompare(a.updatedAt),
  );
}

export type { LinkedNote } from "@/lib/note-links-shared";

/**
 * Which notes mention this record — the **Notes** tab on a task, person or company.
 *
 * ⚠️ Owner-only, structurally. This must never be called from a portal route: a
 * note linked to a task is still invisible to that task's assignees (§8 of the
 * plan). If a portal surface is ever wanted, it gets its own decision, not this
 * function with a scope argument bolted on.
 *
 * `includeArchived` defaults to false — an archived note leaves the record's tab
 * the same way it leaves the shelf.
 */
export async function notesLinkedTo(
  type: LinkType,
  targetId: number,
  opts?: { includeArchived?: boolean },
): Promise<LinkedNote[]> {
  const { data } = await sb
    .from("note_links")
    .select("notes!note_links_note_id_notes_id_fk(id,title,body_text,updated_at,archived)")
    .eq("target_type", type)
    .eq("target_id", targetId);

  const rows = (data ?? [])
    .map((r) => {
      const n = (r as { notes?: unknown }).notes;
      return (Array.isArray(n) ? n[0] : n) as
        | { id: number; title: string; body_text: string; updated_at: string; archived: boolean }
        | undefined;
    })
    .filter((n): n is NonNullable<typeof n> => n != null)
    .filter((n) => (opts?.includeArchived ? true : !n.archived))
    .map((n) => {
      const title = (n.title || "").trim();
      const body = n.body_text || "";
      return {
        id: n.id,
        title: title || snippetOf(body, "").slice(0, 60) || "Untitled note",
        snippet: snippetOf(body, title).slice(0, 140),
        updatedAt: n.updated_at,
        archived: n.archived,
      };
    });

  // A note can mention the same record twice; the unique index stops that at the
  // row level, but be defensive — a duplicate in a list reads as a bug either way.
  const seen = new Set<number>();
  return rows
    .filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * The names worth watching for in a note's text — companies, active people and
 * open task codes. Feeds the "you wrote this but did not link it" strip.
 *
 * Deliberately NOT every document title and NOT closed tasks: the list is scanned
 * against the whole note on every save, and a candidate that never matches is pure
 * cost. Companies are few, active people are few, and an open task code is the one
 * thing the owner types by hand.
 *
 * ⚠️ It offers. It never links. Accepting rewrites the TEXT into a real `@`
 * mention, so links stay derived from the writing (§6 of the notes plan).
 */
export async function linkCandidates(): Promise<LinkCandidate[]> {
  const [{ data: companies }, { data: people }, { data: tasks }] = await Promise.all([
    sb.from("companies").select("id,name"),
    sb.from("people").select("id,name").eq("active", true).limit(300),
    sb.from("tasks").select("id,code,action_item").not("status", "in", "(Completed,Closed)").limit(400),
  ]);

  const out: LinkCandidate[] = [];

  for (const c of companies ?? []) {
    const name = (c.name as string) ?? "";
    if (name) out.push({ entity: "company", id: c.id as number, code: null, label: name, needle: name });
  }
  for (const p of people ?? []) {
    const name = (p.name as string) ?? "";
    if (name) out.push({ entity: "person", id: p.id as number, code: null, label: name, needle: name });
  }
  for (const t of tasks ?? []) {
    const code = (t.code as string) ?? "";
    // The CODE is the needle, never the action item: a task's wording is ordinary
    // English and would match half the notes in the shelf.
    if (code) {
      out.push({
        entity: "task",
        id: t.id as number,
        code,
        label: (t.action_item as string) || code,
        needle: code,
        sublabel: code,
      });
    }
  }

  return out;
}

/* Deliberately NO `countNotesLinkedTo`. A `head: true` count over `note_links`
   counts link ROWS, which includes links from archived notes — so a tab reading
   "Notes 3" would open on a list of 2. A badge that disagrees with its own tab is
   worse than no badge; callers use `notesLinkedTo(...).length`, which is the same
   query the tab draws from. A record has tens of notes, not thousands. */

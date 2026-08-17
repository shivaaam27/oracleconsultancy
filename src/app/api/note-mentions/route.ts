// /api/note-mentions — what the `@` and `[[` pickers inside a note search.
//
// GET ?q=<query>&scope=all|note
//   → { items: { entity, id, code, label, sublabel }[] }
//
// Separate from `/api/picker` on purpose: that one answers ORI's clarify flow and
// returns a NAME or CODE as its value, because ORI resolves by name. A note link
// needs the row's **id** (`note_links.target_id`), so the two cannot share a shape.
//
// Admin-only, via the edge gate in `src/proxy.ts` — notes are owner-only and this
// route would otherwise be a directory of every task, person and document in the
// portfolio. It must stay INSIDE the gate; do not add it to the proxy exclusions.
//
// Fails open to `{ items: [] }`: a picker that shows nothing is a small annoyance,
// a picker that throws loses what the owner was typing.

import { NextRequest, NextResponse } from "next/server";
import { sb } from "@/db/supabase";
import type { LinkType } from "@/lib/note-links-shared";

export const dynamic = "force-dynamic";

type Item = { entity: LinkType; id: number; code: string | null; label: string; sublabel?: string };

/** Per type. Small deliberately — a picker is a shortlist, not a browser. */
const PER_TYPE = 5;

/** Postgres LIKE wildcards → literals, so a typed "%" cannot blow the filter open. */
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

/* The picker matches a SINGLE word, because the suggestion trigger stops at a space
   (`allowSpaces: false` in note-mention.tsx — with spaces allowed, an email address
   keeps the menu open for the rest of the sentence). So `%q%` rather than a prefix
   match is what makes "@suchak" find "Kishan Suchak" and "@terra" find
   "Terra Green Ltd". One word is enough to pick from a shortlist. */

async function tasks(q: string): Promise<Item[]> {
  let sel = sb.from("tasks").select("id,code,action_item,status,companies(name)").not("status", "in", "(Completed,Closed)");
  if (q) { const s = `%${escapeLike(q)}%`; sel = sel.or(`code.ilike.${s},action_item.ilike.${s}`); }
  const { data } = await sel.order("last_updated_at", { ascending: false, nullsFirst: false }).limit(PER_TYPE);
  return (data ?? []).map((r) => ({
    entity: "task" as const,
    id: r.id as number,
    code: (r.code as string) ?? null,
    label: (r.action_item as string) || (r.code as string),
    sublabel: [(r.companies as unknown as { name?: string } | null)?.name, r.status as string].filter(Boolean).join(" · "),
  }));
}

async function people(q: string): Promise<Item[]> {
  let sel = sb.from("people").select("id,name,role").eq("active", true);
  if (q) sel = sel.ilike("name", `%${escapeLike(q)}%`);
  const { data } = await sel.order("name").limit(PER_TYPE);
  return (data ?? []).map((r) => ({
    entity: "person" as const,
    id: r.id as number,
    code: null,
    label: r.name as string,
    sublabel: (r.role as string | null) || undefined,
  }));
}

async function companies(q: string): Promise<Item[]> {
  let sel = sb.from("companies").select("id,name,code_prefix");
  if (q) sel = sel.ilike("name", `%${escapeLike(q)}%`);
  const { data } = await sel.order("name").limit(PER_TYPE);
  return (data ?? []).map((r) => ({
    entity: "company" as const,
    id: r.id as number,
    code: null,
    label: r.name as string,
    sublabel: (r.code_prefix as string | null) || undefined,
  }));
}

async function documents(q: string): Promise<Item[]> {
  let sel = sb.from("documents").select("id,title,category,doc_type").eq("archived", false);
  if (q) sel = sel.ilike("title", `%${escapeLike(q)}%`);
  const { data } = await sel.order("created_at", { ascending: false }).limit(PER_TYPE);
  return (data ?? []).map((r) => ({
    entity: "document" as const,
    id: r.id as number,
    code: null,
    label: (r.title as string) || "Untitled document",
    sublabel: [r.category as string | null, r.doc_type as string | null].filter(Boolean).join(" · ") || undefined,
  }));
}

async function notes(q: string, excludeId: number | null): Promise<Item[]> {
  let sel = sb.from("notes").select("id,title,body_text").eq("archived", false);
  if (q) { const s = `%${escapeLike(q)}%`; sel = sel.or(`title.ilike.${s},body_text.ilike.${s}`); }
  // A note linking to itself is noise, never information.
  if (excludeId != null) sel = sel.neq("id", excludeId);
  const { data } = await sel.order("updated_at", { ascending: false }).limit(PER_TYPE * 2);
  return (data ?? []).map((r) => {
    const title = ((r.title as string) || "").trim();
    const body = ((r.body_text as string) || "").replace(/\s+/g, " ").trim();
    return {
      entity: "note" as const,
      id: r.id as number,
      code: null,
      // An untitled note is normal in this module — fall back to its first line, the
      // same rule `noteTitle()` follows on the shelf.
      label: title || body.slice(0, 60) || "Untitled note",
      sublabel: title ? body.slice(0, 60) || undefined : undefined,
    };
  });
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim().slice(0, 64);
    const scope = url.searchParams.get("scope") === "note" ? "note" : "all";
    const excludeRaw = Number(url.searchParams.get("exclude"));
    const exclude = Number.isFinite(excludeRaw) && excludeRaw > 0 ? excludeRaw : null;

    if (scope === "note") {
      return NextResponse.json({ items: await notes(q, exclude) });
    }

    // `@` searches everything the owner writes about. Ordered task → person →
    // company → document because that is how often each is actually mentioned.
    const [t, p, c, d] = await Promise.all([tasks(q), people(q), companies(q), documents(q)]);
    return NextResponse.json({ items: [...t, ...p, ...c, ...d] });
  } catch {
    return NextResponse.json({ items: [] });
  }
}

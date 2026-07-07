// /api/picker — a lean entity picker for ORI's clarify flow.
//
// GET ?type=task|person|company|document&q=<query>
//   → { items: { value: string; label: string; sublabel?: string }[] }  (cap ~12)
//
// `value` is exactly what ORI's agent expects to receive for that param:
//   - task     → the task CODE (resolveTask matches on code)
//   - person   → the person NAME (resolvePerson fuzzy-matches on name)
//   - company  → the company NAME (resolveCompany matches on name)
//   - document → the document TITLE (resolveDocument fuzzy-matches on title)
//
// With NO q, returns the most recent/relevant items of that type so the dropdown
// is useful before typing. Admin-only via the edge gate (src/proxy.ts). Column-
// scoped queries + a hard limit keep egress tiny. Fails open to { items: [] }.

import { NextRequest, NextResponse } from "next/server";
import { sb } from "@/db/supabase";

export const dynamic = "force-dynamic";

type PickerItem = { value: string; label: string; sublabel?: string };
type PickerType = "task" | "person" | "company" | "document";

const CAP = 12;

// Postgres LIKE wildcards → literals so a typed "%" doesn't blow the filter open.
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

async function pickTasks(q: string): Promise<PickerItem[]> {
  let sel = sb
    .from("tasks")
    .select("code,action_item,status,companies(name)")
    .not("status", "in", "(Completed,Closed)");
  if (q) {
    const safe = `%${escapeLike(q)}%`;
    sel = sel.or(`code.ilike.${safe},action_item.ilike.${safe}`);
  }
  const { data } = await sel.order("last_updated_at", { ascending: false, nullsFirst: false }).limit(CAP);
  return (data ?? []).map((r) => {
    const company = (r.companies as unknown as { name?: string } | null)?.name;
    return {
      value: r.code as string,
      label: `${r.code} · ${(r.action_item as string) ?? ""}`.trim(),
      sublabel: [company, r.status as string | null].filter(Boolean).join(" · ") || undefined,
    };
  });
}

async function pickPeople(q: string): Promise<PickerItem[]> {
  let sel = sb.from("people").select("name,role").eq("active", true);
  if (q) sel = sel.ilike("name", `%${escapeLike(q)}%`);
  const { data } = await sel.order("name", { ascending: true }).limit(CAP);
  return (data ?? []).map((r) => ({
    value: r.name as string,
    label: r.name as string,
    sublabel: (r.role as string | null) || undefined,
  }));
}

async function pickCompanies(q: string): Promise<PickerItem[]> {
  let sel = sb.from("companies").select("name,code");
  if (q) {
    const safe = `%${escapeLike(q)}%`;
    sel = sel.or(`name.ilike.${safe},code.ilike.${safe}`);
  }
  const { data } = await sel.order("name", { ascending: true }).limit(CAP);
  return (data ?? []).map((r) => ({
    value: r.name as string,
    label: r.name as string,
    sublabel: (r.code as string | null) || undefined,
  }));
}

async function pickDocuments(q: string): Promise<PickerItem[]> {
  let sel = sb.from("documents").select("id,title,doc_type").eq("archived", false);
  if (q) sel = sel.ilike("title", `%${escapeLike(q)}%`);
  const { data } = await sel.order("updated_at", { ascending: false, nullsFirst: false }).limit(CAP);
  return (data ?? []).map((r) => ({
    // Title resolves fuzzily; but a bare title can be ambiguous, so keep it human-
    // readable (resolveDocument also accepts a numeric id — title is the clearer
    // thing to hand the agent).
    value: (r.title as string) || String(r.id),
    label: (r.title as string) || `Document #${r.id}`,
    sublabel: (r.doc_type as string | null) || undefined,
  }));
}

export async function GET(req: NextRequest) {
  const type = (req.nextUrl.searchParams.get("type") || "").trim().toLowerCase() as PickerType;
  const q = (req.nextUrl.searchParams.get("q") || "").trim();

  try {
    let items: PickerItem[] = [];
    switch (type) {
      case "task": items = await pickTasks(q); break;
      case "person": items = await pickPeople(q); break;
      case "company": items = await pickCompanies(q); break;
      case "document": items = await pickDocuments(q); break;
      default: return NextResponse.json({ items: [] });
    }
    return NextResponse.json({ items });
  } catch {
    // Fail open — the card falls back to its free-text box.
    return NextResponse.json({ items: [] });
  }
}

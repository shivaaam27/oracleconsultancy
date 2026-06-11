// Unified "deep index" search across the whole COS system.
//
// One pass over the high-value entities — people, companies, documents,
// letters, meetings, vendors, assets — with typo-tolerant, relevance-ranked
// matching. Tasks are handled separately (they keep their rich action rows in
// the palette), so they're not duplicated here.
//
// Single-operator system with modest data volumes, so we fetch a wide net via
// per-token ilike OR-filters and rank in memory. No new infrastructure.

import { sb } from "@/db/supabase";

export type SearchResultType =
  | "person" | "company" | "document" | "letter" | "meeting" | "vendor" | "asset";

export type SearchResult = {
  type: SearchResultType;
  id: number;
  title: string;
  subtitle: string;
  href: string;
  badge?: string;
  score: number;
};

const STOP = new Set(["the", "a", "an", "of", "for", "to", "in", "on", "and", "is", "with"]);

function tokenize(q: string): string[] {
  return q
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOP.has(t))
    .slice(0, 6);
}

// Tiny bounded Levenshtein — returns true when within `max` edits.
function within(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  const prev = new Array(b.length + 1).fill(0).map((_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagPrev = prev[0];
    prev[0] = i;
    let rowMin = prev[0];
    for (let j = 1; j <= b.length; j++) {
      const cur = a[i - 1] === b[j - 1] ? diagPrev : Math.min(diagPrev, prev[j], prev[j - 1]) + 1;
      diagPrev = prev[j];
      prev[j] = cur;
      if (cur < rowMin) rowMin = cur;
    }
    if (rowMin > max) return false; // whole row already exceeds budget
  }
  return prev[b.length] <= max;
}

/**
 * Score how well `parts` (the searchable fields of a record, in priority order:
 * the most important field first) match the query tokens. Higher is better; 0
 * means no match at all (caller should drop it).
 */
function score(parts: (string | null | undefined)[], q: string, tokens: string[]): number {
  const fields = parts.map((p) => (p ?? "").toLowerCase()).filter(Boolean);
  if (fields.length === 0) return 0;
  const primary = fields[0];
  const haystack = fields.join(" ");
  let s = 0;

  // Whole-query signals on the primary field (name/title/code).
  if (primary === q) s += 120;
  else if (primary.startsWith(q)) s += 70;
  else if (haystack.includes(q)) s += 40;

  let matchedTokens = 0;
  for (const t of tokens) {
    let best = 0;
    for (let fi = 0; fi < fields.length; fi++) {
      const f = fields[fi];
      const weight = fi === 0 ? 1 : 0.5; // primary field matches count more
      const words = f.split(/[\s\-_/]+/);
      if (words.some((w) => w === t)) best = Math.max(best, 30 * weight);
      else if (words.some((w) => w.startsWith(t))) best = Math.max(best, 22 * weight);
      else if (f.includes(t)) best = Math.max(best, 14 * weight);
      else if (t.length >= 4 && words.some((w) => w.length >= 4 && within(w, t, 1)))
        best = Math.max(best, 10 * weight); // typo tolerance
    }
    if (best > 0) matchedTokens++;
    s += best;
  }

  // Every token must land somewhere, or it isn't a real hit.
  if (tokens.length > 0 && matchedTokens < tokens.length) {
    // Allow a single near-miss token only if the rest matched strongly.
    if (matchedTokens < tokens.length - 0) return 0;
  }
  return s;
}

function orIlike(cols: string[], tokens: string[]): string {
  const parts: string[] = [];
  for (const t of tokens) for (const c of cols) parts.push(`${c}.ilike.%${t}%`);
  return parts.join(",");
}

function one<T>(rel: T | T[] | null | undefined): T | null {
  return Array.isArray(rel) ? rel[0] ?? null : rel ?? null;
}

export async function unifiedSearch(query: string, perTypeLimit = 6): Promise<SearchResult[]> {
  const q = query.toLowerCase().trim();
  const tokens = tokenize(q);
  if (!q || tokens.length === 0) return [];

  // Small, typo-critical tables (people/companies/vendors/assets): fetch all and
  // rank in memory so near-miss spellings ("Solanky" → Solanki) still surface —
  // an ilike pre-filter would exclude typos before scoring ever runs.
  // Larger free-text tables (documents/letters/meetings): keep the ilike net.
  const [people, companies, documents, letters, meetings, vendors, assets] = await Promise.all([
    sb.from("people").select("id,name,role,email,nationality,passport_no,national_id,company_id,active, companies(name)").limit(500),
    sb.from("companies").select("id,name,code,code_prefix,legal_name").limit(100),
    sb.from("documents").select("id,title,category,doc_type,issuer,reference_no,company_id,person_id,archived, companies(name), people(name)")
      .eq("archived", false).or(orIlike(["title", "category", "doc_type", "issuer", "reference_no"], tokens)).limit(40),
    sb.from("letters").select("id,title,type,ref,status,company_id, companies(name), people(name)")
      .or(orIlike(["title", "type", "ref", "addressee", "subject"], tokens)).limit(20),
    sb.from("meetings").select("id,title,company_id,meeting_date,attendees, companies(name)")
      .or(orIlike(["title", "attendees", "minutes", "raw_notes"], tokens)).order("meeting_date", { ascending: false }).limit(20),
    sb.from("vendors").select("id,name,category,location,contact_name,company_id,active, companies(name)").eq("active", true).limit(300),
    sb.from("assets").select("id,name,tag,category,serial_no,status,archived, holder:people!assets_assigned_to_person_id_people_id_fk(name)").eq("archived", false).limit(500),
  ]);

  const out: SearchResult[] = [];
  const push = (r: SearchResult | null) => { if (r && r.score > 0) out.push(r); };

  for (const p of people.data ?? []) {
    const company = one<{ name?: string }>(p.companies as any)?.name ?? null;
    push({
      type: "person", id: p.id as number,
      title: p.name as string,
      subtitle: [p.role as string | null, company].filter(Boolean).join(" · ") || "Person",
      href: `/people?person=${p.id}`,
      badge: (p.active as boolean) === false ? "Archived" : undefined,
      score: score([p.name as string, p.role as string | null, company, p.email as string | null, p.passport_no as string | null, p.national_id as string | null, p.nationality as string | null], q, tokens),
    });
  }
  for (const c of companies.data ?? []) {
    push({
      type: "company", id: c.id as number,
      title: c.name as string,
      subtitle: [c.code as string | null, c.legal_name as string | null].filter(Boolean).join(" · ") || "Company",
      href: `/companies/${c.id}`,
      badge: (c.code_prefix as string | null) ?? undefined,
      score: score([c.name as string, c.code as string | null, c.code_prefix as string | null, c.legal_name as string | null], q, tokens),
    });
  }
  for (const d of documents.data ?? []) {
    const company = one<{ name?: string }>(d.companies as any)?.name ?? null;
    const person = one<{ name?: string }>(d.people as any)?.name ?? null;
    const owner = person || company;
    const href = d.person_id ? `/documents?person=${d.person_id}` : d.company_id ? `/documents?company=${d.company_id}` : `/documents`;
    push({
      type: "document", id: d.id as number,
      title: d.title as string,
      subtitle: [d.category as string | null, owner].filter(Boolean).join(" · ") || "Document",
      href,
      badge: (d.doc_type as string | null) ?? undefined,
      score: score([d.title as string, d.category as string | null, d.doc_type as string | null, d.issuer as string | null, d.reference_no as string | null, owner], q, tokens),
    });
  }
  for (const l of letters.data ?? []) {
    const company = one<{ name?: string }>(l.companies as any)?.name ?? null;
    const person = one<{ name?: string }>(l.people as any)?.name ?? null;
    push({
      type: "letter", id: l.id as number,
      title: (l.title as string) || (l.type as string) || "Letter",
      subtitle: [l.ref as string | null, person || company].filter(Boolean).join(" · ") || "Letter",
      href: `/letters/${l.id}`,
      badge: (l.status as string | null) ?? undefined,
      score: score([l.title as string | null, l.type as string | null, l.ref as string | null, person, company], q, tokens),
    });
  }
  for (const m of meetings.data ?? []) {
    const company = one<{ name?: string }>(m.companies as any)?.name ?? null;
    const date = m.meeting_date ? new Date(m.meeting_date as string).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : null;
    push({
      type: "meeting", id: m.id as number,
      title: m.title as string,
      subtitle: [company, date].filter(Boolean).join(" · ") || "Meeting",
      href: `/workbook?tab=meetings&open=${m.id}`,
      score: score([m.title as string, company, m.attendees as string | null], q, tokens),
    });
  }
  for (const v of vendors.data ?? []) {
    const company = one<{ name?: string }>(v.companies as any)?.name ?? null;
    push({
      type: "vendor", id: v.id as number,
      title: v.name as string,
      subtitle: [v.category as string | null, v.location as string | null, company].filter(Boolean).join(" · ") || "Vendor",
      href: `/hrms/assets?tab=vendors`,
      score: score([v.name as string, v.category as string | null, v.location as string | null, v.contact_name as string | null], q, tokens),
    });
  }
  for (const a of assets.data ?? []) {
    const holder = one<{ name?: string }>(a.holder as any)?.name ?? null;
    push({
      type: "asset", id: a.id as number,
      title: (a.name as string) || (a.tag as string) || "Asset",
      subtitle: [a.tag as string | null, a.category as string | null, holder ? `with ${holder}` : null].filter(Boolean).join(" · ") || "Asset",
      href: `/hrms/assets`,
      badge: (a.status as string | null) ?? undefined,
      score: score([a.name as string | null, a.tag as string | null, a.category as string | null, a.serial_no as string | null], q, tokens),
    });
  }

  // Rank globally, then keep at most `perTypeLimit` of each type so no single
  // type floods the list, then sort the survivors by score again.
  out.sort((x, y) => y.score - x.score);
  const counts: Record<string, number> = {};
  const kept = out.filter((r) => {
    counts[r.type] = (counts[r.type] ?? 0) + 1;
    return counts[r.type] <= perTypeLimit;
  });
  return kept.sort((x, y) => y.score - x.score).slice(0, 24);
}

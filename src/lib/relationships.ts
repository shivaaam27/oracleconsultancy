// Relationship inference (no AI): derive person↔company links from the governance
// facts the system reads off filings — Directors, Company Secretary, Signatories,
// Shareholders, Beneficial owners. Names are matched to existing people where
// possible; unmatched names (e.g. corporate shareholders) show as plain text.
// Read-only: this surfaces what the facts already say, it doesn't write anything.

import { sb } from "@/db/supabase";

export type CompanyRelationship = { role: string; name: string; personId: number | null; detail: string | null; documentId: number | null };
export type PersonRelationship = { role: string; companyId: number; companyName: string };

function roleOf(field: string): string | null {
  const f = field.toLowerCase();
  if (/director/.test(f)) return "Director";
  if (/secretary/.test(f)) return "Company secretary";
  if (/signator/.test(f)) return "Signatory";
  if (/sharehold/.test(f)) return "Shareholder";
  if (/benefic/.test(f)) return "Beneficial owner";
  if (/key person/.test(f)) return "Key person";
  if (/\bpartner\b/.test(f)) return "Partner";
  return null;
}

/** Split a fact value ("A; B (20%), C and D") into individual party strings. */
function splitParties(raw: string): string[] {
  return raw.split(/;|\n|,| and /i).map((s) => s.trim()).filter(Boolean);
}

/** A party string → { name, detail } stripping trailing share counts / percentages. */
function cleanParty(part: string): { name: string; detail: string | null } {
  const pctMatch = part.match(/\(([^)]*%[^)]*)\)|(\d+\s*%)/);
  const detail = pctMatch ? (pctMatch[1] || pctMatch[2]).trim() : null;
  const name = part
    .replace(/\([^)]*\)/g, " ")          // drop "(…)"
    .replace(/\b\d[\d,]*\s*%?/g, " ")     // drop share counts / percents
    .replace(/\s{2,}/g, " ").trim();
  return { name, detail };
}

const STOP = new Set(["the", "and", "ltd", "limited", "plc", "inc", "co", "company", "of", "mr", "mrs", "ms", "dr"]);
function sig(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").filter((w) => w.length >= 3 && !STOP.has(w));
}
function matchPerson(name: string, people: Array<{ id: number; name: string }>): { id: number; name: string } | null {
  const q = name.trim().toLowerCase();
  for (const p of people) if (p.name.toLowerCase() === q) return p;
  const qs = sig(name);
  if (qs.length < 2) return null;
  let best: { p: { id: number; name: string }; ov: number } | null = null;
  for (const p of people) {
    const ps = sig(p.name);
    const ov = qs.filter((t) => ps.includes(t)).length;
    if (ov >= 2 && (!best || ov > best.ov)) best = { p, ov };
  }
  return best?.p ?? null;
}

/** People (and corporate parties) tied to a company by its governance facts. */
export async function getCompanyRelationships(companyId: number): Promise<CompanyRelationship[]> {
  const [{ data: facts }, { data: people }] = await Promise.all([
    sb.from("facts").select("field,display,value,document_id").eq("company_id", companyId),
    sb.from("people").select("id,name"),
  ]);
  const peopleList = (people ?? []).map((p) => ({ id: p.id as number, name: p.name as string }));
  const out: CompanyRelationship[] = [];
  const seen = new Set<string>();
  for (const fct of facts ?? []) {
    const role = roleOf(fct.field as string);
    if (!role) continue;
    const raw = (fct.display as string | null) || (typeof fct.value === "string" ? fct.value : JSON.stringify(fct.value ?? ""));
    for (const part of splitParties(raw)) {
      const { name, detail } = cleanParty(part);
      if (!name || name.length < 2) continue;
      const person = matchPerson(name, peopleList);
      const key = `${role}|${(person?.id ?? name).toString().toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ role, name: person?.name ?? name, personId: person?.id ?? null, detail, documentId: (fct.document_id as number | null) ?? null });
    }
  }
  // Directors first, then by role, then matched people before plain names.
  const order = ["Director", "Shareholder", "Company secretary", "Signatory", "Beneficial owner", "Partner", "Key person"];
  return out.sort((a, b) => (order.indexOf(a.role) - order.indexOf(b.role)) || (Number(!!b.personId) - Number(!!a.personId)) || a.name.localeCompare(b.name));
}

/** The companies a person is tied to across ALL filings (reverse view) — e.g. one
 *  director who sits on several boards. */
export async function getPersonRelationships(personId: number): Promise<PersonRelationship[]> {
  const { data: person } = await sb.from("people").select("id,name").eq("id", personId).maybeSingle();
  if (!person) return [];
  const { data: companies } = await sb.from("companies").select("id,name");
  const cList = (companies ?? []).map((c) => ({ id: c.id as number, name: c.name as string }));
  const self = { id: person.id as number, name: person.name as string };
  const out: PersonRelationship[] = [];
  const seen = new Set<string>();
  for (const c of cList) {
    const rels = await getCompanyRelationships(c.id);
    for (const r of rels) {
      if (r.personId === self.id) {
        const key = `${c.id}|${r.role}`;
        if (seen.has(key)) continue; seen.add(key);
        out.push({ role: r.role, companyId: c.id, companyName: c.name });
      }
    }
  }
  return out;
}

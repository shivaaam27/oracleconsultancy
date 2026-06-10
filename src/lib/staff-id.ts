import { sb } from "@/db/supabase";
import { categoryLetter } from "./staff-id-shared";

/* ------------------------------------------------------------------ *
 * Staff IDs — a formal, system-wide identifier per staff member.
 *
 * Format:  <companyPrefix>-<roleLetter><NN>   e.g. CZ-E04, OC-D01, DS-AH02
 *   companyPrefix  the person's primary company code_prefix (CZ, DS, OC…)
 *   roleLetter     D Director, AH Admin & HR, M Manager, E Employee —
 *                  derived live from role text, or an explicit override
 *                  (people.staff_category). See staff-id-shared.ts.
 *   NN             2-digit chronological number — rank among the company's
 *                  STAFF ordered by id ascending. Stable (id never changes).
 *
 * Pure helpers (roleLetter, categoryLetter, STAFF_CATEGORIES) live in
 * staff-id-shared.ts so client components can import them without pulling
 * in the server-only Supabase client. This file is server-only.
 * ------------------------------------------------------------------ */

export * from "./staff-id-shared";

const STAFF_TYPES = ["local_staff", "expat"];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Builds the id → "PREFIX-LNN" map for every staff member in one pass.
 *  Returns an empty map if there is no data. */
export async function getStaffIdMap(): Promise<Map<number, string>> {
  const [{ data: people }, { data: companies }] = await Promise.all([
    sb.from("people").select("id,company_id,role,person_type,staff_category").order("id", { ascending: true }),
    sb.from("companies").select("id,code_prefix"),
  ]);

  const prefixOf = new Map<number, string>();
  for (const c of companies ?? []) {
    if (c.code_prefix) prefixOf.set(c.id as number, c.code_prefix as string);
  }

  // Rank staff within each company by id ascending.
  const seqByCompany = new Map<number, number>();
  const out = new Map<number, string>();
  for (const p of people ?? []) {
    const companyId = p.company_id as number | null;
    const type = (p.person_type as string | null) ?? "local_staff";
    if (companyId == null || !STAFF_TYPES.includes(type)) continue;
    const prefix = prefixOf.get(companyId);
    if (!prefix) continue;
    const next = (seqByCompany.get(companyId) ?? 0) + 1;
    seqByCompany.set(companyId, next);
    const letter = categoryLetter(p.staff_category as string | null, p.role as string | null);
    out.set(p.id as number, `${prefix}-${letter}${pad2(next)}`);
  }
  return out;
}

/** Convenience: the staff ID for a single person, or null if not a numbered
 *  staff member. Prefer getStaffIdMap when you need several. */
export async function staffIdFor(personId: number): Promise<string | null> {
  const map = await getStaffIdMap();
  return map.get(personId) ?? null;
}

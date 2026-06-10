import { sb } from "@/db/supabase";

/* ------------------------------------------------------------------ *
 * Staff IDs — a formal, system-wide identifier per staff member.
 *
 * Format:  <companyPrefix>-<roleLetter><NN>   e.g. CZ-E04, OC-D01, DS-AH02
 *   companyPrefix  the person's primary company code_prefix (CZ, DS, OC…)
 *   roleLetter     derived live from their role text:
 *                    D  Director
 *                    AH Admin & Human Resources
 *                    M  Manager
 *                    E  Employee (default)
 *   NN             2-digit chronological number — the person's rank among
 *                  their company's STAFF, ordered by when they entered the
 *                  system (id ascending). Stable: id never changes, so the
 *                  number never shifts for existing people.
 *
 * Everything is computed live from current data, so changing a person's
 * role updates the letter, and moving them to another company updates the
 * prefix + number automatically. Only staff (local_staff / expat) are
 * numbered; outsiders/candidates get no ID.
 * ------------------------------------------------------------------ */

const STAFF_TYPES = ["local_staff", "expat"];

export type RoleLetter = "D" | "M" | "AH" | "E";

/** Map a free-text role to its category letter. Precedence matters:
 *  Director beats everything; Admin/HR beats Manager (so "Admin and HR
 *  Manager" → AH, not M). */
export function roleLetter(role: string | null | undefined): RoleLetter {
  const r = (role ?? "").toLowerCase();
  // Director / C-suite (CFO, CEO, CTO, COO, CIO, CMO, "chief …").
  if (/director|chief|\b(cfo|ceo|cto|coo|cio|cmo)\b/.test(r)) return "D";
  if (/admin|hr|human resourc/.test(r)) return "AH";
  if (/manager|head|lead/.test(r)) return "M";
  return "E";
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Builds the id → "PREFIX-LNN" map for every staff member in one pass.
 *  Returns an empty map if there is no data. */
export async function getStaffIdMap(): Promise<Map<number, string>> {
  const [{ data: people }, { data: companies }] = await Promise.all([
    sb.from("people").select("id,company_id,role,person_type").order("id", { ascending: true }),
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
    out.set(p.id as number, `${prefix}-${roleLetter(p.role as string | null)}${pad2(next)}`);
  }
  return out;
}

/** Convenience: the staff ID for a single person, or null if not a numbered
 *  staff member. Prefer getStaffIdMap when you need several. */
export async function staffIdFor(personId: number): Promise<string | null> {
  const map = await getStaffIdMap();
  return map.get(personId) ?? null;
}

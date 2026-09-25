/* ------------------------------------------------------------------ *
 * Staff IDs — pure, client-safe helpers (no DB imports). The DB-backed
 * map lives in staff-id.ts (server only). See that file for the format.
 * ------------------------------------------------------------------ */

export type RoleLetter = "D" | "M" | "AH" | "E";

/** The explicit category values stored in people.staff_category. */
export const STAFF_CATEGORIES = [
  { value: "", label: "Auto (from role/title)" },
  { value: "director", label: "Director (D)" },
  { value: "manager", label: "Manager (M)" },
  { value: "admin_hr", label: "Admin & HR (AH)" },
  { value: "employee", label: "Employee (E)" },
] as const;

const CATEGORY_LETTER: Record<string, RoleLetter> = {
  director: "D",
  manager: "M",
  admin_hr: "AH",
  employee: "E",
};

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

/** The category letter, preferring an explicit override, else derived. */
export function categoryLetter(staffCategory: string | null | undefined, role: string | null | undefined): RoleLetter {
  if (staffCategory && CATEGORY_LETTER[staffCategory]) return CATEGORY_LETTER[staffCategory];
  return roleLetter(role);
}

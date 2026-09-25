// The Director Brief's query parameters: `co` (companies), `who` (people) and
// `role`. The company filter is deliberately NOT `?company=` — that word is
// claimed app-wide by the global CompanyDrawer (src/components/companies/company-drawer.tsx),
// which opens a company preview on it and DELETES it on close.

export type BriefPersonRole = "lead" | "working";

/** Read the role qualifier from a query value; null unless it's one of the two. */
export function parseBriefPersonRole(value: string | null | undefined): BriefPersonRole | null {
  return value === "lead" || value === "working" ? value : null;
}

/** The last `count` calendar months, newest first, for the month dropdown.
 *  Values are bare "YYYY-MM" — the `on:` prefix is added when several are
 *  combined. Built on the SERVER off a passed-in `now` so the labels can't
 *  drift between server and browser. */
export function briefMonthOptions(now: Date, count = 12): Array<{ value: string; label: string }> {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return {
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
    };
  });
}

/** Read a comma-separated id list ("3" or "1,3,5"). Junk entries are dropped,
 *  so a malformed link degrades to "no filter" rather than erroring. */
export function parseBriefIdList(value: string | null | undefined): number[] {
  if (!value) return [];
  const ids = value
    .split(",")
    .map((v) => v.trim())
    .filter((v) => /^\d+$/.test(v))
    .map((v) => parseInt(v, 10));
  return [...new Set(ids)];
}

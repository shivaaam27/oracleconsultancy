// Canonical /brief links. One place builds them so the screen filters, the PDF
// button and the share links can never drift apart.

import type { BriefPeriod } from "@/lib/director-brief";

/**
 * The Director Brief's OWN company-filter parameter.
 *
 * Deliberately NOT `?company=`. That word is claimed app-wide by the global
 * CompanyDrawer (src/components/company-drawer.tsx), mounted in the root
 * layout: it opens a company PREVIEW on any `?company=<id>` outside
 * /companies/[id], and its close handler DELETES the parameter. Sharing the
 * name made this filter unusable — picking a company popped a preview over the
 * report, and dismissing that preview reset the brief to Portfolio. The page
 * redirects legacy `?company=` links onto this parameter.
 */
export const BRIEF_COMPANY_PARAM = "co";

/** The person filter (null = everyone). Its own word for the same reason. */
export const BRIEF_PERSON_PARAM = "who";

/** Narrows a person filter to one of their two roles on a task. Null = both,
 *  which is the default and matches the unqualified person filter. */
export const BRIEF_ROLE_PARAM = "role";
export type BriefPersonRole = "lead" | "working";

/** What the /brief screen and its PDF are currently filtered to. Companies and
 *  people are BOTH multi-select — empty array = no filter (all of them). */
export type BriefSelection = {
  companyIds: number[];
  personIds: number[];
  personRole?: BriefPersonRole | null;
};

function briefParams(period: BriefPeriod, sel: BriefSelection, alwaysPeriod = false) {
  const params = new URLSearchParams();
  if (alwaysPeriod || period !== "month") params.set("period", period);
  if (sel.companyIds.length) params.set(BRIEF_COMPANY_PARAM, idList(sel.companyIds));
  if (sel.personIds.length) params.set(BRIEF_PERSON_PARAM, idList(sel.personIds));
  // Only meaningful alongside a person — dropped otherwise so stray links can't
  // carry a role that filters nothing.
  if (sel.personIds.length && sel.personRole) params.set(BRIEF_ROLE_PARAM, sel.personRole);
  return params;
}

/** Ids as a stable, deduped, comma-joined string. */
function idList(ids: number[]): string {
  return [...new Set(ids)].sort((a, b) => a - b).join(",");
}

/** Read the role qualifier from a query value; null unless it's one of the two. */
export function parseBriefPersonRole(value: string | null | undefined): BriefPersonRole | null {
  return value === "lead" || value === "working" ? value : null;
}

/** The /brief page for a given period + selection (no params = whole portfolio). */
export function briefHref(period: BriefPeriod, sel: BriefSelection): string {
  const q = briefParams(period, sel).toString();
  return q ? `/brief?${q}` : "/brief";
}

/** The PDF route, mirroring the on-screen selection exactly. */
export function briefPdfHref(period: BriefPeriod, sel: BriefSelection): string {
  return `/brief/pdf?${briefParams(period, sel, true).toString()}`;
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

/** The months currently ticked, as bare "YYYY-MM" (empty for preset periods). */
export function briefSelectedMonths(period: string): string[] {
  return period.startsWith("on:") ? period.slice(3).split(",").filter(Boolean) : [];
}

/** Turn ticked months back into a period. No months = fall back to this month. */
export function briefMonthsToPeriod(months: string[]): string {
  const unique = [...new Set(months)].sort();
  return unique.length ? `on:${unique.join(",")}` : "month";
}

/** Read a single id from a query value; null unless it's a plain integer. */
export function parseBriefCompanyId(value: string | null | undefined): number | null {
  return value && /^\d+$/.test(value) ? parseInt(value, 10) : null;
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

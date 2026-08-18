// The project's reference lists — client-safe half (Phase 7).

/** The six lists a project keeps. Adding a seventh is one entry here. */
export const REF_KINDS = [
  {
    kind: "category",
    noun: "Category",
    plural: "Categories",
    blurb: "The job code on a budget line — CEMENT, SAND, LABOUR. Groups spending on the dashboard.",
    placeholder: "CEMENT",
    upper: true,
  },
  {
    kind: "sub_job",
    noun: "Sub-job",
    plural: "Sub-jobs",
    blurb: "Where in the build it is used — STRIP-FOUNDATION, FOUNDATION-WALLS.",
    placeholder: "STRIP-FOUNDATION",
    upper: true,
  },
  {
    kind: "supplier",
    noun: "Supplier",
    plural: "Suppliers",
    blurb: "Who you buy from. Used on requisitions and on direct payments.",
    placeholder: "Nelly & Mushy",
    upper: false,
  },
  {
    kind: "route",
    noun: "Payment route",
    plural: "Who pays",
    blurb: "Who settles a requisition — SHAO, SUPPLIER, HQ.",
    placeholder: "SHAO",
    upper: true,
  },
  {
    kind: "float_holder",
    noun: "Float holder",
    plural: "Whose float",
    blurb: "Who holds site cash and spends it — each has their own running balance.",
    placeholder: "SHAO",
    upper: true,
  },
  {
    kind: "designation",
    noun: "Designation",
    plural: "Designations",
    blurb: "A site person's job — Site foreman, Casual labourer.",
    placeholder: "Site foreman",
    upper: false,
  },
] as const;

export type RefKind = (typeof REF_KINDS)[number]["kind"];

export type ProjectRef = {
  id: number;
  projectId: number;
  kind: string;
  name: string;
  sortOrder: number;
  active: boolean;
};

export function refMeta(kind: string) {
  return REF_KINDS.find((k) => k.kind === kind);
}

/**
 * How a name is stored.
 *
 * Codes are shouty and joined into item codes, so they are upper-cased and their
 * spacing tidied — otherwise `Cement` and `CEMENT` become two categories and one
 * material's spending splits in two. A supplier's name is a proper noun and is
 * left exactly as typed.
 */
export function normaliseRefName(kind: string, name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  return refMeta(kind)?.upper ? trimmed.toUpperCase() : trimmed;
}

/**
 * The lists a project must have before a screen can work.
 *
 * ⚠️ Used ONLY to tell the owner what is still empty — never to create anything.
 * Nothing here is written without a button being pressed.
 */
export function missingFor(screen: "budget" | "requisitions" | "cash" | "site", refs: ProjectRef[]): string[] {
  const has = (k: RefKind) => refs.some((r) => r.kind === k && r.active);
  const need: Record<typeof screen, RefKind[]> = {
    budget: ["category", "sub_job"],
    requisitions: ["route", "supplier"],
    cash: ["float_holder"],
    site: ["designation"],
  } as never;
  return (need[screen] ?? []).filter((k) => !has(k)).map((k) => refMeta(k)?.plural ?? k);
}

/**
 * The lists the PES workbook actually uses, offered as a starting point.
 *
 * ⚠️ OFFERED, NEVER APPLIED BY ITSELF. This is behind a button the owner
 * presses, exactly like the payment plan. A list that appeared on its own is
 * the auto-filling he has asked twice not to have.
 */
export const STARTER_LISTS: Record<RefKind, string[]> = {
  category: [],
  sub_job: [],
  supplier: [],
  route: ["SHAO", "SUPPLIER", "HQ", "ALANDO"],
  float_holder: ["SHAO", "MAURICE"],
  designation: ["Site foreman", "Casual labourer", "Safety officer"],
};

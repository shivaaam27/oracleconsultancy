// What can be exported from a project, in the order the tabs run.
//
// Client-safe (a plain list, no database): the menu in the tabs bar reads it,
// and `/api/projects/[id]/export` answers with the matching `what`. Adding an
// export means one entry here and one `case` in that route.

export const PROJECT_EXPORTS = [
  { key: "summary", label: "Project summary" },
  { key: "budget", label: "Budget (BOQ)" },
  { key: "requisitions", label: "Requisitions" },
  { key: "payments", label: "Payments in" },
  { key: "expenditures", label: "Spending" },
  { key: "funds", label: "Funds by batch" },
  { key: "snapshot", label: "Budget vs actual" },
  { key: "plan", label: "Payment plan" },
  { key: "site-people", label: "Site people" },
  { key: "site-days", label: "Site days (meals + wages)" },
  { key: "history", label: "Change history" },
] as const;

/** The export that matches a tab, so the menu can offer it first. */
export const EXPORT_FOR_TAB: Record<string, string> = {
  overview: "summary",
  budget: "budget",
  requisitions: "requisitions",
  cash: "expenditures",
  funds: "funds",
  snapshot: "snapshot",
  site: "site-days",
  history: "history",
};

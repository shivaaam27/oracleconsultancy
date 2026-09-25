export type CompanyTab = "overview" | "profile" | "tasks" | "notes" | "timeline" | "org";

export function parseCompanyTab(v: string | undefined): CompanyTab {
  if (v === "profile" || v === "tasks" || v === "notes" || v === "timeline" || v === "org") return v;
  // Legacy deep-links: the File tab merged into Profile; Completed folds into Tasks.
  if (v === "file") return "profile";
  if (v === "completed") return "tasks";
  return "overview";
}

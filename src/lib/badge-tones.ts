/* Canonical Badge tones for task status + priority — one source of truth so the
 * portal and admin colour tasks identically. Tones map to <Badge tone={...}>. */

export type BadgeTone = "default" | "success" | "warn" | "danger" | "info";

export function taskStatusTone(status: string): BadgeTone {
  if (status === "Completed" || status === "Closed") return "success";
  if (status === "Blocked" || status === "Escalated") return "danger";
  if (status === "Waiting External" || status === "Under Review") return "warn";
  if (status === "In Progress") return "info";
  return "default";
}

export function priorityTone(priority: string): BadgeTone {
  if (priority === "Critical") return "danger";
  if (priority === "High") return "warn";
  if (priority === "Medium") return "info";
  return "default";
}

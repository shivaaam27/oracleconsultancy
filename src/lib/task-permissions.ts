// Single source of truth for "who may edit/complete a portal task" (CLAUDE.md:
// reuse, don't duplicate). Pure + client-safe (no DB, no server-only imports) so
// the same rule drives the server actions AND the cards/pages that decide whether
// to show an Edit affordance or the swipe-Complete tray.
//
// Rule (owner's brief, Jun 2026):
//   • Directors and HR may edit AND complete/close/reopen ANY task.
//   • Everyone else (managers, staff) may edit + complete ONLY a task they created.
//   • The Administrator (owner/admin) is not a portal person — admin paths bypass
//     this helper entirely and always have full access.
// Editing and completing share the same predicate today; kept as two named
// exports so a future divergence is a one-line change, not a hunt.

export type TaskPermViewer = {
  id: number;
  portalRole: string | null | undefined;
  /** Owner-configurable "manage any task" grant for this viewer's role (from
   *  Settings → Portals). When provided it wins; when omitted we fall back to the
   *  built-in default (director/HR) so existing callers behave exactly as before. */
  canManageAny?: boolean;
};
export type TaskPermTask = { createdByPersonId: number | null };

/** True when the viewer created the task. */
export function isTaskCreator(viewer: TaskPermViewer, task: TaskPermTask): boolean {
  return task.createdByPersonId != null && viewer.id === task.createdByPersonId;
}

/** The core predicate: a role with the "manage any task" grant (config; default
 *  director/HR), or the task's own creator (always — the creator rule is fixed). */
export function canManageTask(viewer: TaskPermViewer, task: TaskPermTask): boolean {
  const r = (viewer.portalRole ?? "").toLowerCase();
  const manageAny = viewer.canManageAny ?? (r === "director" || r === "hr");
  if (manageAny) return true;
  return isTaskCreator(viewer, task);
}

/** May edit the task's content (title, description, priority, due, leads/owner). */
export const canEditTask = canManageTask;

/** May complete / close / reopen the task (the terminal transitions). */
export const canCompleteTask = canManageTask;

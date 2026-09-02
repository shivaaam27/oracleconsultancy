import { getGivenName } from "@/lib/names";

/**
 * Resolve a task update's `created_by` stamp to a viewer-aware display name for
 * the PORTAL. The rule (owner's brief):
 *   • "You" ONLY when the current viewer authored it from their own portal.
 *   • A portal update by someone else → the poster's FIRST name.
 *   • Command-centre updates (`web-ui`, and any non-portal stamp) → the literal
 *     "Administrator" — never "You" (the portal viewer isn't the administrator)
 *     and never a person's name (nobody in the portal authored it).
 * Stamps: "portal:Name" (staff), "portal-dir:Name", "portal-mgr:Name",
 * "portal-hr:Name", "web-ui" (admin/administrator), "ai-command", "meeting-mode".
 */
export function portalUpdateAuthor(by: string | null, viewerName: string): string {
  if (!by) return "System";
  if (by === "ai-command") return "ORI";
  if (by === "meeting-mode") return "Meeting";

  let name: string | null = null;
  if (by.startsWith("portal-dir:")) name = by.slice(11);
  else if (by.startsWith("portal-mgr:")) name = by.slice(11);
  else if (by.startsWith("portal-hr:")) name = by.slice(10);
  else if (by.startsWith("portal:")) name = by.slice(7);

  if (name) {
    if (name.trim().toLowerCase() === viewerName.trim().toLowerCase()) return "You";
    return getGivenName(name);
  }
  // web-ui or any other non-portal stamp = the administrator / admin side.
  return "Administrator";
}

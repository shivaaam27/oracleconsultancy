import { getGivenName } from "@/lib/names";

/**
 * Resolve a task update's `created_by` stamp to a viewer-aware display name for
 * the PORTAL. The rule (owner's brief):
 *   • "You" ONLY when the current viewer authored it from their own portal.
 *   • Everyone else sees the updater's FIRST name.
 *   • Command-centre updates (`web-ui`) show the configured owner name (or
 *     "Management") — never "You" (the portal viewer isn't the command centre).
 * Stamps: "portal:Name" (staff), "portal-dir:Name", "portal-mgr:Name",
 * "portal-hr:Name", "web-ui" (admin), "ai-command", "meeting-mode".
 */
export function portalUpdateAuthor(
  by: string | null,
  viewerName: string,
  ownerName: string | null,
): string {
  if (!by) return "System";
  if (by === "ai-command") return "ORI";
  if (by === "meeting-mode") return "Meeting";
  if (by === "web-ui") return ownerName ? getGivenName(ownerName) : "Management";

  let name: string | null = null;
  if (by.startsWith("portal-dir:")) name = by.slice(11);
  else if (by.startsWith("portal-mgr:")) name = by.slice(11);
  else if (by.startsWith("portal-hr:")) name = by.slice(10);
  else if (by.startsWith("portal:")) name = by.slice(7);

  if (name) {
    if (name.trim().toLowerCase() === viewerName.trim().toLowerCase()) return "You";
    return getGivenName(name);
  }
  return "Management";
}

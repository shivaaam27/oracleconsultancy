import { sb } from "@/db/supabase";

/**
 * Is this notification recipient ("admin" | "person:<id>") a director? Directors
 * use the shared Studio screens, so a push must never send them to an old
 * portal page, and nothing about Announcements or Chat (blocked for them until
 * those are rebuilt) should buzz their phone (push audit, 25 Sept 2026).
 */
export async function isDirectorRecipient(recipient: string): Promise<boolean> {
  const m = /^person:(\d+)$/.exec(recipient);
  if (!m) return false;
  const { data } = await sb.from("people").select("portal_role").eq("id", Number(m[1])).maybeSingle();
  // Directors and managers use the Studio screens (lib/viewer.ts STUDIO_ROLES).
  return data?.portal_role === "director" || data?.portal_role === "manager";
}

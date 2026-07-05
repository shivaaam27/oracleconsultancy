import "server-only";
import { cache } from "react";
import { sb } from "@/db/supabase";
import type { PortalPermissionsConfig } from "@/lib/portal-permissions";

/* Server load/save for the owner-configurable portal permissions. Stored as ONE
 * JSON row in the settings table (no migration). Cached per request so the many
 * scope/capability reads in a single page render share one query. */

const KEY = "v2.portalPermissions";

export const getPortalPermissions = cache(async (): Promise<PortalPermissionsConfig> => {
  try {
    const { data } = await sb.from("settings").select("value").eq("key", KEY).maybeSingle();
    const raw = data?.value as string | null | undefined;
    if (!raw) return {};
    const parsed = JSON.parse(raw) as PortalPermissionsConfig;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    // Any read/parse failure falls back to defaults (empty override) — the app
    // keeps today's behaviour rather than breaking on a bad row.
    return {};
  }
});

export async function savePortalPermissions(config: PortalPermissionsConfig): Promise<void> {
  const { error } = await sb
    .from("settings")
    .upsert({ key: KEY, value: JSON.stringify(config ?? {}) }, { onConflict: "key" });
  if (error) throw new Error(error.message);
}

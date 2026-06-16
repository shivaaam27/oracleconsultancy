// Automation config — stored as a JSON blob in `settings` (key "email.automation")
// so the owner controls it without a schema change. Server-only (touches the DB).

import { sb } from "@/db/supabase";
import type { AutomationConfig, EmailCategory } from "./types";
import { CATEGORY_META } from "./meta";

const CONFIG_KEY = "email.automation";

const DEFAULT_CATEGORIES = Object.fromEntries(
  CATEGORY_META.map((m) => [m.key, { mode: "off" as const }]),
) as AutomationConfig["categories"];

export const DEFAULTS: AutomationConfig = {
  paused: false,
  windowStartHour: 8,
  windowEndHour: 18,
  dailyCap: 50,
  cooldownDays: 2,
  briefDay: 1, // Monday
  categories: DEFAULT_CATEGORIES,
};

export async function getAutomationConfig(): Promise<AutomationConfig> {
  const { data } = await sb.from("settings").select("value").eq("key", CONFIG_KEY).maybeSingle();
  if (!data?.value) return DEFAULTS;
  try {
    const saved = JSON.parse(data.value as string) as Partial<AutomationConfig>;
    // Rebuild categories strictly from the KNOWN keys, so any stale categories left
    // in the saved blob (e.g. removed placeholders) are dropped, and new ones get
    // their default. This keeps the config in lockstep with the type.
    const categories = Object.fromEntries(
      (Object.keys(DEFAULT_CATEGORIES) as EmailCategory[]).map((k) => [
        k,
        saved.categories?.[k] ?? DEFAULT_CATEGORIES[k],
      ]),
    ) as AutomationConfig["categories"];
    return { ...DEFAULTS, ...saved, categories };
  } catch {
    return DEFAULTS;
  }
}

export async function saveAutomationConfig(patch: Partial<AutomationConfig>): Promise<void> {
  const current = await getAutomationConfig();
  const next: AutomationConfig = {
    ...current,
    ...patch,
    categories: { ...current.categories, ...(patch.categories ?? {}) },
  };
  await sb.from("settings").upsert({ key: CONFIG_KEY, value: JSON.stringify(next) }, { onConflict: "key" });
}

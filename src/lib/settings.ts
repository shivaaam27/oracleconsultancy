import { cache } from "react";
import { sb } from "@/db/supabase";
import { DUE_SOON_DAYS, AGING_CRITICAL_DAYS, BLOCKED_STALLED_DAYS } from "./derive";

/**
 * Canonical V2 app settings. These are the ONLY settings that drive behaviour.
 * Stored as individual rows in the `settings` table under `v2.*` keys so they
 * never collide with the old Excel-era rows or the `nav.*` preference rows.
 */
export type AppSettings = {
  dueSoonDays: number;
  stalledDays: number;
  agingDays: number;
  weatherCity: string;
  weatherLat: number;
  weatherLon: number;
  aiEnabled: boolean;
};

export const DEFAULT_SETTINGS: AppSettings = {
  dueSoonDays: DUE_SOON_DAYS,
  stalledDays: BLOCKED_STALLED_DAYS,
  agingDays: AGING_CRITICAL_DAYS,
  weatherCity: "Dar es Salaam",
  weatherLat: -6.7924,
  weatherLon: 39.2083,
  aiEnabled: true,
};

/** Map of canonical setting field → storage key. */
const KEY: Record<keyof AppSettings, string> = {
  dueSoonDays: "v2.dueSoonDays",
  stalledDays: "v2.stalledDays",
  agingDays: "v2.agingDays",
  weatherCity: "v2.weatherCity",
  weatherLat: "v2.weatherLat",
  weatherLon: "v2.weatherLon",
  aiEnabled: "v2.aiEnabled",
};

const STORAGE_KEYS = Object.values(KEY);

function toNum(v: string | null | undefined, fallback: number): number {
  if (v == null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function toBool(v: string | null | undefined, fallback: boolean): boolean {
  if (v == null) return fallback;
  return v === "true" || v === "1";
}

/**
 * Load the effective app settings (stored values merged over defaults).
 * Cached per request via React cache().
 */
export const getAppSettings = cache(async (): Promise<AppSettings> => {
  const { data } = await sb.from("settings").select("key,value").in("key", STORAGE_KEYS);
  const map = new Map((data ?? []).map((r) => [r.key as string, r.value as string | null]));
  const d = DEFAULT_SETTINGS;
  return {
    dueSoonDays: toNum(map.get(KEY.dueSoonDays), d.dueSoonDays),
    stalledDays: toNum(map.get(KEY.stalledDays), d.stalledDays),
    agingDays: toNum(map.get(KEY.agingDays), d.agingDays),
    weatherCity: map.get(KEY.weatherCity) ?? d.weatherCity,
    weatherLat: toNum(map.get(KEY.weatherLat), d.weatherLat),
    weatherLon: toNum(map.get(KEY.weatherLon), d.weatherLon),
    aiEnabled: toBool(map.get(KEY.aiEnabled), d.aiEnabled),
  };
});

/** Persist a partial set of settings. Values are stored as strings. */
export async function saveAppSettings(patch: Partial<AppSettings>): Promise<void> {
  const rows = (Object.entries(patch) as [keyof AppSettings, AppSettings[keyof AppSettings]][])
    .filter(([, v]) => v !== undefined)
    .map(([field, v]) => ({ key: KEY[field], value: String(v) }));
  if (rows.length === 0) return;
  const { error } = await sb.from("settings").upsert(rows, { onConflict: "key" });
  if (error) throw new Error(error.message);
}

/**
 * Returns the Groq API key only when AI is enabled in settings AND a key is set.
 * AI routes already degrade gracefully when this is null, so toggling AI off
 * makes the whole app run manually via existing fallbacks.
 */
export async function getGroqKey(): Promise<string | undefined> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return undefined;
  const { aiEnabled } = await getAppSettings();
  return aiEnabled ? key : undefined;
}

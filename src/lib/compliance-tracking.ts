// Which companies are held to the statutory compliance checklist. Stored as a
// simple list of UNTRACKED company ids in the settings key/value table (no schema
// change). A company on this list drops out of scoring entirely — no score, no
// "missing" flags, no 0% — it just holds documents. Default: every company tracked.

import { sb } from "@/db/supabase";

const KEY = "compliance.untrackedCompanies";

export async function getUntrackedCompanyIds(): Promise<Set<number>> {
  const { data } = await sb.from("settings").select("value").eq("key", KEY).maybeSingle();
  try {
    const arr = JSON.parse((data?.value as string | null) ?? "[]");
    return new Set(Array.isArray(arr) ? arr.map(Number).filter((n) => Number.isFinite(n)) : []);
  } catch {
    return new Set();
  }
}

/** Turn statutory tracking on/off for one company. */
export async function setCompanyComplianceTracked(companyId: number, tracked: boolean): Promise<void> {
  const set = await getUntrackedCompanyIds();
  if (tracked) set.delete(companyId);
  else set.add(companyId);
  const { error } = await sb.from("settings").upsert(
    { key: KEY, value: JSON.stringify([...set]) },
    { onConflict: "key" },
  );
  if (error) throw new Error(error.message);
}

// Which company's books am I looking at? (SERVER-ONLY, imports `sb`.)
//
// Shared by all three ledger screens so they can never disagree about the
// default. Lifted out of the page because a Next App Router page may only
// export a default, `metadata` and the route options — a second export there
// is a build error, not a style point.

import { sb } from "@/db/supabase";

export type LedgerCompany = { id: number; name: string };

/**
 * The company list, and the one being viewed.
 *
 * ⚠️ The parameter is `co`, NOT `company`. `?company=<id>` is watched globally
 * by `CompanyDrawer` and slides a company preview open over whatever page you
 * were on — the trap Orders & Imports and the Director Brief both hit.
 *
 * Falls back to PES because it is where the trading and import business lives
 * and so where the first postings will come from.
 */
export async function pickLedgerCompany(co?: string): Promise<{
  companies: LedgerCompany[];
  chosen: LedgerCompany | undefined;
}> {
  const { data } = await sb.from("companies").select("id,name").eq("active", true).order("name");
  const companies = (data ?? []).map((c) => ({ id: c.id as number, name: c.name as string }));
  const asked = Number(co);
  const chosen =
    companies.find((c) => c.id === asked) ??
    companies.find((c) => /^PES\b/i.test(c.name)) ??
    companies[0];
  return { companies, chosen };
}

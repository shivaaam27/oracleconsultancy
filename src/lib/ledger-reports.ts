// ─────────────────────────────────────────────────────────────────────────────
// THE REPORTS — the loader (SERVER-ONLY, imports `sb`). Phase 2.
//
// ⚠️ This file does almost nothing on purpose. It fetches accounts and entries
// and hands them to the pure functions in `ledger-reports-shared.ts`, which is
// where every figure is actually worked out and where every test lives. If you
// find yourself doing arithmetic HERE, it belongs there instead — untested
// arithmetic on a P&L is how a tax return goes wrong.
// ─────────────────────────────────────────────────────────────────────────────

import { sb } from "@/db/supabase";
import { listAccounts, listAccountsForCompanies } from "@/lib/ledger-accounts";
import { listEntries, listEntriesForCompanies } from "@/lib/ledger-post";
import { consolidate, type CompanyBooks, type Period } from "@/lib/ledger-reports-shared";
import type { GlAccount, GlEntry } from "@/lib/ledger-shared";

export type Books = { accounts: GlAccount[]; entries: GlEntry[] };

/**
 * One company's books, up to a date.
 *
 * ⚠️ `to` is passed to the query but `from` is NOT — a report needs every entry
 * before the period to work out the opening balance, so the filtering by period
 * happens in `splitByPeriod`, not in SQL. Filtering `from` here would silently
 * zero every opening balance in the system.
 */
export async function loadBooks(companyId: number, p: Period = {}): Promise<Books> {
  const [accounts, entries] = await Promise.all([
    listAccounts(companyId, { includeArchived: true }),
    listEntries(companyId, { to: p.to ?? null, ascending: true }),
  ]);
  return { accounts, entries };
}

/**
 * Every active company's books as ONE set — the group view.
 *
 * ⚠️ Matched on the account NUMBER (see `consolidate`), which is the whole
 * reason each company's chart is seeded from one template. Companies with no
 * chart yet simply contribute nothing.
 */
export async function loadGroupBooks(p: Period = {}): Promise<Books & { companies: CompanyBooks[] }> {
  const { data } = await sb.from("companies").select("id,name").eq("active", true).order("name");
  const companies = (data ?? []).map((c) => ({ id: c.id as number, name: c.name as string }));
  const ids = companies.map((c) => c.id);

  const [accounts, entries] = await Promise.all([
    listAccountsForCompanies(ids),
    listEntriesForCompanies(ids, { to: p.to ?? null, ascending: true }),
  ]);

  const perCompany: CompanyBooks[] = companies.map((c) => ({
    companyId: c.id,
    companyName: c.name,
    accounts: accounts.filter((a) => a.companyId === c.id),
    entries: entries.filter((e) => e.companyId === c.id),
  }));

  const merged = consolidate(perCompany);
  return { ...merged, companies: perCompany };
}

/** Every party name that has ever been posted against, for the picker. */
export async function usedParties(companyId: number): Promise<Array<{ party: string; partyType: string | null }>> {
  const { data } = await sb.from("gl_entries")
    .select("party,party_type").eq("company_id", companyId).not("party", "is", null).limit(5000);
  const seen = new Map<string, { party: string; partyType: string | null; n: number }>();
  for (const r of (data ?? []) as Array<{ party: string | null; party_type: string | null }>) {
    const p = (r.party ?? "").trim();
    if (!p) continue;
    const cur = seen.get(p);
    if (cur) cur.n += 1;
    else seen.set(p, { party: p, partyType: r.party_type, n: 1 });
  }
  return [...seen.values()].sort((a, b) => b.n - a.n || a.party.localeCompare(b.party))
    .map(({ party, partyType }) => ({ party, partyType }));
}

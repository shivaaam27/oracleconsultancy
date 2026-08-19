// /ledger/reports on its own → the trial balance.
//
// No index screen: five reports do not need a menu in front of them, and the
// controls strip already lists all five as links. The trial balance leads
// because it is the one that proves the books add up before anybody reads a
// figure off the others.

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function LedgerReportsIndex({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") q.set(k, v);
  }
  const s = q.toString();
  redirect(`/ledger/reports/trial-balance${s ? `?${s}` : ""}`);
}

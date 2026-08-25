import { sb } from "@/db/supabase";
import { PageHeader } from "@/components/ui";
import { MarketingAccounts, type AccountRow } from "@/components/marketing-accounts";
import { listAccounts, listClients } from "@/lib/marketing";

export const dynamic = "force-dynamic";
export const metadata = { title: "Accounts — Marketing" };

/**
 * The accounts we post to.
 *
 * The screen itself is `RecordList`, like every other list in COS — filter rail,
 * search, column chooser, export. See `src/components/marketing-accounts.tsx`.
 */
export default async function AccountsPage() {
  const [accounts, clients, companiesRes] = await Promise.all([
    listAccounts(true),
    listClients(),
    sb.from("companies").select("id,name").order("name"),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader title="Accounts" sub="Where we post — ours and our clients'" />
      <MarketingAccounts
        accounts={accounts as AccountRow[]}
        companies={(companiesRes.data ?? []) as { id: number; name: string }[]}
        clients={clients.map((c) => ({ id: c.id, name: c.name }))}
      />
    </div>
  );
}

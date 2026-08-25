import { PageHeader } from "@/components/ui";
import { MarketingClients, type ClientRow } from "@/components/marketing-clients";
import { listClients, clientFreePeriods } from "@/lib/marketing";
import { freePeriod } from "@/lib/marketing-shared";

export const dynamic = "force-dynamic";
export const metadata = { title: "Clients — Marketing" };

/**
 * The businesses Pamoja Plus advertises for.
 *
 * The free period is worked out on the SERVER and handed down: it depends on
 * when the first post for that client actually went out, which means reading
 * every publication. The browser gets the answer, not the history.
 */
export default async function ClientsPage() {
  const [clients, free] = await Promise.all([listClients(true), clientFreePeriods()]);

  const rows: ClientRow[] = clients.map((c) => ({
    id: c.id,
    name: c.name,
    contact_name: c.contact_name,
    contact_phone: c.contact_phone,
    free_months: c.free_months,
    free_starts_on: c.free_starts_on,
    ad_cap_monthly: c.ad_cap_monthly,
    archived: c.archived,
    free: free.get(c.id) ?? freePeriod({ freeMonths: c.free_months, freeStartsOn: c.free_starts_on }, null),
  }));

  return (
    <div className="space-y-4">
      <PageHeader title="Clients" sub="Businesses Pamoja Plus advertises for — free design, posting and adverts at our cost" />
      <MarketingClients clients={rows} />
    </div>
  );
}

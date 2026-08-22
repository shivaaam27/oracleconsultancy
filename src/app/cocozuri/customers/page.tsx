import { PageHeader } from "@/components/ui";
import { CocozuriCustomers } from "@/components/cocozuri-customers";
import { cocozuriCompany, defaultVatRate, listCustomers } from "@/lib/cocozuri";

export const dynamic = "force-dynamic";
export const metadata = { title: "Customers — CocoZuri" };

export default async function CocozuriCustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string; new?: string }>;
}) {
  const sp = await searchParams;
  const showArchived = sp.archived === "1";

  const company = await cocozuriCompany();
  if (!company) {
    return (
      <div className="space-y-4">
        <PageHeader title="Customers" sub="CocoZuri" />
        <p className="rounded-lg border border-warn/30 bg-warn/10 px-3.5 py-2.5 text-sm text-warn">
          Cocozuri is not in the company list. It should be there as Furaha Innovation Ltd with the
          prefix CC.
        </p>
      </div>
    );
  }

  const [customers, archived, vat] = await Promise.all([
    listCustomers({ archived: showArchived }),
    listCustomers({ archived: true }),
    defaultVatRate(),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Customers"
        sub={`${customers.length} customer${customers.length === 1 ? "" : "s"} · ${company.name}`}
      />
      <CocozuriCustomers
        openNew={sp.new === "1"}
        customers={customers}
        archivedCount={archived.length}
        showArchived={showArchived}
        defaultVat={vat}
      />
    </div>
  );
}

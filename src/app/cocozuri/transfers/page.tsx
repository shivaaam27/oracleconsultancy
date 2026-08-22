import { PageHeader } from "@/components/ui";
import { CocozuriTransfers } from "@/components/cocozuri-transfers";
import { cocozuriCompany } from "@/lib/cocozuri";
import { listLocations } from "@/lib/cocozuri-stock";
import { listTransfers } from "@/lib/cocozuri-transfer";
import { transferCheck } from "@/lib/cocozuri-transfer-shared";
import { qty as qtyText } from "@/lib/cocozuri-stock-shared";

export const dynamic = "force-dynamic";
export const metadata = { title: "Transfers — CocoZuri" };

/**
 * Kitchen → shop.
 *
 * ⚠️ THE OWNER SETTLED WHAT BLOCKED THIS: the shop's AMBER RABDI and the
 * kitchen's are the same chocolate. So a transfer moves between two ITEM ROWS,
 * paired by `product_id` — never by name, which is fault #4.
 *
 * ⚠️ AND IT HAS TWO MOMENTS. Sending takes the stock off one shelf; receiving
 * puts what ACTUALLY ARRIVED on the other. The gap between them is stock that
 * went missing in transit, and it is the thing nobody can see today.
 */
export default async function CocozuriTransfersPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const company = await cocozuriCompany();
  if (!company) {
    return (
      <div className="space-y-4">
        <PageHeader title="Transfers" sub="CocoZuri" />
        <p className="rounded-lg border border-warn/30 bg-warn/10 px-3.5 py-2.5 text-sm text-warn">
          Cocozuri is not in the company list.
        </p>
      </div>
    );
  }

  const [sp, transfers, locations] = await Promise.all([
    searchParams,
    listTransfers(),
    listLocations({ includeInactive: true }),
  ]);

  const onWay = transfers.filter((t) => t.status === "sent");
  const inTransit = onWay.reduce((s, t) => s + transferCheck(t).inTransit, 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Transfers"
        sub={
          transfers.length === 0
            ? `Nothing sent yet · ${company.name}`
            : `${transfers.length} transfer${transfers.length === 1 ? "" : "s"}${
                inTransit > 0 ? ` · ${qtyText(inTransit)} on the way` : ""
              } · ${company.name}`
        }
      />
      <CocozuriTransfers transfers={transfers} locations={locations} openNew={sp.new === "1"} />
    </div>
  );
}

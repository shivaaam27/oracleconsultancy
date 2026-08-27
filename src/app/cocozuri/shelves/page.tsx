import { PageHeader } from "@/components/ui";
import { CocozuriShelves } from "@/components/cocozuri-shelves";
import { cocozuriCompany } from "@/lib/cocozuri";
import { listItems, listLocations } from "@/lib/cocozuri-stock";

export const dynamic = "force-dynamic";
export const metadata = { title: "Shelves — CocoZuri" };

/**
 * The places stock is counted.
 *
 * ⚠️ THIS USED TO BE A BOTTOM SHEET INSIDE STOCK ITEMS, which is not somewhere
 * anybody looks for a thing. A shelf is set up BEFORE the items that sit on it,
 * so it belongs in the rail ahead of them rather than behind a button on them.
 */
export default async function CocozuriShelvesPage() {
  const company = await cocozuriCompany();
  if (!company) {
    return (
      <div className="space-y-4">
        <PageHeader title="Shelves" sub="CocoZuri" />
        <p className="rounded-lg border border-warn/30 bg-warn/10 px-3.5 py-2.5 text-sm text-warn">
          Cocozuri is not in the company list.
        </p>
      </div>
    );
  }

  /* ⚠️ Both halves, because a shelf taken out of use still has to be reachable —
     hiding one with no way back to it is losing it. */
  const [locations, live, gone] = await Promise.all([
    listLocations({ includeInactive: true }),
    listItems(),
    listItems({ archived: true }),
  ]);
  const items = [...live, ...gone];
  const inUse = locations.filter((l) => l.active).length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Shelves"
        sub={
          locations.length === 0
            ? `No shelves yet · ${company.name}`
            : `${inUse} in use of ${locations.length} · ${live.length} items counted on them · ${company.name}`
        }
      />
      <CocozuriShelves locations={locations} items={items} />
    </div>
  );
}

import { PageHeader } from "@/components/ui";
import { CocozuriBatches } from "@/components/cocozuri-batches";
import { cocozuriCompany } from "@/lib/cocozuri";
import { listItems, listLocations } from "@/lib/cocozuri-stock";
import { listBatches, makeableRecipes } from "@/lib/cocozuri-batch";
import { isOpen } from "@/lib/cocozuri-batch-shared";

export const dynamic = "force-dynamic";
export const metadata = { title: "Production — CocoZuri" };

/**
 * Production — what was planned, what came out, and where the difference went.
 *
 * ⚠️ NOBODY AT COCOZURI WRITES A BATCH NUMBER TODAY (plan §5a). This stage
 * therefore does not fail by being wrong; it fails by not being used. Starting
 * a batch is one press, the number is allocated, the recipe is optional, and
 * every question is asked at the END — when somebody has finished and is
 * writing down what happened.
 */
export default async function CocozuriBatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const company = await cocozuriCompany();
  if (!company) {
    return (
      <div className="space-y-4">
        <PageHeader title="Production" sub="CocoZuri" />
        <p className="rounded-lg border border-warn/30 bg-warn/10 px-3.5 py-2.5 text-sm text-warn">
          Cocozuri is not in the company list.
        </p>
      </div>
    );
  }

  const [sp, batches, recipes, items, locations] = await Promise.all([
    searchParams,
    listBatches(),
    makeableRecipes(),
    listItems(),
    listLocations({ includeInactive: true }),
  ]);

  const running = batches.filter(isOpen).length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Production"
        sub={
          batches.length === 0
            ? `Nothing made yet · ${company.name}`
            : `${batches.length} batch${batches.length === 1 ? "" : "es"}${running ? ` · ${running} being made now` : ""} · ${company.name}`
        }
      />
      <CocozuriBatches
        batches={batches}
        recipes={recipes}
        items={items}
        locations={locations}
        openNew={sp.new === "1"}
      />
    </div>
  );
}

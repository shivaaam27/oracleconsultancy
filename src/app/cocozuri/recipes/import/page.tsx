import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { CocozuriRecipeImport } from "@/components/cocozuri-recipe-import";
import { cocozuriCompany } from "@/lib/cocozuri";
import { listItems, listLocations } from "@/lib/cocozuri-stock";
import { listRecipes } from "@/lib/cocozuri-recipe";

export const dynamic = "force-dynamic";
export const metadata = { title: "Read the costing workbook — CocoZuri" };

/**
 * Loading the chef's costing workbook.
 *
 * ⚠️ IT IS NOT AN IMPORT BUTTON, AND CANNOT BE. That file holds 174 recipes
 * under 144 distinct names, of which six match a CocoZuri product exactly and
 * 163 of its 236 material names match nothing on the shelf — almost all of it
 * wording rather than substance ("Vanilla bean" against "Vanilla Bean (Paste)",
 * three spellings of feuilletine). Matching stock by name is fault #4 and the
 * answer to it is a person, not a cleverer matcher.
 *
 * So this reads the sheet, puts the recipes in front of somebody one at a time
 * with the obvious answers filled in, and remembers each decision so the same
 * wording is never asked about twice.
 */
export default async function CocozuriRecipeImportPage() {
  const company = await cocozuriCompany();
  if (!company) {
    return (
      <div className="space-y-4">
        <PageHeader title="Read the costing workbook" sub="CocoZuri" />
        <p className="rounded-lg border border-warn/30 bg-warn/10 px-3.5 py-2.5 text-sm text-warn">
          Cocozuri is not in the company list.
        </p>
      </div>
    );
  }

  const [items, locations, recipes] = await Promise.all([
    listItems(), listLocations({ includeInactive: true }), listRecipes(),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <Link href="/cocozuri/recipes"
          className="inline-flex items-center gap-1 text-sm text-fg-muted transition-colors hover:text-accent">
          <ArrowLeft size={13} /> Recipes
        </Link>
      </div>
      <PageHeader title="Read the costing workbook" sub={company.name} />
      <CocozuriRecipeImport
        items={items}
        locations={locations}
        existingNames={recipes.map((r) => r.name)}
      />
    </div>
  );
}

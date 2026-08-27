import { PageHeader } from "@/components/ui";
import { CocozuriLists } from "@/components/cocozuri-lists";
import { cocozuriCompany } from "@/lib/cocozuri";
import { allLists } from "@/lib/cocozuri-lists";
import { likelyDuplicates } from "@/lib/cocozuri-lists-shared";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lists — CocoZuri" };

/**
 * The words you pick from — categories, brands, count units, pack units.
 *
 * ⚠️ THESE WERE ALL FREE TEXT, and the catalogue shows what that costs: five
 * count units where there are three (`GM` and `GRM`, `PKT` and `PKTS`), and two
 * of the four "brands" are product names somebody typed in the wrong box.
 *
 * ⚠️ A VALUE IS TEXT ON THE PRODUCT, NOT A LINK TO THE LIST ROW — deliberately,
 * because an invoice has frozen its own wording and must never be re-pointed by
 * somebody tidying a list months later. Renaming therefore rewrites the word
 * everywhere it is used, which is what makes merge worth having.
 */
export default async function CocozuriListsPage() {
  const company = await cocozuriCompany();
  if (!company) {
    return (
      <div className="space-y-4">
        <PageHeader title="Lists" sub="CocoZuri" />
        <p className="rounded-lg border border-warn/30 bg-warn/10 px-3.5 py-2.5 text-sm text-warn">
          Cocozuri is not in the company list.
        </p>
      </div>
    );
  }

  const lists = await allLists();
  const total = Object.values(lists).reduce((t, v) => t + v.length, 0);
  const pairs = Object.values(lists).reduce(
    (t, v) => t + likelyDuplicates(v.map((x) => ({ id: x.id, value: x.value }))).length,
    0,
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Lists"
        sub={
          total === 0
            ? `Nothing on the lists yet · ${company.name}`
            : `${total} value${total === 1 ? "" : "s"}${pairs > 0 ? ` · ${pairs} look like duplicates` : ""} · ${company.name}`
        }
      />
      <CocozuriLists lists={lists} />
    </div>
  );
}

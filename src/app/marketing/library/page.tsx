import { sb } from "@/db/supabase";
import { PageHeader } from "@/components/ui";
import { MarketingLibrary, type LibraryAsset } from "@/components/marketing-library";
import { listAssets, listShoots, assetUseCounts, signAssets } from "@/lib/marketing-assets";
import { listClients } from "@/lib/marketing";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pictures — Marketing" };

/**
 * Every photo and video — used and unused.
 *
 * ⚠️ THE LINKS ARE MINTED HERE, ON READ, and never stored. The bucket is private
 * on purpose: a saved URL would either expire inside the record or, if it did
 * not, be a permanent address anybody could pass around.
 */
export default async function LibraryPage() {
  const [assets, shoots, uses, clients, companiesRes] = await Promise.all([
    listAssets(true), listShoots(true), assetUseCounts(), listClients(),
    sb.from("companies").select("id,name").order("name"),
  ]);

  const urls = await signAssets(assets.map((a) => a.storage_path));

  const rows: LibraryAsset[] = assets.map((a) => ({
    id: a.id, storage_path: a.storage_path, file_name: a.file_name, mime: a.mime,
    bytes: a.bytes, kind: a.kind, shoot_id: a.shoot_id, company_id: a.company_id,
    client_id: a.client_id, caption: a.caption, tags: a.tags, archived: a.archived,
    created_at: a.created_at,
    uses: uses.get(a.id) ?? 0,
    url: urls.get(a.storage_path) ?? null,
  }));

  return (
    <div className="space-y-4">
      <PageHeader title="Pictures" sub="Everything shot — used and unused" />
      <MarketingLibrary
        assets={rows}
        shoots={shoots.map((s) => ({ id: s.id, name: s.title }))}
        companies={(companiesRes.data ?? []) as { id: number; name: string }[]}
        clients={clients.map((c) => ({ id: c.id, name: c.name }))}
      />
    </div>
  );
}

import { sb } from "@/db/supabase";
import { PageHeader } from "@/components/ui";
import { MarketingPosts, type PostRow } from "@/components/marketing-posts";
import { listAccounts, listCampaigns, listClients, listPostsWithState } from "@/lib/marketing";
import { listAssets, signAssets } from "@/lib/marketing-assets";

export const dynamic = "force-dynamic";
export const metadata = { title: "Posts — Marketing" };

export default async function PostsPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  const sp = await searchParams;
  const [posts, accounts, campaigns, clients, allAssets, companiesRes] = await Promise.all([
    listPostsWithState(true), listAccounts(), listCampaigns(), listClients(), listAssets(),
    sb.from("companies").select("id,name").order("name"),
  ]);

  // ⚠️ The most recent pictures only — the picker is a convenience inside a
  // sheet, not the library. Signing every asset on a busy account would be a
  // round trip nobody asked for.
  const recent = allAssets.slice(0, 24);
  const urls = await signAssets(recent.map((a) => a.storage_path));

  const rows: PostRow[] = posts.map((p) => ({
    id: p.id, title: p.title, caption: p.caption, kind: p.kind,
    campaign_id: p.campaign_id, company_id: p.company_id, client_id: p.client_id,
    archived: p.archived, state: p.state, publications: p.publications,
  }));

  return (
    <div className="space-y-4">
      <PageHeader title="Posts" sub="Everything written down" />
      <MarketingPosts
        posts={rows}
        accounts={accounts.map((a) => ({ id: a.id, platform: a.platform, handle: a.handle }))}
        campaigns={campaigns.map((c) => ({ id: c.id, name: c.name }))}
        companies={(companiesRes.data ?? []) as { id: number; name: string }[]}
        clients={clients.map((c) => ({ id: c.id, name: c.name }))}
        assets={recent.map((a) => ({
          id: a.id, caption: a.caption, fileName: a.file_name,
          url: urls.get(a.storage_path) ?? null, kind: a.kind,
        }))}
        initialState={sp.state}
      />
    </div>
  );
}

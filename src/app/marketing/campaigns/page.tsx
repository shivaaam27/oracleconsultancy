import { sb } from "@/db/supabase";
import { PageHeader } from "@/components/ui";
import { MarketingCampaigns, type CampaignRow } from "@/components/marketing-campaigns";
import { listCampaigns, listClients, listPostsWithState } from "@/lib/marketing";

export const dynamic = "force-dynamic";
export const metadata = { title: "Campaigns — Marketing" };

export default async function CampaignsPage() {
  const [campaigns, clients, posts, companiesRes] = await Promise.all([
    listCampaigns(true), listClients(), listPostsWithState(),
    sb.from("companies").select("id,name").order("name"),
  ]);

  // Counted on read — there is no stored post count to drift out of step.
  const postCount = new Map<number, number>();
  for (const p of posts) {
    if (p.campaign_id == null) continue;
    postCount.set(p.campaign_id, (postCount.get(p.campaign_id) ?? 0) + 1);
  }

  const rows: CampaignRow[] = campaigns.map((c) => ({
    id: c.id, name: c.name, purpose: c.purpose,
    company_id: c.company_id, client_id: c.client_id,
    starts_on: c.starts_on, ends_on: c.ends_on, archived: c.archived,
    posts: postCount.get(c.id) ?? 0,
  }));

  return (
    <div className="space-y-4">
      <PageHeader title="Campaigns" sub="A run of work with a purpose — optional" />
      <MarketingCampaigns
        campaigns={rows}
        companies={(companiesRes.data ?? []) as { id: number; name: string }[]}
        clients={clients.map((c) => ({ id: c.id, name: c.name }))}
        today={new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" })}
      />
    </div>
  );
}

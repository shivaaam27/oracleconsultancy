import { sb } from "@/db/supabase";
import { PageHeader } from "@/components/ui";
import { MarketingResults, type ResultsPublication, type ClientMoney } from "@/components/marketing-results";
import { listAccounts, listCampaigns, listClients, listPostsWithState } from "@/lib/marketing";
import { resultsByPublication, listSpend, toSpend } from "@/lib/marketing-results";

export const dynamic = "force-dynamic";
export const metadata = { title: "Results — Marketing" };

/**
 * What the posts did, and what the advertising cost.
 *
 * ⚠️ ONLY WHAT ACTUALLY WENT OUT APPEARS HERE. A planned post has no figures to
 * have, and listing it would make the "no figures yet" pile meaningless.
 */
export default async function ResultsPage() {
  const [posts, accounts, clients, campaigns, spendRows, companiesRes] = await Promise.all([
    listPostsWithState(), listAccounts(true), listClients(), listCampaigns(), listSpend(),
    sb.from("companies").select("id,name").order("name"),
  ]);

  const accountById = new Map(accounts.map((a) => [a.id, a]));

  const published = posts.flatMap((p) =>
    p.publications
      .filter((pub) => pub.status === "published")
      .map((pub) => ({ post: p, pub })),
  );

  const results = await resultsByPublication(published.map(({ pub }) => pub.id));

  const publications: ResultsPublication[] = published
    .map(({ post, pub }) => {
      const a = accountById.get(pub.accountId);
      return {
        id: pub.id,
        postId: post.id,
        postTitle: post.title,
        accountHandle: a ? a.handle : "unknown account",
        platform: a?.platform ?? "other",
        clientId: post.client_id,
        companyId: post.company_id,
        publishedAt: pub.publishedAt,
        results: results.get(pub.id) ?? [],
      };
    })
    .sort((x, y) => (y.publishedAt ?? "").localeCompare(x.publishedAt ?? ""));

  const clientMoney: ClientMoney[] = clients.map((c) => ({
    id: c.id, name: c.name,
    capMonthly: c.ad_cap_monthly == null ? null : Number(c.ad_cap_monthly),
  }));

  return (
    <div className="space-y-4">
      <PageHeader title="Results" sub="What the posts did, and what the advertising cost" />
      <MarketingResults
        publications={publications}
        spend={spendRows.map(toSpend)}
        clients={clientMoney}
        companies={(companiesRes.data ?? []) as { id: number; name: string }[]}
        campaigns={campaigns.map((c) => ({ id: c.id, name: c.name }))}
        thisMonth={new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" }).slice(0, 7)}
      />
    </div>
  );
}

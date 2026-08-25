import { sb } from "@/db/supabase";
import { PageHeader } from "@/components/ui";
import { MarketingShoots, type ShootRowView } from "@/components/marketing-shoots";
import { listShoots, listAssets } from "@/lib/marketing-assets";
import { listClients } from "@/lib/marketing";

export const dynamic = "force-dynamic";
export const metadata = { title: "Shoots — Marketing" };

export default async function ShootsPage() {
  const [shoots, assets, clients, companiesRes, peopleRes] = await Promise.all([
    listShoots(true), listAssets(true), listClients(),
    sb.from("companies").select("id,name").order("name"),
    sb.from("people").select("id,name").eq("active", true).order("name"),
  ]);

  // Counted on read — there is no stored picture count to drift.
  const perShoot = new Map<number, number>();
  for (const a of assets) {
    if (a.shoot_id == null) continue;
    perShoot.set(a.shoot_id, (perShoot.get(a.shoot_id) ?? 0) + 1);
  }

  const rows: ShootRowView[] = shoots.map((s) => ({
    id: s.id, title: s.title, on_date: s.on_date, place: s.place,
    photographer_id: s.photographer_id, company_id: s.company_id, client_id: s.client_id,
    consent: s.consent, archived: s.archived,
    assets: perShoot.get(s.id) ?? 0,
  }));

  return (
    <div className="space-y-4">
      <PageHeader title="Shoots" sub="Photography sessions, and what came out of them" />
      <MarketingShoots
        shoots={rows}
        people={(peopleRes.data ?? []) as { id: number; name: string }[]}
        companies={(companiesRes.data ?? []) as { id: number; name: string }[]}
        clients={clients.map((c) => ({ id: c.id, name: c.name }))}
      />
    </div>
  );
}

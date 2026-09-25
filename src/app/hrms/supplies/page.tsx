import { loadStock } from "@/lib/operations/stock";
import { sb } from "@/db/supabase";
import { StudioSupplies } from "@/components/studio/supplies/studio-supplies";

export const dynamic = "force-dynamic";

/**
 * Supplies — Studio (26 Sept 2026, board Supplies). Office consumables: the
 * register, purchases and issues. `?tab=purchases|issues` picks the lane,
 * `?archived=1` shows archived items in the register.
 */
export default async function SuppliesPage({ searchParams }: { searchParams: Promise<{ tab?: string; archived?: string }> }) {
  const { tab, archived } = await searchParams;
  const lane = tab === "purchases" || tab === "issues" ? tab : "register";
  const showArchived = archived === "1";
  const [{ items, purchases, issues }, { data: companies }, { data: people }] = await Promise.all([
    loadStock({ includeArchived: true }),
    sb.from("companies").select("id,name").eq("active", true).order("name"),
    sb.from("people").select("name").eq("active", true).order("name"),
  ]);
  return (
    <StudioSupplies
      items={items}
      purchases={purchases}
      issues={issues}
      companies={(companies ?? []).map((c) => ({ id: c.id as number, name: c.name as string }))}
      people={(people ?? []).map((p) => p.name as string)}
      lane={lane}
      archived={showArchived}
    />
  );
}

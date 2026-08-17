import { HrmsShell, type HrmsTab } from "@/components/hrms/hrms-shell";
import { StockDashboard } from "@/components/hrms/stock-dashboard";
import { StockRegister } from "@/components/hrms/stock-register";
import { StockPurchases, StockIssues } from "@/components/hrms/stock-movements";
import { loadStock, dashboardMetrics } from "@/lib/stock";
import { sb } from "@/db/supabase";

export const dynamic = "force-dynamic";

const VALID_TABS: HrmsTab[] = ["dashboard", "register", "purchases", "issues"];

export default async function OecrPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const initialTab = (VALID_TABS.includes(tab as HrmsTab) ? tab : "dashboard") as HrmsTab;

  const [{ items, purchases, issues }, { data: companiesRaw }] = await Promise.all([
    loadStock(),
    sb.from("companies").select("id,name").eq("active", true).order("name"),
  ]);
  const companies = (companiesRaw ?? []).map((c) => ({ id: c.id as number, name: c.name as string }));
  const m = dashboardMetrics(items, purchases, issues);

  const sub =
    items.length === 0
      ? "No items yet — set up your register to begin"
      : `${m.totalItems} item${m.totalItems === 1 ? "" : "s"} · ${m.reorder} to reorder · ${m.outOfStock} out of stock`;

  return (
    <HrmsShell
      title="Supplies"
      titleSub="Office consumables — what is in stock, bought and issued"
      sub={sub}
      initialTab={initialTab}
      dashboardSlot={<StockDashboard items={items} purchases={purchases} issues={issues} />}
      registerSlot={<StockRegister items={items} purchases={purchases} issues={issues} />}
      purchasesSlot={<StockPurchases items={items} purchases={purchases} />}
      issuesSlot={<StockIssues items={items} issues={issues} companies={companies} />}
    />
  );
}

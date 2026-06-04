import { Boxes, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { EmptyState } from "@/components/ui";
import { HrmsShell, type HrmsTab } from "@/components/hrms/hrms-shell";
import { StockDashboard } from "@/components/hrms/stock-dashboard";
import { loadStock, dashboardMetrics } from "@/lib/stock";

export const dynamic = "force-dynamic";

const VALID_TABS: HrmsTab[] = ["dashboard", "register", "purchases", "issues"];

export default async function HrmsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const initialTab = (VALID_TABS.includes(tab as HrmsTab) ? tab : "dashboard") as HrmsTab;

  const { items, purchases, issues } = await loadStock();
  const m = dashboardMetrics(items, purchases, issues);

  const sub =
    items.length === 0
      ? "No items yet — set up your stock register to begin"
      : `${m.totalItems} item${m.totalItems === 1 ? "" : "s"} · ${m.reorder} to reorder · ${m.outOfStock} out of stock`;

  // Phase 2 ships the themed shell + navigation. The Dashboard, Register and
  // movement panels are filled in the next phases; placeholders keep the page
  // navigable and self-explanatory in the meantime.
  return (
    <HrmsShell
      sub={sub}
      initialTab={initialTab}
      dashboardSlot={<StockDashboard items={items} purchases={purchases} issues={issues} />}
      registerSlot={
        <EmptyState
          icon={<Boxes size={22} />}
          title="Stock Register"
          hint="Your catalogue of items with live current stock and status. You'll add items and the figures recalculate from purchases and issues automatically."
        />
      }
      purchasesSlot={
        <EmptyState
          icon={<ArrowDownToLine size={22} />}
          title="Purchases — Stock In"
          hint="Log what you buy. Each purchase raises the item's current stock automatically."
        />
      }
      issuesSlot={
        <EmptyState
          icon={<ArrowUpFromLine size={22} />}
          title="Issues — Stock Out"
          hint="Log what's handed out, tagged to the company that received it. Each issue lowers current stock automatically."
        />
      }
    />
  );
}

import { Package, Sparkles } from "lucide-react";
import { RegistryCard, type RegistryStat } from "@/components/hrms/registry-card";
import { loadStock, dashboardMetrics } from "@/lib/stock";

export const dynamic = "force-dynamic";

export default async function HrmsHubPage() {
  // Live snapshot for the OECR card.
  const { items, purchases, issues } = await loadStock();
  const m = dashboardMetrics(items, purchases, issues);

  const oecrStats: RegistryStat[] = [
    { label: `${m.totalItems} item${m.totalItems === 1 ? "" : "s"}` },
    ...(m.reorder > 0 ? [{ label: `${m.reorder} to reorder`, tone: "warn" as const }] : []),
    ...(m.outOfStock > 0 ? [{ label: `${m.outOfStock} out of stock`, tone: "danger" as const }] : []),
    ...(m.reorder === 0 && m.outOfStock === 0 && m.totalItems > 0
      ? [{ label: "all in good stock", tone: "success" as const }]
      : []),
  ];

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <div>
        <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-accent mb-0.5">HRMS</div>
        <h1 className="text-xl font-semibold tracking-tight">Registries</h1>
        <div className="text-xs text-fg-muted mt-0.5">Open a registry to manage it.</div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <RegistryCard
          href="/hrms/oecr"
          abbr="OECR"
          title="Office Equipment Control Registry"
          description="Track office equipment and stationery stock — items, purchases in and issues out, with current stock and value worked out for you."
          icon={Package}
          stats={oecrStats}
        />
        <RegistryCard
          href="/hrms/ocr"
          abbr="OCR"
          title="Office Cleaning Registry"
          description="Keep cleaning records in one place. This registry is being set up."
          icon={Sparkles}
          comingSoon
        />
      </div>
    </div>
  );
}

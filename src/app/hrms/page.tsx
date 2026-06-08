import { Package, Sparkles, Building2, Users, FileText, Laptop } from "lucide-react";
import { RegistryCard, type RegistryStat } from "@/components/hrms/registry-card";
import { loadStock, dashboardMetrics } from "@/lib/stock";
import { listAssets, assetMetrics } from "@/lib/assets";
import { listAreas } from "@/lib/cleaning";
import { listDocuments, deriveDocStatus } from "@/lib/documents";
import { sb } from "@/db/supabase";

export const dynamic = "force-dynamic";

export default async function HrmsHubPage() {
  // Live snapshots for the cards.
  const [
    { items, purchases, issues },
    areas,
    documents,
    assets,
    { count: companyCount },
    { count: peopleCount },
  ] = await Promise.all([
    loadStock(),
    listAreas(),
    listDocuments(),
    listAssets(),
    sb.from("companies").select("*", { count: "exact", head: true }).eq("active", true),
    sb.from("people").select("*", { count: "exact", head: true }).eq("active", true),
  ]);

  const m = dashboardMetrics(items, purchases, issues);
  const am = assetMetrics(assets);
  const assetStats: RegistryStat[] = [
    { label: `${am.total} asset${am.total === 1 ? "" : "s"}` },
    ...(am.assigned > 0 ? [{ label: `${am.assigned} assigned`, tone: "success" as const }] : []),
    ...(am.maintenance > 0 ? [{ label: `${am.maintenance} in maintenance`, tone: "warn" as const }] : []),
  ];
  const oecrStats: RegistryStat[] = [
    { label: `${m.totalItems} item${m.totalItems === 1 ? "" : "s"}` },
    ...(m.reorder > 0 ? [{ label: `${m.reorder} to reorder`, tone: "warn" as const }] : []),
    ...(m.outOfStock > 0 ? [{ label: `${m.outOfStock} out of stock`, tone: "danger" as const }] : []),
    ...(m.reorder === 0 && m.outOfStock === 0 && m.totalItems > 0
      ? [{ label: "all in good stock", tone: "success" as const }]
      : []),
  ];

  const docExpired = documents.filter((d) => deriveDocStatus(d) === "Expired").length;
  const docExpiring = documents.filter((d) => deriveDocStatus(d) === "Expiring").length;
  const docStats: RegistryStat[] = [
    { label: `${documents.length} tracked` },
    ...(docExpired > 0 ? [{ label: `${docExpired} expired`, tone: "danger" as const }] : []),
    ...(docExpiring > 0 ? [{ label: `${docExpiring} expiring`, tone: "warn" as const }] : []),
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
          href="/hrms/assets"
          abbr="Assets"
          title="Asset Register"
          description="Durable company equipment — laptops, phones, vehicles, access cards. Assign to people, track who holds what, and return on offboarding."
          icon={Laptop}
          stats={assetStats}
        />
        <RegistryCard
          href="/hrms/ocr"
          abbr="OCR"
          title="Office Cleaning Registry"
          description="Daily cleaning checklist — tick each area as it's done, add comments, and sign off the day."
          icon={Sparkles}
          stats={[{ label: `${areas.length} area${areas.length === 1 ? "" : "s"}` }]}
        />
        <RegistryCard
          href="/companies"
          abbr="Companies"
          title="Portfolio companies"
          description="The 7 portfolio companies — open one for its tasks, people, risk and activity."
          icon={Building2}
          stats={[{ label: `${companyCount ?? 0} compan${(companyCount ?? 0) === 1 ? "y" : "ies"}` }]}
        />
        <RegistryCard
          href="/people"
          abbr="People"
          title="People & contacts"
          description="Staff, expats and external contacts — roles, companies, channels and reminder drafts."
          icon={Users}
          stats={[{ label: `${peopleCount ?? 0} ${(peopleCount ?? 0) === 1 ? "person" : "people"}` }]}
        />
        <RegistryCard
          href="/documents"
          abbr="Documents"
          title="Documents & Compliance"
          description="Licences, contracts, certificates, insurance, leases and visas — with expiry dates and reminders."
          icon={FileText}
          stats={docStats}
        />
      </div>
    </div>
  );
}

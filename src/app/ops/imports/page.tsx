// Orders & Imports — the shipments (Stage 3).
//
// One bill of lading, typed once, with the order lines pointing at it. Replaces
// the ASSESSMENTS, PENDING and clearance sheets, which are three views of the
// same journey. See `memory/pes_ops_module.md`.

import { sb } from "@/db/supabase";
import { PageHeader } from "@/components/ui";
import { listShipments, linesPerShipment } from "@/lib/ops-shipments";
import { listOpsRefs, opsNamesOf } from "@/lib/ops-refs";
import { usedValues } from "@/lib/ops-orders";
import { getAppSettings } from "@/lib/settings";
import { getSavedViewsFor } from "@/lib/saved-views";
import { OpsTabs } from "@/components/ops-tabs";
import { OpsShipmentsSheet } from "@/components/ops-shipments-sheet";

export const dynamic = "force-dynamic";

export default async function OpsImportsPage({
  searchParams,
}: {
  searchParams: Promise<{ co?: string }>;
}) {
  const { co } = await searchParams;

  const { data: companyRows } = await sb
    .from("companies").select("id,name").eq("active", true).order("name");
  const companies = (companyRows ?? []).map((c) => ({ id: c.id as number, name: c.name as string }));

  // ⚠️ `co`, NOT `company`. `?company=<id>` is a GLOBAL parameter: CompanyDrawer
  // watches for it and slides the company preview open over whatever you were
  // doing. The Director Brief learned this first and uses `?co=` for the same
  // reason. Do not rename this back.
  const asked = Number(co);
  const chosen =
    companies.find((c) => c.id === asked) ??
    companies.find((c) => /^PES\b/i.test(c.name)) ??
    companies[0];

  if (!chosen) {
    return (
      <div className="space-y-3">
        <PageHeader title="Orders & Imports" sub="No companies yet" />
        <p className="text-[13px] text-fg-muted">Add a company first, on the Companies screen.</p>
      </div>
    );
  }

  const [shipments, counts, refs, settings, pendingWith, savedViews] = await Promise.all([
    listShipments(chosen.id),
    linesPerShipment(chosen.id),
    listOpsRefs(chosen.id),
    getAppSettings(),
    usedValues(chosen.id, "pending_with"),
    getSavedViewsFor("ops-shipments"),
  ]);

  return (
    <div className="space-y-3">
      <PageHeader
        title="Orders & Imports"
        sub={`${chosen.name} · ${shipments.length} shipment${shipments.length === 1 ? "" : "s"}`}
      />
      <OpsTabs active="imports" company={chosen.id} companies={companies} />
      <OpsShipmentsSheet
        savedViews={savedViews}
        companyId={chosen.id}
        shipments={shipments}
        lineCounts={Object.fromEntries(counts)}
        defaultExRate={settings.opsDefaultExRate}
        suggest={{
          suppliers: opsNamesOf(refs, "supplier"),
          origins: opsNamesOf(refs, "origin"),
          agents: opsNamesOf(refs, "clearing_agent"),
          modes: opsNamesOf(refs, "mode"),
          statuses: opsNamesOf(refs, "delivery_status"),
          pendingWith,
        }}
      />
    </div>
  );
}

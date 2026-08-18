// Orders & Imports — the order lines (Stage 2).
//
// One row is one PO line, the way POS STATUS keeps it. See
// `memory/pes_ops_module.md`.

import { sb } from "@/db/supabase";
import { PageHeader } from "@/components/ui";
import { listOrderLines, usedValues } from "@/lib/ops-orders";
import { listOpsRefs, opsNamesOf } from "@/lib/ops-refs";
import { listShipments } from "@/lib/ops-shipments";
import { listInvoices } from "@/lib/ops-invoices";
import { getAppSettings } from "@/lib/settings";
import { getSavedViewsFor } from "@/lib/saved-views";
import { OpsTabs } from "@/components/ops-tabs";
import { OpsOrdersSheet } from "@/components/ops-orders-sheet";

export const dynamic = "force-dynamic";

export default async function OpsOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ co?: string; flag?: string }>;
}) {
  const { co, flag } = await searchParams;

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

  const [lines, refs, settings, descriptions, pendingWith, uoms, shipments, despatches, savedViews] = await Promise.all([
    listOrderLines(chosen.id),
    listOpsRefs(chosen.id),
    getAppSettings(),
    // The "middle path" on items: the box offers what has been typed before.
    // These SUGGEST; nothing is ever filled in from them.
    usedValues(chosen.id, "description"),
    usedValues(chosen.id, "pending_with"),
    usedValues(chosen.id, "uom"),
    listShipments(chosen.id),
    // ⚠️ A line reads whether it has gone out and been billed off the DOCUMENT
    // it points at (Stage 5), so the documents have to travel with the lines.
    listInvoices(chosen.id),
    getSavedViewsFor("ops-orders"),
  ]);

  return (
    <div className="space-y-3">
      <PageHeader
        title="Orders & Imports"
        sub={`${chosen.name} · ${lines.length} line${lines.length === 1 ? "" : "s"}`}
      />
      <OpsTabs active="orders" company={chosen.id} companies={companies} />
      <OpsOrdersSheet
        savedViews={savedViews}
        companyId={chosen.id}
        lines={lines}
        defaultExRate={settings.opsDefaultExRate}
        flag={flag ?? "all"}
        shipments={shipments.map((s) => ({ id: s.id, blNo: s.blNo }))}
        despatches={despatches.map((d) => ({
          id: d.id,
          // Whichever reference it has — a delivery going out today has no
          // invoice number yet, and the picker still has to name it.
          label: [d.deliveryNoteNo, d.invoiceNo].filter(Boolean).join(" · ") || `#${d.id}`,
          deliveredDate: d.deliveredDate, invoiceNo: d.invoiceNo, invoiceDate: d.invoiceDate,
        }))}
        suggest={{
          // From the Setup lists first, so a name somebody agreed on leads.
          clients: opsNamesOf(refs, "client"),
          costCentres: opsNamesOf(refs, "cost_centre"),
          suppliers: opsNamesOf(refs, "supplier"),
          origins: opsNamesOf(refs, "origin"),
          statuses: opsNamesOf(refs, "delivery_status"),
          descriptions,
          pendingWith,
          uoms,
        }}
      />
    </div>
  );
}

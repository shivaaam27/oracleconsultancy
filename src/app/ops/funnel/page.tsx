// Orders & Imports — the funnel (Stage 4).
//
// The workbook's INFO - RFQ sheet: enquiry → quote → order → invoice, one row
// travelling the whole way. The conversion is measured against the enquiry's
// own month rather than one month's orders over another month's quotes — see
// `memory/pes_ops_module.md` and the header of `ops-funnel-shared.ts`.

import { sb } from "@/db/supabase";
import { PageHeader } from "@/components/ui";
import { listEnquiries, usedEnquiryValues } from "@/lib/ops-funnel";
import { listOrderLines, usedValues } from "@/lib/ops-orders";
import { listInvoices } from "@/lib/ops-invoices";
import { listTenders } from "@/lib/ops-tenders";
import { listOpsRefs, opsNamesOf } from "@/lib/ops-refs";
import { getAppSettings } from "@/lib/settings";
import { getSavedViewsFor } from "@/lib/saved-views";
import { OpsTabs } from "@/components/ops-tabs";
import { OpsFunnelSheet } from "@/components/ops-funnel-sheet";
import { OpsTendersPanel } from "@/components/ops-tenders-panel";

export const dynamic = "force-dynamic";

export default async function OpsFunnelPage({
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

  const [enquiries, lines, despatches, tenders, refs, settings, assignedTo, descriptions, outcomes, savedViews] = await Promise.all([
    listEnquiries(chosen.id),
    // ⚠️ The order lines come along so a won enquiry can be priced FROM THEM.
    // The workbook types that figure onto both sheets and they disagree.
    listOrderLines(chosen.id),
    // ⚠️ "Invoiced" lives on the despatch document since Stage 5, not on the
    // line, so the funnel needs them to know which of its orders were billed.
    listInvoices(chosen.id),
    // The bids being chased BEFORE any enquiry exists — the workbook's
    // `tenders` sheet, which nothing in COS held until Stage 7.
    listTenders(chosen.id),
    listOpsRefs(chosen.id),
    getAppSettings(),
    usedEnquiryValues(chosen.id, "assigned_to"),
    usedEnquiryValues(chosen.id, "description"),
    usedEnquiryValues(chosen.id, "outcome"),
    getSavedViewsFor("ops-enquiries"),
  ]);

  // What has already been typed as an item on an order line is just as good a
  // suggestion for what a client is asking about.
  const lineDescriptions = await usedValues(chosen.id, "description");
  const merged = [...new Set([...descriptions, ...lineDescriptions])];

  return (
    <div className="space-y-3">
      <PageHeader
        title="Orders & Imports"
        sub={`${chosen.name} · ${enquiries.length} enquir${enquiries.length === 1 ? "y" : "ies"}`}
      />
      <OpsTabs active="funnel" company={chosen.id} companies={companies} />
      <OpsTendersPanel
        companyId={chosen.id}
        tenders={tenders}
        clients={opsNamesOf(refs, "client")}
      />
      <OpsFunnelSheet
        savedViews={savedViews}
        companyId={chosen.id}
        enquiries={enquiries}
        lines={lines}
        despatches={despatches.map((d) => ({
          id: d.id, deliveredDate: d.deliveredDate,
          invoiceNo: d.invoiceNo, invoiceDate: d.invoiceDate,
        }))}
        defaultExRate={settings.opsDefaultExRate}
        suggest={{
          clients: opsNamesOf(refs, "client"),
          assignedTo,
          descriptions: merged,
          outcomes,
          // Every PO already on an order line, so linking a won enquiry is a
          // pick rather than a retype — and the two cannot drift apart.
          poNumbers: [...new Set(lines.map((l) => l.poNo).filter(Boolean))],
        }}
      />
    </div>
  );
}

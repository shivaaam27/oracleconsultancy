// Orders & Imports — the executive report (Stage 6).
//
// PENDING, PURCHASE ANALYSIS and PAYMENTS FORECAST, all worked out rather than
// typed. Nothing on this screen is stored. See `memory/pes_ops_module.md`.

import { sb } from "@/db/supabase";
import { PageHeader } from "@/components/ui";
import { listOrderLines } from "@/lib/ops-orders";
import { listShipments } from "@/lib/ops-shipments";
import { listInvoices } from "@/lib/ops-invoices";
import { listPayments } from "@/lib/ops-payments";
import { OpsTabs } from "@/components/ops-tabs";
import { OpsReportSheet } from "@/components/ops-report-sheet";

export const dynamic = "force-dynamic";
export const metadata = { title: "Report — Orders & Imports" };

export default async function OpsReportPage({
  searchParams,
}: {
  searchParams: Promise<{ co?: string; group?: string }>;
}) {
  const { co, group } = await searchParams;

  const { data: companyRows } = await sb
    .from("companies").select("id,name").eq("active", true).order("name");
  const companies = (companyRows ?? []).map((c) => ({ id: c.id as number, name: c.name as string }));

  // ⚠️ `co`, NOT `company`. `?company=<id>` is a GLOBAL parameter: CompanyDrawer
  // watches for it and slides the company preview open over whatever you were
  // doing. Do not rename this back.
  const asked = Number(co);
  const chosen =
    companies.find((c) => c.id === asked) ??
    companies.find((c) => /^PES\b/i.test(c.name)) ??
    companies[0];

  if (!chosen) {
    return (
      <div className="space-y-3">
        <PageHeader title="Orders & Imports" sub="No companies yet" />
        <p className="text-base text-fg-muted">Add a company first, on the Companies screen.</p>
      </div>
    );
  }

  const [lines, shipments, despatches, payments] = await Promise.all([
    listOrderLines(chosen.id),
    listShipments(chosen.id),
    listInvoices(chosen.id),
    listPayments(chosen.id),
  ]);

  return (
    <div className="space-y-3">
      <PageHeader
        title="Orders & Imports"
        sub={`${chosen.name} · worked out, not typed`}
      />
      <OpsTabs active="report" company={chosen.id} companies={companies} />
      <OpsReportSheet
        companyId={chosen.id}
        lines={lines}
        shipments={shipments}
        despatches={despatches.map((d) => ({
          id: d.id, deliveredDate: d.deliveredDate,
          invoiceNo: d.invoiceNo, invoiceDate: d.invoiceDate,
        }))}
        payments={payments}
        groupBy={group ?? "desk"}
      />
    </div>
  );
}

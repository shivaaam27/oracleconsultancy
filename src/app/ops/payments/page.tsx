// Orders & Imports — payments out (Stage 7).
//
// IMP PMT AND FREIGHT rebuilt: one row per payment, many payments per purchase,
// and what is still owed worked out rather than typed. See
// `memory/pes_ops_module.md`.

import { sb } from "@/db/supabase";
import { PageHeader } from "@/components/ui";
import { listPayments, usedPaymentValues } from "@/lib/ops-payments";
import { listOrderLines, usedValues } from "@/lib/ops-orders";
import { listShipments } from "@/lib/ops-shipments";
import { listInvoices } from "@/lib/ops-invoices";
import { listOpsRefs, opsNamesOf } from "@/lib/ops-refs";
import { getAppSettings } from "@/lib/settings";
import { getSavedViewsFor } from "@/lib/saved-views";
import { OpsTabs } from "@/components/ops-tabs";
import { OpsPaymentsSheet } from "@/components/ops-payments-sheet";

export const dynamic = "force-dynamic";

export default async function OpsPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ co?: string }>;
}) {
  const { co } = await searchParams;

  const { data: companyRows } = await sb
    .from("companies").select("id,name").eq("active", true).order("name");
  const companies = (companyRows ?? []).map((c) => ({ id: c.id as number, name: c.name as string }));

  // ⚠️ `co`, NOT `company`. `?company=<id>` is a GLOBAL parameter watched by
  // CompanyDrawer. Do not rename this back.
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

  const [payments, lines, shipments, despatches, refs, settings, kinds, references, savedViews] =
    await Promise.all([
      listPayments(chosen.id),
      listOrderLines(chosen.id),
      listShipments(chosen.id),
      listInvoices(chosen.id),
      listOpsRefs(chosen.id),
      getAppSettings(),
      usedPaymentValues(chosen.id, "kind"),
      usedPaymentValues(chosen.id, "reference"),
      getSavedViewsFor("ops-payments"),
    ]);

  // Anybody we might pay: the suppliers and the clearing agents from Setup,
  // plus whoever has already been paid, and the proforma numbers off the lines.
  const profNos = await usedValues(chosen.id, "prof_no");
  const payees = [...new Set([
    ...opsNamesOf(refs, "supplier"),
    ...opsNamesOf(refs, "clearing_agent"),
    ...(await usedPaymentValues(chosen.id, "payee")),
  ])];

  return (
    <div className="space-y-3">
      <PageHeader
        title="Orders & Imports"
        sub={`${chosen.name} · ${payments.length} payment${payments.length === 1 ? "" : "s"}`}
      />
      <OpsTabs active="payments" company={chosen.id} companies={companies} />
      <OpsPaymentsSheet
        companyId={chosen.id}
        savedViews={savedViews}
        payments={payments}
        lines={lines}
        shipments={shipments}
        despatches={despatches.map((d) => ({
          id: d.id, deliveredDate: d.deliveredDate,
          invoiceNo: d.invoiceNo, invoiceDate: d.invoiceDate,
        }))}
        defaultExRate={settings.opsDefaultExRate}
        suggest={{
          payees,
          kinds,
          references: [...new Set([...references, ...profNos, ...shipments.map((s) => s.blNo)])],
        }}
      />
    </div>
  );
}

// Orders & Imports — delivery and billing (Stage 5).
//
// The Deliveries sheet and the PO BALANCE column, rebuilt: one document per
// despatch, the order lines pointing at it, and the balance worked out rather
// than copied down a group. See `memory/pes_ops_module.md`.

import { sb } from "@/db/supabase";
import { PageHeader } from "@/components/ui";
import { listInvoices } from "@/lib/ops-invoices";
import { listOrderLines, usedValues } from "@/lib/ops-orders";
import { listOpsRefs, opsNamesOf } from "@/lib/ops-refs";
import { getAppSettings } from "@/lib/settings";
import { OpsTabs } from "@/components/ops-tabs";
import { OpsInvoicesSheet } from "@/components/ops-invoices-sheet";

export const dynamic = "force-dynamic";

export default async function OpsInvoicesPage({
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

  const [invoices, lines, refs, settings, pendingWith] = await Promise.all([
    listInvoices(chosen.id),
    // ⚠️ The order lines come along so a document can be valued from what is ON
    // it, and so each PO's balance is a subtraction rather than a typed figure.
    listOrderLines(chosen.id),
    listOpsRefs(chosen.id),
    getAppSettings(),
    usedValues(chosen.id, "pending_with"),
  ]);

  return (
    <div className="space-y-3">
      <PageHeader
        title="Orders & Imports"
        sub={`${chosen.name} · ${invoices.length} despatch${invoices.length === 1 ? "" : "es"}`}
      />
      <OpsTabs active="invoices" company={chosen.id} companies={companies} />
      <OpsInvoicesSheet
        companyId={chosen.id}
        invoices={invoices}
        lines={lines}
        defaultExRate={settings.opsDefaultExRate}
        suggest={{
          clients: opsNamesOf(refs, "client"),
          statuses: opsNamesOf(refs, "delivery_status"),
          pendingWith,
        }}
      />
    </div>
  );
}

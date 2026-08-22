// Orders & Imports — Stage 1: the master lists.
//
// The trading side of PES: parts bought, mostly imported, and sold to mines.
// The order screens arrive in Stage 2; this is the vocabulary they will pick
// from. See `memory/pes_ops_module.md`.

import { sb } from "@/db/supabase";
import { PageHeader } from "@/components/ui";
import { listOpsRefs } from "@/lib/ops-refs";
import { getAppSettings } from "@/lib/settings";
import { OpsLists } from "@/components/ops-lists";
import { OpsTabs } from "@/components/ops-tabs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Setup — Orders & Imports" };

export default async function OpsPage({
  searchParams,
}: {
  searchParams: Promise<{ co?: string }>;
}) {
  const { co } = await searchParams;

  const { data: companyRows } = await sb
    .from("companies").select("id,name").eq("active", true).order("name");
  const companies = (companyRows ?? []).map((c) => ({ id: c.id as number, name: c.name as string }));

  // The company in the address wins; otherwise the trading company itself, and
  // failing that whatever comes first — never a crash on a fresh system.
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
        <p className="text-base text-fg-muted">Add a company first, on the Companies screen.</p>
      </div>
    );
  }

  const [refs, settings] = await Promise.all([listOpsRefs(chosen.id), getAppSettings()]);

  return (
    <div className="space-y-3">
      <PageHeader
        title="Orders & Imports"
        sub={`${chosen.name} · ${refs.filter((r) => r.active).length} entries across 8 lists`}
      />
      <OpsTabs active="setup" company={chosen.id} companies={companies} />
      <p className="max-w-2xl text-sm text-fg-muted">
        The lists every order will pick from. Filling these in first is what stops the same
        supplier being typed three ways and the analysis quietly splitting in two.
        The order screens themselves come next.
      </p>
      <OpsLists
        companyId={chosen.id}
        companies={companies}
        refs={refs}
        exRate={settings.opsDefaultExRate}
      />
    </div>
  );
}

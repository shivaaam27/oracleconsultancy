import { PageHeader } from "@/components/ui";
import { HrmsCrumbs } from "@/components/hrms/hrms-crumbs";
import { listPendingInbox } from "./actions";
import { getIntakeBucket } from "@/app/documents/actions";
import { getVerifyQueue } from "@/lib/verify-queue";
import { IntakeShell } from "./intake-shell";
import { SmartAdd } from "@/components/smart-add";
import { SystemStatusCard } from "@/components/system-status-card";
import { checkSystemHealth } from "@/lib/system-health";
import { AutomationFeed } from "@/components/automation-feed";
import { listAutomationFeed } from "@/app/automations/actions";
import { IntakeAccuracy } from "@/components/intake-accuracy";
import { computeIntakeMetrics } from "@/lib/intake-metrics";
import { gatherSafetyFindings } from "@/lib/safety-net";
import { sb } from "@/db/supabase";

export const dynamic = "force-dynamic";

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  const [items, verify, trash, { data: companiesRaw }, { data: peopleRaw }] = await Promise.all([
    listPendingInbox(),
    getVerifyQueue(),
    getIntakeBucket("trash"),
    sb.from("companies").select("id,name,aliases").order("name"),
    sb.from("people").select("id,name").eq("active", true).order("name"),
  ]);
  const companies = (companiesRaw ?? []).map((c) => ({ id: c.id as number, name: c.name as string, aliases: (c.aliases as string[] | null) ?? undefined }));
  const people = (peopleRaw ?? []).map((p) => ({ id: p.id as number, name: p.name as string }));

  const [safetyFindings, automation, health, intakeMetrics] = await Promise.all([
    gatherSafetyFindings(),
    listAutomationFeed(),
    checkSystemHealth(),
    computeIntakeMetrics(30),
  ]);
  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <HrmsCrumbs from={from} />
      <PageHeader
        title="Inbox"
        sub="Drop a bundle and it sorts itself. Anything it’s unsure about waits in Verify for a quick bulk decision."
        action={<SmartAdd companies={companies} people={people} />}
      />
      <IntakeAccuracy metrics={intakeMetrics} />

      <section id="automations" className="scroll-mt-24">
        <AutomationFeed applied={automation.applied} suggestions={automation.suggestions} />
      </section>

      <section id="verify" className="scroll-mt-24">
        <IntakeShell
          inboxItems={items}
          companies={companies}
          people={people}
          verify={verify}
          trash={trash}
        />
      </section>

      {/* One merged status card — Automations · AI reading · Data checks. The
          needs-review lane now lives in the Verify tab above. */}
      <SystemStatusCard health={health} findings={safetyFindings} />
    </div>
  );
}

import { PageHeader } from "@/components/ui";
import { HrmsCrumbs } from "@/components/hrms/hrms-crumbs";
import { listPendingInbox } from "./actions";
import { getIntakeBucket } from "@/app/documents/actions";
import { IntakeShell } from "./intake-shell";
import { SmartAdd } from "@/components/smart-add";
import { NeedsReviewPanel, type ReviewDoc } from "@/components/needs-review-panel";
import { ExtractionHealth } from "@/components/extraction-health";
import { SafetyNetPanel } from "@/components/safety-net-panel";
import { AutomationFeed } from "@/components/automation-feed";
import { listAutomationFeed } from "@/app/automations/actions";
import { gatherSafetyFindings } from "@/lib/safety-net";
import { sb } from "@/db/supabase";

export const dynamic = "force-dynamic";

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  const [items, quarantine, trash, { data: companiesRaw }, { data: peopleRaw }] = await Promise.all([
    listPendingInbox(),
    getIntakeBucket("quarantine"),
    getIntakeBucket("trash"),
    sb.from("companies").select("id,name,aliases").order("name"),
    sb.from("people").select("id,name").eq("active", true).order("name"),
  ]);
  const companies = (companiesRaw ?? []).map((c) => ({ id: c.id as number, name: c.name as string, aliases: (c.aliases as string[] | null) ?? undefined }));
  const people = (peopleRaw ?? []).map((p) => ({ id: p.id as number, name: p.name as string }));

  // Review & health — moved here from /documents so the Inbox is the single hub.
  const companyName = new Map(companies.map((c) => [c.id, c.name]));
  const peopleName = new Map(people.map((p) => [p.id, p.name]));
  const [{ data: reviewRaw }, safetyFindings, automation] = await Promise.all([
    sb.from("documents").select("id,title,category,company_id,person_id,needs_original").eq("archived", false).eq("review_status", "needs_review"),
    gatherSafetyFindings(),
    listAutomationFeed(),
  ]);
  const reviewDocs: ReviewDoc[] = (reviewRaw ?? []).map((d) => ({
    id: d.id as number,
    title: d.title as string,
    category: (d.category as string | null) ?? null,
    ownerName: (d.company_id ? companyName.get(d.company_id as number) : null) ?? (d.person_id ? peopleName.get(d.person_id as number) : null) ?? null,
    needsOriginal: (d.needs_original as boolean | null) ?? false,
  }));
  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <HrmsCrumbs from={from} />
      <PageHeader
        title="Inbox"
        sub="Drop a bundle and it sorts itself — filed by company, held in Quarantine when unclear, duplicates to Trash."
        action={<SmartAdd companies={companies} people={people} />}
      />
      <AutomationFeed applied={automation.applied} suggestions={automation.suggestions} />

      <IntakeShell
        inboxItems={items}
        companies={companies}
        people={people}
        quarantine={quarantine}
        trash={trash}
      />

      {/* Review & health — the housekeeping that used to clutter /documents. These
          self-hide when there's nothing to show. */}
      <div className="space-y-3">
        <NeedsReviewPanel docs={reviewDocs} />
        <ExtractionHealth />
        <SafetyNetPanel findings={safetyFindings} />
      </div>
    </div>
  );
}

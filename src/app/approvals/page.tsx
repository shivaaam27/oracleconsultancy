import { listApprovals, listCockpitActivity } from "@/lib/cockpit";
import { gatherUrgent } from "@/lib/morning-brief";
import { StudioApprovals } from "@/components/studio/approvals/studio-approvals";

export const dynamic = "force-dynamic";

export const metadata = { title: "Approvals · COS" };

/**
 * Approvals — Studio (26 Sept 2026). What the system proposes (approve /
 * dismiss) and what it did on its own (undo), plus the logbook and "Run the
 * checks now". The cockpit and the old automation feed read the same
 * automation_events, so the page used to list everything twice.
 */
export default async function ApprovalsPage() {
  const [approvals, activity, urgent] = await Promise.all([listApprovals(), listCockpitActivity(), gatherUrgent()]);
  return <StudioApprovals approvals={approvals} activity={activity} needsYou={urgent.total} needsYouParts={urgent.parts} />;
}

import { Cockpit } from "@/components/cockpit";
import { listApprovals, listCockpitActivity } from "@/lib/cockpit";
import { gatherUrgent } from "@/lib/morning-brief";

export const dynamic = "force-dynamic";

export const metadata = { title: "Approvals · COS" };

export default async function ApprovalsPage() {
  const [approvals, activity, urgent] = await Promise.all([listApprovals(), listCockpitActivity(), gatherUrgent()]);
  return (
    <div className="space-y-4">
      <div className="px-1">
        <h1 className="text-lg font-semibold tracking-tight">Approvals</h1>
        <p className="text-sm text-fg-muted">
          One place to verify what the system proposes — and review what it did on its own.
        </p>
      </div>
      <Cockpit approvals={approvals} activity={activity} needsYou={urgent.total} needsYouParts={urgent.parts} />
    </div>
  );
}

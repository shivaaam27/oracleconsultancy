import { Cockpit } from "@/components/cockpit";
import { AutomationFeed } from "@/components/automation-feed";
import { listApprovals, listCockpitActivity } from "@/lib/cockpit";
import { listAutomationFeed } from "@/app/automations/actions";
import { gatherUrgent } from "@/lib/morning-brief";

export const dynamic = "force-dynamic";

export const metadata = { title: "Approvals · COS" };

export default async function ApprovalsPage() {
  // The automation feed lost its screen at some point — the apply / undo /
  // dismiss / run-now actions all still worked, but nothing rendered them, so
  // there was no way to see what the system had proposed. This page already
  // promises exactly that, so it belongs here.
  const [approvals, activity, urgent, automation] = await Promise.all([
    listApprovals(),
    listCockpitActivity(),
    gatherUrgent(),
    listAutomationFeed(),
  ]);
  return (
    <div className="space-y-4">
      <div className="px-1">
        <h1 className="text-lg font-semibold tracking-tight">Approvals</h1>
        <p className="text-sm text-fg-muted">
          One place to verify what the system proposes — and review what it did on its own.
        </p>
      </div>
      <Cockpit approvals={approvals} activity={activity} needsYou={urgent.total} needsYouParts={urgent.parts} />
      <AutomationFeed applied={automation.applied} suggestions={automation.suggestions} />
    </div>
  );
}

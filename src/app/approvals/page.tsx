import { Cockpit } from "@/components/cockpit";
import { listApprovals, listCockpitActivity } from "@/lib/cockpit";

export const dynamic = "force-dynamic";

export const metadata = { title: "Approvals · COS" };

export default async function ApprovalsPage() {
  const [approvals, activity] = await Promise.all([listApprovals(), listCockpitActivity()]);
  return (
    <div className="mx-auto max-w-[760px] space-y-4">
      <div className="px-1">
        <h1 className="text-lg font-semibold tracking-tight">Approvals</h1>
        <p className="text-sm text-fg-muted">
          One place to verify what the system proposes — and review what it did on its own.
        </p>
      </div>
      <Cockpit approvals={approvals} activity={activity} />
    </div>
  );
}

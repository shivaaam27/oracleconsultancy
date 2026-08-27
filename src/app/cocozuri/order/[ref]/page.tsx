import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { CocozuriPlanRecord } from "@/components/cocozuri-plan-record";
import { cocozuriCompany } from "@/lib/cocozuri";
import { getPlanByRef, planNeeds } from "@/lib/cocozuri-plan";
import { czDate } from "@/lib/cocozuri-shared";
import { CocozuriTimeline } from "@/components/cocozuri-timeline";
import { timelineFor } from "@/lib/cocozuri-events";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  return { title: `${decodeURIComponent(ref)} — CocoZuri` };
}

/**
 * One day's plan: what is being made, and what it will take off the shelf.
 *
 * ⚠️ NOTHING HERE MOVES STOCK EXCEPT STARTING A LINE, and that opens a real
 * batch through `openBatch` — the door that already exists.
 */
export default async function CocozuriPlanPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  const plan = await getPlanByRef(decodeURIComponent(ref));
  if (!plan) notFound();

  const [company, needs, events] = await Promise.all([
    cocozuriCompany(), planNeeds(plan), timelineFor("plan", plan.id),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader
        title={plan.reference}
        sub={`${czDate(plan.onDate)}${plan.locationName ? ` · ${plan.locationName}` : ""}${company ? ` · ${company.name}` : ""}`}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Link href="/cocozuri/order"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-sm text-fg-muted hover:text-fg">
          <ArrowLeft size={13} /> All plans
        </Link>
      </div>

      <CocozuriPlanRecord
        plan={plan}
        materials={needs.materials}
        linesWithoutRecipe={needs.linesWithoutRecipe}
      />

      <CocozuriTimeline
        subjectType="plan" subjectId={plan.id} subjectRef={plan.reference}
        events={events} />
    </div>
  );
}

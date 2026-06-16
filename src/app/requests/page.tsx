import { MessageSquareText } from "lucide-react";
import { Hero } from "@/components/surface-kit";
import { Reveal } from "@/components/reveal";
import { AutoRefresh } from "@/components/auto-refresh";
import { listRequestsForAdmin, allActivePeople, requestTrends, getRequestCategories } from "@/lib/requests";
import { RequestAdmin } from "@/components/request-admin";
import { adminRaiseRequest, adminSetRequestCategories } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Requests — Oracle Consultancy" };

export default async function RequestsPage() {
  const [rows, people, trends, categories] = await Promise.all([
    listRequestsForAdmin(),
    allActivePeople(),
    requestTrends(),
    getRequestCategories(),
  ]);

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <AutoRefresh seconds={30} />
      <Reveal delay={0}>
        <Hero title="Requests" subtitle="Everything staff and managers have raised, across all seven companies — and your own requests to them.">
          <div className="flex items-center gap-2 text-sm text-fg-muted">
            <MessageSquareText size={15} />
            {rows.length} request{rows.length === 1 ? "" : "s"}
          </div>
        </Hero>
      </Reveal>
      <Reveal delay={0.05}>
        <RequestAdmin
          rows={rows}
          people={people}
          trends={trends}
          categories={categories}
          raiseAction={adminRaiseRequest}
          saveTypesAction={adminSetRequestCategories}
        />
      </Reveal>
    </div>
  );
}

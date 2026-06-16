import { MessageSquareText } from "lucide-react";
import { Hero } from "@/components/surface-kit";
import { Reveal } from "@/components/reveal";
import { AutoRefresh } from "@/components/auto-refresh";
import { listRequestsForAdmin } from "@/lib/requests";
import { RequestList } from "@/components/request-list";

export const dynamic = "force-dynamic";
export const metadata = { title: "Requests — Oracle Consultancy" };

export default async function RequestsPage() {
  const rows = await listRequestsForAdmin();

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <AutoRefresh seconds={30} />
      <Reveal delay={0}>
        <Hero title="Requests" subtitle="Everything staff and managers have raised, across all seven companies.">
          <div className="flex items-center gap-2 text-sm text-fg-muted">
            <MessageSquareText size={15} />
            {rows.length} request{rows.length === 1 ? "" : "s"}
          </div>
        </Hero>
      </Reveal>
      <Reveal delay={0.05}>
        <RequestList rows={rows} base="/requests" scope="admin" />
      </Reveal>
    </div>
  );
}

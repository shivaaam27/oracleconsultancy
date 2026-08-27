import { PageHeader } from "@/components/ui";
import { CocozuriHistory } from "@/components/cocozuri-history";
import { cocozuriCompany } from "@/lib/cocozuri";
import { dayLog } from "@/lib/cocozuri-events";
import { todayInDar } from "@/lib/cocozuri-stock-shared";
import { addDays } from "@/lib/cocozuri-trace-shared";

export const dynamic = "force-dynamic";
export const metadata = { title: "What happened — CocoZuri" };

/**
 * What happened, and when.
 *
 * ⚠️ NOTHING IN THIS MODULE COULD ANSWER "WHAT HAPPENED ON THE 12TH". The stock
 * ledger knows quantities moved and the general ledger knows money moved;
 * neither knows that somebody cancelled an invoice on Tuesday, abandoned a batch
 * at four, or left a note about a delivery.
 *
 * ⚠️ THE DATES LIVE IN THE ADDRESS, so a day can be bookmarked and sent — the
 * same rule the stock book, the statements and the reports all follow.
 */
export default async function CocozuriHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const company = await cocozuriCompany();
  if (!company) {
    return (
      <div className="space-y-4">
        <PageHeader title="What happened" sub="CocoZuri" />
        <p className="rounded-lg border border-warn/30 bg-warn/10 px-3.5 py-2.5 text-sm text-warn">
          Cocozuri is not in the company list.
        </p>
      </div>
    );
  }

  const sp = await searchParams;
  const to = sp.to ?? todayInDar();
  // A fortnight reads as a working stretch without becoming a wall of text.
  const from = sp.from ?? addDays(to, -14);

  const events = await dayLog({ from, to });

  return (
    <div className="space-y-4">
      <PageHeader
        title="What happened"
        sub={
          events.length === 0
            ? `Nothing recorded in that time · ${company.name}`
            : `${events.length} thing${events.length === 1 ? "" : "s"} · ${company.name}`
        }
      />
      <CocozuriHistory events={events} from={from} to={to} />
    </div>
  );
}

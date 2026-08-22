import { Info } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { CocozuriCounter } from "@/components/cocozuri-counter";
import { cocozuriCompany, listCustomers } from "@/lib/cocozuri";
import { listLocations } from "@/lib/cocozuri-stock";
import { listCounterSales } from "@/lib/cocozuri-counter";
import { counterTotals, takings } from "@/lib/cocozuri-counter-shared";
import { booksStateFor, postingOverview } from "@/lib/cocozuri-ledger";
import { money } from "@/lib/cocozuri-shared";
import { todayInDar } from "@/lib/cocozuri-stock-shared";

export const dynamic = "force-dynamic";
export const metadata = { title: "The counter — CocoZuri" };

/**
 * Stage 5b — what goes over a counter.
 *
 * ⚠️ THE OWNER SETTLED WHAT THIS IS: *"cash taken and kept in drawer and
 * informed via WhatsApp and there is some data sheets, some cash collected via
 * online modes... for now we won't integrate a payment system here, just reports
 * get digital."*
 *
 * So it is a RECORD, not a till. Nothing takes payment. What it replaces is the
 * WhatsApp message and the paper sheet.
 */
export default async function CocozuriCounterPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const company = await cocozuriCompany();
  if (!company) {
    return (
      <div className="space-y-4">
        <PageHeader title="The counter" sub="CocoZuri" />
        <p className="rounded-lg border border-warn/30 bg-warn/10 px-3.5 py-2.5 text-sm text-warn">
          Cocozuri is not in the company list.
        </p>
      </div>
    );
  }

  const [sp, sales, locations, customers, posting] = await Promise.all([
    searchParams,
    listCounterSales(),
    listLocations({ includeInactive: true }),
    listCustomers(),
    postingOverview(),
  ]);
  const state = await booksStateFor({ counterSales: sales.map((s) => s.id) });

  const today = todayInDar();
  const todayRows = takings(sales).filter((d) => d.onDate === today);
  const todayTotal = todayRows.reduce((s, d) => s + d.total, 0);
  const waiting = sales.filter((s) => s.status === "recorded" && (state.counterSales.get(s.id) ?? "unposted") === "unposted").length;
  const all = sales
    .filter((s) => s.status === "recorded")
    .reduce((t, s) => t + counterTotals(s.lines, s.vatRate).gross, 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title="The counter"
        sub={
          sales.length === 0
            ? `Nothing written down yet · ${company.name}`
            : `${money(todayTotal > 0 ? todayTotal : all)} ${todayTotal > 0 ? "today" : "so far"}${waiting > 0 ? ` · ${waiting} not in the books` : ""} · ${company.name}`
        }
      />

      {/* ⚠️ Said once, at the top, so nobody expects a till. */}
      <p className="flex items-start gap-2 rounded-lg border border-border bg-bg-elev px-3.5 py-2.5 text-sm text-fg-muted">
        <Info size={14} className="mt-px shrink-0" />
        <span>
          This does not take payment and does not talk to a card machine or to mobile money — the
          money has already changed hands. It is the WhatsApp message and the paper sheet, written
          down once: what was sold, off which counter, and how the money came in. The chocolate
          comes off the shelf and the takings can be totted up at the end of the day.
        </span>
      </p>

      <CocozuriCounter
        sales={sales}
        locations={locations}
        customers={customers.map((c) => ({ id: c.id, name: c.name }))}
        booksState={Object.fromEntries(state.counterSales)}
        ready={posting.ready}
        reason={posting.reason}
        openNew={sp.new === "1"}
      />
    </div>
  );
}

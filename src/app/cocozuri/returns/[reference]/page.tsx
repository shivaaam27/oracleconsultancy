import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { czDate } from "@/lib/cocozuri-shared";
import { CocozuriReturnActions } from "@/components/cocozuri-return-actions";
import { CocozuriTimeline } from "@/components/cocozuri-timeline";
import { CocozuriHelp } from "@/components/cocozuri-help";
import { timelineFor } from "@/lib/cocozuri-events";
import { cocozuriCompany } from "@/lib/cocozuri";
import { getReturnByRef, returnScrapValue } from "@/lib/cocozuri-return";
import { postingOverview, writeOffState } from "@/lib/cocozuri-ledger";
import {
  CZ_RETURN_KIND_LABEL, CZ_RETURN_STATUS_LABEL, daysWaiting, lossReasonLabel, returnCheck,
} from "@/lib/cocozuri-return-shared";
import { qty as qtyText, todayInDar } from "@/lib/cocozuri-stock-shared";
import { money } from "@/lib/cocozuri-shared";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  return { title: `${decodeURIComponent(reference)} — CocoZuri` };
}

/**
 * One return: what came back, what was repacked, and what went in the bin.
 *
 * ⚠️ THE COST OF THE BIN IS THE POINT OF THE PAGE. "Breakage as a number you can
 * manage rather than a gap in a count" is what Stage 6 is for, and the figure is
 * shown with its footing — a total with a silent zero in it reads as cheap.
 */
export default async function CocozuriReturnPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  const r = await getReturnByRef(decodeURIComponent(reference));
  if (!r) notFound();

  const [company, scrap, books, posting, events] = await Promise.all([
    cocozuriCompany(),
    returnScrapValue(r),
    writeOffState(r.id),
    postingOverview(),
    timelineFor("return", r.id),
  ]);
  const check = returnCheck(r);
  const waiting = daysWaiting(r, todayInDar());

  return (
    <div className="space-y-4">
      <PageHeader
        title={r.reference}
        sub={`${CZ_RETURN_KIND_LABEL[r.kind]} · ${r.locationName ?? "?"} · ${czDate(r.onDate)}${company ? ` · ${company.name}` : ""}`}
        action={
          <CocozuriHelp title="This return">
            <p>
              <strong>What is still &ldquo;repairing&rdquo; is what has come back less what has been
              repacked and what has been thrown.</strong> It is the exact twin of stock in transit on
              a transfer, and it is why this can be settled more than once &mdash; five bars repacked
              today and five thrown next week is the real case.
            </p>
            <p>
              <strong>Only the scrap moves anything now.</strong> What was repacked is already on the
              shelf; writing a movement for it would count the same chocolate twice.
            </p>
            <p>
              <strong>The write-off is posted at what it cost</strong>, never at what it would have
              sold for, and only once nothing is left on the bench &mdash; what is still there might
              yet be sold. A loss that cannot be valued in full is refused with the item named,
              rather than posted short.
            </p>
            <p>
              <strong>A sales return reverses the sale but does not put the cost back.</strong>
              Nothing ever took the cost of that sale out of stock, so it is still sitting there.
            </p>
            <p>
              The credit note is priced off the <em>original</em> invoice, credits what came back
              rather than what was repacked, and lands as a draft.
            </p>
          </CocozuriHelp>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Link href="/cocozuri/returns"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-sm text-fg-muted hover:text-fg">
          <ArrowLeft size={13} /> All returns
        </Link>
        <span className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm ${
          r.status === "settled" ? "bg-success/10 text-success"
            : r.status === "cancelled" ? "bg-bg-subtle text-fg-subtle" : "bg-warn/10 text-warn"}`}>
          {CZ_RETURN_STATUS_LABEL[r.status]}
          {waiting != null && waiting >= 1 && ` · ${waiting} day${waiting === 1 ? "" : "s"}`}
        </span>
        {r.customerName && <span className="text-sm text-fg-subtle">from {r.customerName}</span>}
        {r.invoiceNumber && (
          <Link href={`/cocozuri/invoices/${encodeURIComponent(r.invoiceNumber)}`}
            className="text-sm text-accent hover:underline">{r.invoiceNumber}</Link>
        )}
        {r.receivedBy && <span className="text-sm text-fg-subtle">taken in by {r.receivedBy}</span>}
      </div>

      <CocozuriReturnActions
        czReturn={r}
        scrap={scrap}
        booksState={books}
        postingReady={posting.ready}
        postingReason={posting.reason}
      />

      <div className="grid gap-3 sm:grid-cols-4">
        <Tile label={r.kind === "customer" ? "Came back" : "Found damaged"} value={qtyText(check.cameBack)} />
        <Tile label="Repacked and back on sale" value={check.good > 0 ? qtyText(check.good) : "none"}
          tone={check.good > 0 ? "success" : "muted"} />
        <Tile label="Thrown away" value={check.scrapped > 0 ? qtyText(check.scrapped) : "none"}
          tone={check.scrapped > 0 ? "danger" : "muted"} />
        <Tile label="Still being looked at" value={check.beingRepaired > 0 ? qtyText(check.beingRepaired) : "none"}
          tone={check.beingRepaired > 0 ? "warn" : "muted"} />
      </div>

      {/* ⚠️ Said out loud while it lasts. Chocolate on a bench is neither
          sellable nor written off, and that is a real state — not a gap. */}
      {r.status === "open" && check.beingRepaired > 0 && (
        <p className="flex items-start gap-2 rounded-lg border border-warn/30 bg-warn/10 px-3.5 py-2.5 text-sm text-warn">
          <AlertTriangle size={14} className="mt-px shrink-0" />
          <span>
            <strong>{qtyText(check.beingRepaired)}</strong> is still being looked at.
            {r.kind === "customer"
              ? " It is back on the shelf and counted as stock — say what is fit to sell and what is not."
              : " It is still counted as stock on the shelf, so nothing has come off yet."}
          </span>
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-border bg-bg-elev">
        <div className="min-w-[36rem]">
          <div className="grid grid-cols-[minmax(10rem,1fr)_100px_100px_100px_110px] items-center gap-2 border-b border-border bg-bg-subtle px-3 py-1.5 text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">
            <span>Chocolate</span>
            <span className="text-right">Came back</span>
            <span className="text-right">Repacked</span>
            <span className="text-right">Thrown</span>
            <span className="text-right">On the bench</span>
          </div>
          {r.lines.map((l) => {
            const decided = (l.goodQty ?? 0) + (l.scrapQty ?? 0);
            const left = Math.max(0, Math.round((l.qty - decided) * 1000) / 1000);
            const cost = scrap.lines.find((s) => s.itemId === l.itemId);
            return (
              <div key={l.id} className="border-b border-border px-3 py-1.5 last:border-0">
                <div className="grid grid-cols-[minmax(10rem,1fr)_100px_100px_100px_110px] items-center gap-2">
                  <span className="min-w-0 truncate text-sm text-fg" title={l.itemName}>
                    {l.itemName}
                    {/* ⚠️ A returned crate is the first place a bad batch shows
                        itself — which is why the batch travels with it. */}
                    {l.batchNo && <span className="ml-1.5 text-xs text-fg-subtle">{l.batchNo}</span>}
                  </span>
                  <span className="text-right text-sm tabular text-fg-muted">{qtyText(l.qty)} {l.uom}</span>
                  <span className="text-right text-sm tabular text-fg">
                    {l.goodQty == null ? "—" : qtyText(l.goodQty)}
                  </span>
                  <span className={`text-right text-sm tabular ${(l.scrapQty ?? 0) > 0 ? "text-danger" : "text-fg-subtle"}`}>
                    {l.scrapQty == null ? "—" : qtyText(l.scrapQty)}
                  </span>
                  <span className={`text-right text-sm tabular ${left > 0 ? "text-warn" : "text-fg-subtle"}`}>
                    {left > 0 ? qtyText(left) : "—"}
                  </span>
                </div>
                {cost && (
                  <p className="mt-0.5 text-xs text-fg-subtle">
                    {cost.unitCost == null
                      // ⚠️ Named, never counted as free.
                      ? "Nothing has ever been bought or made of this at a known cost, so what throwing it away cost is not known."
                      : `Thrown away at ${money(cost.unitCost)} each — ${money(cost.value ?? 0)}.`}
                  </p>
                )}
                {l.notes && <p className="mt-0.5 text-xs text-fg-muted">{l.notes}</p>}
              </div>
            );
          })}
        </div>
      </div>

      {r.lossKind && (
        <p className="rounded-lg border border-border bg-bg-elev px-3.5 py-2.5 text-sm text-fg-muted">
          The loss belongs to <strong className="text-fg">{lossReasonLabel(r.lossKind).toLowerCase()}</strong>
          {r.lossNote ? <> — {r.lossNote}</> : null}
        </p>
      )}

      {/* ⚠️ THE HALF THAT IS DELIBERATELY NOT POSTED, said on the page rather
          than only in the code. Note #11 asks for the cost value to move as well
          as the sale value; it cannot be done honestly yet. */}
      {r.kind === "customer" && check.good > 0 && (
        <p className="rounded-lg border border-border bg-bg-elev px-3.5 py-2.5 text-sm text-fg-muted">
          The <strong className="text-fg">sale</strong> is reversed by the credit note. The{" "}
          <strong className="text-fg">cost</strong> is not put back, on purpose: nothing has ever
          taken the cost of a sale OUT of the stock account — that arrives with cost of goods sold —
          so putting it back now would count the same chocolate twice.
        </p>
      )}

      {r.notes && (
        <p className="rounded-lg border border-border bg-bg-elev px-3.5 py-2.5 text-sm text-fg-muted">{r.notes}</p>
      )}

      <p className="flex items-center gap-1.5 text-xs text-fg-subtle">
        <ArrowRight size={11} />
        Every movement here carries {r.reference}, so what this return did to the shelf is always
        answerable.
      </p>

      {/* ⚠️ SETTLING IS CUMULATIVE — five bars repacked today and five thrown
          next week. A status column can only ever say where it ended up; this is
          where each of those decisions is dated and attributed. */}
      <CocozuriTimeline
        subjectType="return" subjectId={r.id} subjectRef={r.reference}
        events={events} />
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: "danger" | "success" | "warn" | "muted" }) {
  return (
    <div className="rounded-lg border border-border bg-bg-elev px-3.5 py-3">
      <span className={`block truncate text-lg font-semibold leading-none tabular ${
        tone === "danger" ? "text-danger" : tone === "success" ? "text-success"
          : tone === "warn" ? "text-warn" : tone === "muted" ? "text-fg-subtle" : "text-fg"}`}>
        {value}
      </span>
      <span className="mt-1 block text-sm text-fg-muted">{label}</span>
    </div>
  );
}

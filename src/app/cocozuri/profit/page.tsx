import Link from "next/link";
import { AlertTriangle, Info } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { CocozuriHelp } from "@/components/cocozuri-help";
import { CocozuriCostOfSales } from "@/components/cocozuri-cost-of-sales";
import { cocozuriCompany } from "@/lib/cocozuri";
import { czDate, czMonth, money } from "@/lib/cocozuri-shared";
import { qty as qtyText, todayInDar } from "@/lib/cocozuri-stock-shared";
import { batchProfits, costOfSalesFor, profitBy, profitMonths, stocktakeValueFor } from "@/lib/cocozuri-profit";
import { costOfSalesState, postingOverview, stocktakeState } from "@/lib/cocozuri-ledger";
import { YIELD_BENCHMARK } from "@/lib/cocozuri-profit-shared";

export const dynamic = "force-dynamic";
export const metadata = { title: "Profit — CocoZuri" };

type View = "batch" | "customer" | "month";
const VIEWS: { key: View; label: string }[] = [
  { key: "batch", label: "Per batch" },
  { key: "customer", label: "Per customer" },
  { key: "month", label: "Per month" },
];

/**
 * Which chocolate makes money.
 *
 * ⚠️ A REPORT IS A LINK — the view and the month live in the address, like every
 * report on the ledger, so it can be bookmarked and sent to an accountant.
 *
 * ⚠️ AND THE ONE THING THIS PAGE MUST NOT DO IS BLUR TWO CLAIMS. What a batch
 * COST is measured. What a batch EARNED is not knowable — an invoice line names
 * a product, not a batch — so the batch view shows what its bars are WORTH at
 * the price they sell for, and says so.
 */
export default async function CocozuriProfitPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; month?: string }>;
}) {
  const company = await cocozuriCompany();
  if (!company) {
    return (
      <div className="space-y-4">
        <PageHeader title="Profit" sub="CocoZuri" />
        <p className="rounded-lg border border-warn/30 bg-warn/10 px-3.5 py-2.5 text-sm text-warn">
          Cocozuri is not in the company list.
        </p>
      </div>
    );
  }

  const sp = await searchParams;
  const view: View = VIEWS.some((v) => v.key === sp.view) ? (sp.view as View) : "batch";
  const months = await profitMonths();
  const month = sp.month === "all" ? "all" : (sp.month && months.includes(sp.month) ? sp.month : months[0] ?? todayInDar().slice(0, 7));

  const [year, mon] = month === "all" ? [0, 0] : month.split("-").map(Number);
  const [batches, byCustomer, byMonth, cos, books, posting, stk, stkBooks] = await Promise.all([
    batchProfits(),
    profitBy("customer"),
    profitBy("month"),
    month === "all" ? Promise.resolve(null) : costOfSalesFor(year!, mon!),
    month === "all" ? Promise.resolve("unposted" as const) : costOfSalesState(year!, mon!),
    postingOverview(),
    month === "all" ? Promise.resolve(null) : stocktakeValueFor(year!, mon!),
    month === "all" ? Promise.resolve("unposted" as const) : stocktakeState(year!, mon!),
  ]);

  const monthRow = month === "all" ? null : byMonth.find((r) => r.key === month) ?? null;
  const netSales = month === "all" ? byMonth.reduce((s, r) => s + r.net, 0) : monthRow?.net ?? 0;
  const costValue = cos?.value ?? 0;
  const grossProfit = month === "all" ? null : netSales - costValue;

  const href = (v: View, m?: string) =>
    `/cocozuri/profit?view=${v}&month=${encodeURIComponent(m ?? month)}`;

  const shownBatches = month === "all" ? batches : batches.filter((b) => (b.madeOn ?? "").startsWith(month));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Profit"
        sub={`${month === "all" ? "Everything so far" : czMonth(month)} · ${company.name}`}
        action={
          <CocozuriHelp title="Profit">
            <p>
              <strong>What a single batch earned cannot be known, and this page says so.</strong> An
              invoice line names a chocolate, not a batch. So what is shown is what the batch
              <em> cost</em> &mdash; measured from what it actually consumed, never from the recipe
              &mdash; and what its bars are <em>worth</em> at the price they sell for.
            </p>
            <p>
              <strong>Cost per unit divides by what came out</strong>, not by what the recipe hoped
              for. The recipe is a plan; this is a measurement.
            </p>
            <p>
              <strong>The margin is taken net of VAT.</strong> Costs are before VAT and a CocoZuri
              invoice includes it, so comparing them straight would inflate every margin by the
              rate. The price used is what was actually charged, in preference to the list.
            </p>
            <p>
              <strong>An incomplete cost makes profit a ceiling, not a floor.</strong> Profit and
              margin read &ldquo;at most&rdquo; where something could not be valued &mdash; the
              opposite of a cost, which reads &ldquo;at least&rdquo;.
            </p>
            <p>
              <strong>Cost of sales refuses a month it cannot value in full</strong>, and names what
              is missing. Understating the cost overstates the profit, which is the one direction of
              error nobody ever notices.
            </p>
            <p>
              Damaged stock is not counted here: it is charged when it is written off, and counting
              it twice would make gross profit look worse the more breakage there was.
            </p>
          </CocozuriHelp>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {VIEWS.map((v) => (
          <Link key={v.key} href={href(v.key)}
            className={`inline-flex h-8 items-center rounded-md px-2.5 text-sm ${
              view === v.key ? "bg-accent text-accent-fg" : "border border-border text-fg-muted hover:text-fg"}`}>
            {v.label}
          </Link>
        ))}
        <span className="grow" />
        <div className="flex flex-wrap items-center gap-1.5">
          <Link href={href(view, "all")}
            className={`inline-flex h-8 items-center rounded-md px-2.5 text-sm ${
              month === "all" ? "bg-bg-subtle text-fg" : "border border-border text-fg-muted hover:text-fg"}`}>
            All time
          </Link>
          {months.slice(0, 6).map((m) => (
            <Link key={m} href={href(view, m)}
              className={`inline-flex h-8 items-center rounded-md px-2.5 text-sm ${
                month === m ? "bg-bg-subtle text-fg" : "border border-border text-fg-muted hover:text-fg"}`}>
              {czMonth(m)}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Tile label="Sold, net of VAT" value={money(netSales)} />
        <Tile
          label="What it cost off the shelf"
          value={cos == null ? "—" : `${cos.complete ? "" : "≥ "}${money(costValue)}`}
          tone={cos && !cos.complete ? "warn" : undefined} />
        <Tile
          label="Gross profit"
          value={grossProfit == null ? "—" : `${cos && !cos.complete ? "≤ " : ""}${money(grossProfit)}`}
          tone={grossProfit != null && grossProfit < 0 ? "danger" : "success"} />
        <Tile
          label="Margin"
          value={grossProfit == null || netSales === 0 ? "—" : `${Math.round((grossProfit / netSales) * 1000) / 10}%`} />
      </div>

      {/* ⚠️ THE TWO WAYS OF COSTING, SAID OUT LOUD. They are different questions
          and they will not agree while what left the shelf and what was invoiced
          disagree — which is itself the thing worth looking at. */}
      <p className="flex items-start gap-2 rounded-lg border border-border bg-bg-elev px-3.5 py-2.5 text-sm text-fg-muted">
        <Info size={14} className="mt-px shrink-0" />
        <span>
          The cost above is <strong className="text-fg">what actually left the shelf</strong>, read
          from the stock ledger. The per-customer figures below cost each invoice line instead. The
          two will not agree while the shelf and the invoices disagree — and that gap is worth more
          than either number.
        </span>
      </p>

      {month !== "all" && cos && (
        <CocozuriCostOfSales
          year={year!} month={mon!} label={czMonth(month)}
          value={cos.value} complete={cos.complete} unknown={cos.unknown}
          countAdjustment={cos.countAdjustment}
          lineCount={cos.lines.length}
          booksState={books}
          ready={posting.ready} reason={posting.reason}
          stocktake={{
            value: stk?.value ?? 0,
            complete: stk?.complete ?? true,
            unknown: stk?.unknown ?? [],
            lineCount: stk?.lines.length ?? 0,
            booksState: stkBooks,
          }} />
      )}

      {view === "batch" && <BatchView batches={shownBatches} month={month} />}
      {view === "customer" && <ProfitTable rows={byCustomer} what="Customer" />}
      {view === "month" && <ProfitTable rows={byMonth} what="Month" />}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Per batch — the circled one
 * ------------------------------------------------------------------ */

function BatchView({ batches, month }: { batches: Awaited<ReturnType<typeof batchProfits>>; month: string }) {
  if (batches.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-bg-elev px-3.5 py-6 text-center text-sm text-fg-subtle">
        No batch was finished {month === "all" ? "yet" : `in ${czMonth(month)}`}. A batch has to be closed
        before anybody can say what it cost — that is when the materials are recorded.
      </p>
    );
  }
  return (
    <>
      {/* ⚠️ The line that keeps this page honest — but it is an EXPLANATION, not
          a warning, and it sat in amber directly beneath a real amber warning.
          Two alarm-coloured panels touching read as one long alarm, and the
          second one stops being read. Neutral, so the warning above it keeps
          its colour to itself. */}
      <p className="flex items-start gap-2 rounded-lg border border-border bg-bg-elev px-3.5 py-2.5 text-sm text-fg-muted">
        <Info size={14} className="mt-px shrink-0" />
        <span>
          This is what each batch <strong>cost</strong>, and what its bars are <strong>worth</strong> at
          the price they sell for — not what the batch earned. An invoice names a chocolate, not a
          batch, so nobody can yet say which run of it a supermarket actually bought.
        </span>
      </p>

      <div className="overflow-x-auto rounded-lg border border-border bg-bg-elev">
        <div className="min-w-[52rem]">
          <div className="grid grid-cols-[120px_minmax(9rem,1fr)_90px_100px_110px_110px_100px_90px] items-center gap-2 border-b border-border bg-bg-subtle px-3 py-1.5 text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">
            <span>Batch</span>
            <span>What was made</span>
            <span className="text-right">Came out</span>
            <span className="text-right">Cost</span>
            <span className="text-right">Each</span>
            <span className="text-right">Sells for</span>
            <span className="text-right">Margin</span>
            <span className="text-right">Yield</span>
          </div>
          {batches.map((b) => (
            <div key={b.batchId} className="border-b border-border px-3 py-1.5 last:border-0">
              <div className="grid grid-cols-[120px_minmax(9rem,1fr)_90px_100px_110px_110px_100px_90px] items-center gap-2">
                <Link href={`/cocozuri/batches/${encodeURIComponent(b.batchNo)}`}
                  className="min-w-0 truncate text-sm text-accent hover:underline">{b.batchNo}</Link>
                <span className="min-w-0 truncate text-sm text-fg" title={b.itemName ?? ""}>
                  {b.itemName ?? "—"}
                  {b.madeOn && <span className="ml-1.5 text-xs text-fg-subtle">{czDate(b.madeOn)}</span>}
                </span>
                <span className="text-right text-sm tabular text-fg-muted">{qtyText(b.costing.goodUnits)}</span>
                {/* ⚠️ "≥" the moment one material has never been costed. A total
                    with a silent zero in it reads as cheap. */}
                <span className="text-right text-sm tabular text-fg">
                  {b.costing.complete ? "" : "≥ "}{money(b.costing.totalCost)}
                </span>
                <span className="text-right text-sm tabular text-fg">
                  {b.costing.unitCost == null ? "—" : `${b.costing.complete ? "" : "≥ "}${money(b.costing.unitCost)}`}
                </span>
                <span className="text-right text-sm tabular text-fg-muted">
                  {b.margin.unitPrice == null ? "not sold yet" : money(b.margin.unitPrice)}
                </span>
                <span className={`text-right text-sm tabular ${
                  b.margin.unitMargin == null ? "text-fg-subtle"
                    : b.margin.unitMargin < 0 ? "text-danger" : "text-success"}`}>
                  {b.margin.marginPercent == null ? "—" : `${b.margin.atMost ? "≤ " : ""}${b.margin.marginPercent}%`}
                </span>
                <span className={`text-right text-sm tabular ${b.belowBenchmark ? "text-warn" : "text-fg-subtle"}`}>
                  {b.yieldPercent == null ? "—" : `${b.yieldPercent}%`}
                </span>
              </div>
              {(b.costing.unknown.length > 0 || b.distribution.length > 0 || b.belowBenchmark) && (
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-fg-subtle">
                  {b.belowBenchmark && (
                    <span className="text-warn">below the {YIELD_BENCHMARK}% the trade expects</span>
                  )}
                  {b.costing.unknown.length > 0 && (
                    <span className="text-warn">
                      no cost for {b.costing.unknown.slice(0, 2).join(", ")}
                      {b.costing.unknown.length > 2 ? ` and ${b.costing.unknown.length - 2} more` : ""}
                    </span>
                  )}
                  {/* Note #43 — what the cost is made of. From the RECIPE, which
                      is a property of the design rather than of this run. */}
                  {b.distribution.map((d) => (
                    <span key={d.label}>{d.label} {d.percent}%</span>
                  ))}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Per customer and per month
 * ------------------------------------------------------------------ */

function ProfitTable({ rows, what }: { rows: { key: string; label: string; net: number; cost: number; profit: number; marginPercent: number | null; documents: number; complete: boolean; unknown: string[] }[]; what: string }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-bg-elev px-3.5 py-6 text-center text-sm text-fg-subtle">
        Nothing has been invoiced yet. Only issued invoices count — a draft was never sent to
        anybody.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-bg-elev">
      <div className="min-w-[40rem]">
        <div className="grid grid-cols-[minmax(10rem,1fr)_80px_120px_120px_120px_90px] items-center gap-2 border-b border-border bg-bg-subtle px-3 py-1.5 text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">
          <span>{what}</span>
          <span className="text-right">Papers</span>
          <span className="text-right">Sold, net</span>
          <span className="text-right">Cost</span>
          <span className="text-right">Gross profit</span>
          <span className="text-right">Margin</span>
        </div>
        {rows.map((r) => (
          <div key={r.key} className="border-b border-border px-3 py-1.5 last:border-0">
            <div className="grid grid-cols-[minmax(10rem,1fr)_80px_120px_120px_120px_90px] items-center gap-2">
              <span className="min-w-0 truncate text-sm text-fg" title={r.label}>{r.label}</span>
              <span className="text-right text-sm tabular text-fg-subtle">{r.documents}</span>
              <span className="text-right text-sm tabular text-fg-muted">{money(r.net)}</span>
              {/* ⚠️ An incomplete cost is a FLOOR, so the profit above it is a
                  CEILING — the opposite of everywhere else, and the one direction
                  of error nobody notices. */}
              <span className="text-right text-sm tabular text-fg-muted">
                {r.complete ? "" : "≥ "}{money(r.cost)}
              </span>
              <span className={`text-right text-sm tabular ${r.profit < 0 ? "text-danger" : "text-fg"}`}>
                {r.complete ? "" : "≤ "}{money(r.profit)}
              </span>
              <span className={`text-right text-sm tabular ${
                r.marginPercent == null ? "text-fg-subtle" : r.marginPercent < 0 ? "text-danger" : "text-success"}`}>
                {r.marginPercent == null ? "—" : `${r.complete ? "" : "≤ "}${r.marginPercent}%`}
              </span>
            </div>
            {!r.complete && (
              <p className="mt-0.5 text-xs text-warn">
                Nothing has ever been bought or made at a known cost for{" "}
                {r.unknown.slice(0, 3).join(", ")}
                {r.unknown.length > 3 ? ` and ${r.unknown.length - 3} more` : ""}, so this profit is
                the most it could be, not what it is.
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: "danger" | "success" | "warn" }) {
  return (
    <div className="rounded-lg border border-border bg-bg-elev px-3.5 py-3">
      <span className={`block truncate text-lg font-semibold leading-none tabular ${
        tone === "danger" ? "text-danger" : tone === "success" ? "text-success"
          : tone === "warn" ? "text-warn" : "text-fg"}`}>
        {value}
      </span>
      <span className="mt-1 block text-sm text-fg-muted">{label}</span>
    </div>
  );
}

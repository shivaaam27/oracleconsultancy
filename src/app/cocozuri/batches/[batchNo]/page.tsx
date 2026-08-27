import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, Truck } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { CocozuriBatchClose } from "@/components/cocozuri-batch-close";
import { CocozuriBatchDraw } from "@/components/cocozuri-batch-draw";
import { CocozuriRereadRecipe } from "@/components/cocozuri-batch-reread";
import { CocozuriTimeline } from "@/components/cocozuri-timeline";
import { CocozuriHelp } from "@/components/cocozuri-help";
import { timelineFor } from "@/lib/cocozuri-events";
import { cocozuriCompany } from "@/lib/cocozuri";
import { listItems, listLocations, listMoves } from "@/lib/cocozuri-stock";
import { CZ_MOVE_REASON_LABEL, qty as qtyText, todayInDar } from "@/lib/cocozuri-stock-shared";
import { czDate } from "@/lib/cocozuri-shared";
import { batchDetail, drawnByItem, getBatchByNo, producedSoFar } from "@/lib/cocozuri-batch";
import {
  CZ_BATCH_STATUS_LABEL, daysOpen, lossLabel,
} from "@/lib/cocozuri-batch-shared";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ batchNo: string }> }) {
  const { batchNo } = await params;
  return { title: `${decodeURIComponent(batchNo)} — CocoZuri` };
}

/**
 * One batch: what it was for, what went in, what came out, and the difference.
 *
 * ⚠️ THE "INTER CHECK" IS THE POINT OF THIS PAGE (note #37). Everything else is
 * context for one subtraction — expected against actual — and where the answer
 * went if it is short (note #12).
 *
 * ⚠️ WHAT WENT IN IS READ FROM THE STOCK LEDGER, not from the recipe. Before the
 * batch is closed nothing has been consumed, so the recipe stands in and the
 * page says which of the two it is showing.
 */
export default async function CocozuriBatchPage({
  params,
}: {
  params: Promise<{ batchNo: string }>;
}) {
  const { batchNo } = await params;
  const batch = await getBatchByNo(decodeURIComponent(batchNo));
  if (!batch) notFound();

  const [company, detail, moves, allItems, locations] = await Promise.all([
    cocozuriCompany(),
    batchDetail(batch),
    // ⚠️ By the voucher — see `batchDetail`. `batch_id` is the material's lot.
    listMoves({ voucherType: "batch", voucherId: batch.id }),
    listItems(),
    listLocations({ includeInactive: true }),
  ]);
  // ⚠️ The movements table names its item; a ledger row carries only the id.
  const itemNames = new Map(allItems.map((i) => [i.id, i.name] as const));
  const { recipe, check, used, recipeMoved, judgedAgainst, plan } = detail;
  /* ⚠️ THE PLAN COMES FROM `batchDetail`, not rebuilt here. Building it again
     from the LIVE recipe meant the close form's material defaults and its
     expected quantity came from today's recipe while the difference printed
     above them came from the frozen one — the very fault the snapshot exists to
     end, arriving through a second calculation. */
  const consumed = moves.some((m) => m.reason === "consume");
  const open = daysOpen(batch, todayInDar());

  /* ⚠️ WHAT HAS ALREADY BEEN FETCHED TO THE BENCH. A batch that runs for days
     can take its materials as it goes, so the raw-material shelf reads true
     while it runs; closing then takes only what is still outstanding. */
  const drawn = batch.status === "running" ? await drawnByItem(batch.id) : new Map<number, number>();
  type DrawRow = { itemId: number; itemName: string; uom: string; planned: number | null; drawn: number };
  const drawMaterials: DrawRow[] = (plan?.materials ?? []).map((m) => ({
    itemId: m.itemId,
    itemName: m.itemName,
    uom: m.uom,
    planned: m.qty,
    drawn: drawn.get(m.itemId) ?? 0,
  }));
  /* Anything taken that the recipe never named still has to be listed, or the
     sheet would quietly forget it was ever taken. */
  for (const [itemId, qty] of drawn) {
    if (drawMaterials.some((m) => m.itemId === itemId)) continue;
    const item = allItems.find((i) => i.id === itemId);
    drawMaterials.push({
      itemId, itemName: item?.name ?? `Item #${itemId}`, uom: item?.uom ?? "PCS",
      planned: null, drawn: qty,
    });
  }
  const totalDrawn = [...drawn.values()].reduce((t, q) => t + q, 0);
  /* ⚠️ What has already reached the shelf — a batch may finish in more than
     one go, and closing then adds only what is left. */
  const madeSoFar = batch.status === "running" ? await producedSoFar(batch.id) : 0;
  const events = await timelineFor("batch", batch.id);

  return (
    <div className="space-y-4">
      <PageHeader
        title={batch.batchNo}
        sub={`${batch.itemName ?? "—"}${batch.locationName ? ` · ${batch.locationName}` : ""}${batch.madeOn ? ` · ${czDate(batch.madeOn)}` : ""}${company ? ` · ${company.name}` : ""}`}
        action={
          <CocozuriHelp title="This batch">
            <p>
              <strong>Take materials from store</strong> writes them off the shelf now, under this
              batch. <strong>Record finished pieces</strong> puts what is done onto the shelf. Both
              can be used more than once &mdash; a three-day batch should not leave the raw-material
              shelf reading high, and &ldquo;two hundred bars Monday and the rest Wednesday&rdquo; is
              one batch, not two.
            </p>
            <p>
              <strong>Closing nets against whatever has already been done.</strong> Only the
              remainder moves; a negative remainder puts material back.
            </p>
            <p>
              <strong>The difference above is measured from what actually moved, not from the
              recipe.</strong> Reading the recipe back as fact would make every batch agree with
              itself. A shortfall has to say where it went &mdash; in the making, or in the materials
              &mdash; and naming the kind is not enough; it has to say what happened.
            </p>
            <p>
              <strong>It is judged against the recipe it was made from</strong>, frozen when it
              opened. If the recipe has moved on since, the page says so and does nothing about it
              &mdash; it may have been corrected, or changed for next time, and only the chef knows
              which.
            </p>
            <p>
              <strong>Reopening reverses the movements, it does not erase them.</strong> Abandoning
              costs nothing where nothing was fetched, and puts back whatever was.
            </p>
          </CocozuriHelp>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Link href="/cocozuri/batches"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-sm text-fg-muted hover:text-fg">
          <ArrowLeft size={13} /> All batches
        </Link>
        <span className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm ${
          batch.status === "closed" ? "bg-success/10 text-success"
            : batch.status === "cancelled" ? "bg-bg-subtle text-fg-subtle" : "bg-warn/10 text-warn"}`}>
          {CZ_BATCH_STATUS_LABEL[batch.status]}
          {open != null && open >= 1 && ` · open ${open} day${open === 1 ? "" : "s"}`}
        </span>
        {recipe && (
          <Link href={`/cocozuri/recipes/${recipe.id}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-sm text-fg-muted hover:text-fg">
            {recipe.name}
            {batch.recipeMultiple !== 1 && ` × ${qtyText(batch.recipeMultiple)}`}
          </Link>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <CocozuriBatchClose batch={batch} plan={plan} used={used} items={allItems} locations={locations} />
        {/* ⚠️ THE ANSWER TO A BATCH THAT RUNS FOR DAYS. Only offered while it is
            RUNNING — a closed batch's materials are settled and its yield is
            measured against them. */}
        <CocozuriBatchDraw
          batchId={batch.id} batchNo={batch.batchNo} status={batch.status}
          materials={drawMaterials} items={allItems} locationId={batch.locationId}
          producedSoFar={madeSoFar} itemName={batch.itemName} />
        {/* ⚠️ THE OTHER HANDOFF THAT WAS MISSING. A closed batch put chocolate on
            the kitchen's shelf and the only way to move it next door was to go
            to Transfers and start from nothing. Only offered once the batch is
            CLOSED, because until then nothing has been made to send. */}
        {batch.status === "closed" && batch.locationId != null && (
          <Link href={`/cocozuri/transfers?new=1&from=${batch.locationId}${batch.itemName ? `&find=${encodeURIComponent(batch.itemName)}` : ""}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-sm text-fg-muted transition-colors hover:border-accent hover:text-accent">
            <Truck size={13} /> Send some to the shop
          </Link>
        )}
      </div>

      {/* ⚠️ SAID PLAINLY, because otherwise the shelf and the batch appear to
          disagree. A running batch that has taken materials has already had them
          them off the raw-material shelf — which is the whole point — and
          somebody reading "nothing taken yet" underneath would not believe it. */}
      {batch.status === "running" && totalDrawn > 0.0005 && (
        <p className="rounded-lg border border-accent/30 bg-accent/10 px-3.5 py-2.5 text-sm text-fg-muted">
          <strong className="text-fg">
            {drawMaterials.filter((m) => m.drawn > 0.0005).length} material
            {drawMaterials.filter((m) => m.drawn > 0.0005).length === 1 ? " has" : "s have"} been taken
          </strong>{" "}
          to the bench and {drawMaterials.filter((m) => m.drawn > 0.0005).length === 1 ? "is" : "are"} already
          off the raw-material shelf. Closing will take only what is still outstanding, and abandoning
          this batch puts all of it back.
        </p>
      )}

      {/* ⚠️ A PART-FINISHED BATCH HAS CHOCOLATE ON A SHELF ALREADY, and the
          "came out" tile below still reads "not said yet" because nobody has
          closed it. Both are true and together they look like a contradiction,
          so the page says which is which. */}
      {batch.status === "running" && madeSoFar > 0.0005 && (
        <p className="rounded-lg border border-success/30 bg-success/10 px-3.5 py-2.5 text-sm text-fg-muted">
          <strong className="text-fg">{qtyText(madeSoFar)} of this batch is already on the shelf</strong>,
          carrying {batch.batchNo} as its lot. It is still running, so nothing has been counted as
          finished yet — closing it adds only whatever is left.
        </p>
      )}

      {/* ⚠️ THE RECIPE HAS MOVED ON, AND ONLY THE CHEF KNOWS WHAT THAT MEANS.
          It may have been CORRECTED — in which case pull it in — or changed for
          NEXT time, in which case this batch must be left alone. Said, never
          acted on. */}
      {recipeMoved && recipe && (
        <CocozuriRereadRecipe batchId={batch.id} recipeName={recipe.name} />
      )}

      {/* The recipe vs actual check. */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Tile label="Expected" value={check.expected == null ? "—" : qtyText(check.expected)} />
        <Tile label="Came out" value={check.actual == null ? "not said yet" : qtyText(check.actual)}
          tone={check.actual == null ? "muted" : undefined} />
        <Tile
          label={check.yieldPercent == null ? "Difference" : `Difference · ${check.yieldPercent}% yield`}
          value={check.variance == null ? "—" : `${check.variance > 0 ? "+" : ""}${qtyText(check.variance)}`}
          tone={check.variance == null ? "muted" : check.variance < 0 ? "danger" : check.variance > 0 ? "success" : undefined} />
      </div>

      {check.belowBenchmark && (
        <p className="flex items-start gap-2 rounded-lg border border-warn/30 bg-warn/10 px-3.5 py-2.5 text-sm text-warn">
          <AlertTriangle size={14} className="mt-px shrink-0" />
          <span>
            A <strong>{check.yieldPercent}%</strong> yield. The trade expects above 95% for
            artisanal chocolate, and it is a daily number rather than a year-end one.
          </span>
        </p>
      )}

      {/* ⚠️ Where the shortfall went — note #12. */}
      {batch.lossKind !== "none" && (
        <p className="rounded-lg border border-border bg-bg-elev px-3.5 py-2.5 text-sm">
          <strong className="text-fg">Where it went:</strong>{" "}
          <span className="text-fg-muted">{lossLabel(batch.lossKind)}</span>
          {batch.lossNote && <span className="text-fg-muted"> — {batch.lossNote}</span>}
        </p>
      )}

      {/* What went in. */}
      <div className="overflow-x-auto rounded-lg border border-border bg-bg-elev">
        <div className="min-w-[36rem]">
          <div className="flex items-center justify-between border-b border-border bg-bg-subtle px-3 py-1.5">
            <span className="text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">
              What went in
            </span>
            {/* ⚠️ Says WHICH of the two it is showing. Before the batch is closed
                nothing has been consumed, so this is the recipe's intention —
                and presenting an intention as a fact is how a check stops
                meaning anything. */}
            <span className="text-xs text-fg-subtle">
              {consumed ? "taken from the shelf" : "what the recipe asks for — nothing taken yet"}
              {/* ⚠️ WHICH recipe, because a batch opened before the snapshot
                  existed falls back to today's and that is a different claim. */}
              {recipe && <> · against {judgedAgainst}</>}
            </span>
          </div>
          <div className="grid grid-cols-[minmax(10rem,1fr)_110px_110px_110px] items-center gap-2 border-b border-border bg-bg-subtle px-3 py-1.5 text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">
            <span>Material</span>
            <span className="text-right">Recipe</span>
            <span className="text-right">{consumed ? "Used" : "Will use"}</span>
            <span className="text-right">Difference</span>
          </div>
          {check.materials.map((m) => (
            <div key={m.itemId} className="grid grid-cols-[minmax(10rem,1fr)_110px_110px_110px] items-center gap-2 border-b border-border px-3 py-1.5 last:border-0">
              <span className="min-w-0 truncate text-sm text-fg" title={m.itemName}>{m.itemName}</span>
              <span className="text-right text-sm tabular text-fg-subtle">
                {m.planned == null ? "—" : `${qtyText(m.planned)} ${m.uom}`}
              </span>
              <span className="text-right text-sm tabular text-fg">
                {qtyText(m.used)} {m.uom}
              </span>
              <span className={`text-right text-sm tabular ${
                m.variance == null ? "text-fg-subtle" : Math.abs(m.variance) < 0.0005 ? "text-fg-subtle" : "text-warn"}`}>
                {m.variance == null ? "—" : `${m.variance > 0 ? "+" : ""}${qtyText(m.variance)}`}
              </span>
            </div>
          ))}
          {check.materials.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-fg-subtle">
              Nothing is listed as going into this — it was started without a recipe.
            </p>
          )}
        </div>
      </div>

      {/* The movements themselves — the traceability, made visible. */}
      {moves.length > 0 && (
        <div className="rounded-lg border border-border bg-bg-elev px-3.5 py-2.5">
          <h2 className="text-base font-semibold text-fg">What this batch did to stock</h2>
          <p className="mt-1 text-xs text-fg-subtle">
            Every one of these carries the batch number. That is what lets you go from a bad bag of
            anything to every bar made from it, and back again.
          </p>
          {/* ⚠️ THIS LIST SAID "Took −44" AND NOTHING ELSE. It named neither the
              material nor the day, so a reader had to infer both from the table
              above; anything that was not a consume or a produce fell through to
              the raw ledger code, which is why a lower-case `transfer` sat
              between two capitalised words. Item, day and reason, all named. */}
          <div className="mt-2 overflow-x-auto">
            <div className="min-w-[30rem]">
              <div className="grid grid-cols-[90px_150px_minmax(0,1fr)_90px] items-center gap-2 border-b border-border py-1.5 text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">
                <span>Day</span>
                <span>What happened</span>
                <span>Which item</span>
                <span className="text-right">Quantity</span>
              </div>
              {moves.map((m) => (
                <div key={m.id} className="grid grid-cols-[90px_150px_minmax(0,1fr)_90px] items-center gap-2 border-b border-border py-1.5 text-sm last:border-0">
                  <span className="tabular text-fg-subtle">{czDate(m.onDate)}</span>
                  <span className="truncate text-fg-muted">{CZ_MOVE_REASON_LABEL[m.reason]}</span>
                  <span className="min-w-0 truncate text-fg" title={m.note ?? undefined}>
                    {itemNames.get(m.itemId) ?? `Item #${m.itemId}`}
                  </span>
                  <span className={`text-right tabular ${m.qty < 0 ? "text-danger" : "text-success"}`}>
                    {m.qty > 0 ? "+" : ""}{qtyText(m.qty)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {batch.notes && (
        <div className="rounded-lg border border-border bg-bg-elev px-3.5 py-2.5">
          <p className="text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">Note</p>
          <p className="mt-0.5 text-sm text-fg-muted">
            {batch.notes}
          </p>
        </div>
      )}

      {/* ⚠️ What happened to this batch, and a place to say something about it.
          Nothing here can be edited or removed afterwards. */}
      <CocozuriTimeline
        subjectType="batch" subjectId={batch.id} subjectRef={batch.batchNo}
        events={events} />
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: "danger" | "success" | "muted" }) {
  return (
    <div className="rounded-lg border border-border bg-bg-elev px-3.5 py-3">
      <span className={`block truncate text-lg font-semibold leading-none tabular ${
        tone === "danger" ? "text-danger" : tone === "success" ? "text-success" : tone === "muted" ? "text-fg-subtle" : "text-fg"}`}>
        {value}
      </span>
      <span className="mt-1 block text-sm text-fg-muted">{label}</span>
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { CocozuriBatchClose } from "@/components/cocozuri-batch-close";
import { cocozuriCompany } from "@/lib/cocozuri";
import { listMoves } from "@/lib/cocozuri-stock";
import { qty as qtyText, todayInDar } from "@/lib/cocozuri-stock-shared";
import { batchDetail, getBatchByNo } from "@/lib/cocozuri-batch";
import {
  CZ_BATCH_STATUS_LABEL, batchPlan, daysOpen, lossLabel,
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

  const [company, detail, moves] = await Promise.all([
    cocozuriCompany(),
    batchDetail(batch),
    listMoves({ batchId: batch.id }),
  ]);
  const { recipe, check, used } = detail;
  const plan = recipe ? batchPlan(recipe, batch.recipeMultiple) : null;
  const consumed = moves.some((m) => m.reason === "consume");
  const open = daysOpen(batch, todayInDar());

  return (
    <div className="space-y-4">
      <PageHeader
        title={batch.batchNo}
        sub={`${batch.itemName ?? "—"}${batch.locationName ? ` · ${batch.locationName}` : ""}${batch.madeOn ? ` · ${batch.madeOn}` : ""}${company ? ` · ${company.name}` : ""}`}
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

      <CocozuriBatchClose batch={batch} plan={plan} used={used} />

      {/* The inter check — expected against actual. */}
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
          <ul className="mt-2 space-y-1 text-sm">
            {moves.map((m) => (
              <li key={m.id} className="flex items-center justify-between text-fg-muted">
                <span className="truncate">
                  {m.reason === "consume" ? "Took" : m.reason === "produce" ? "Made" : m.reason}
                  {m.note ? "" : ""}
                </span>
                <span className={`tabular ${m.qty < 0 ? "text-danger" : "text-success"}`}>
                  {m.qty > 0 ? "+" : ""}{qtyText(m.qty)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {batch.notes && (
        <p className="rounded-lg border border-border bg-bg-elev px-3.5 py-2.5 text-sm text-fg-muted">
          {batch.notes}
        </p>
      )}
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

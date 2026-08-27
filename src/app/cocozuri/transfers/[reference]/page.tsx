import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { czDate } from "@/lib/cocozuri-shared";
import { CocozuriTransferReceive } from "@/components/cocozuri-transfer-receive";
import { cocozuriCompany } from "@/lib/cocozuri";
import { getTransferByRef } from "@/lib/cocozuri-transfer";
import { CZ_TRANSFER_STATUS_LABEL, daysInTransit, transferCheck } from "@/lib/cocozuri-transfer-shared";
import { qty as qtyText, todayInDar } from "@/lib/cocozuri-stock-shared";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  return { title: `${decodeURIComponent(reference)} — CocoZuri` };
}

/**
 * One transfer: what left, what arrived, and what did not.
 *
 * ⚠️ THE MISSING UNITS GET NO MOVEMENT OF THEIR OWN, and the page says so. The
 * kitchen is down 20 and the shop is up 18; the 2 belong to neither shelf.
 * Inventing a third movement to make the arithmetic tidy would put them
 * somewhere they never were — the transfer itself is where that fact lives.
 */
export default async function CocozuriTransferPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  const transfer = await getTransferByRef(decodeURIComponent(reference));
  if (!transfer) notFound();

  const company = await cocozuriCompany();
  const check = transferCheck(transfer);
  const waiting = daysInTransit(transfer, todayInDar());

  return (
    <div className="space-y-4">
      <PageHeader
        title={transfer.reference}
        sub={`${transfer.fromLocationName ?? "?"} → ${transfer.toLocationName ?? "?"} · ${czDate(transfer.onDate)}${company ? ` · ${company.name}` : ""}`}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Link href="/cocozuri/transfers"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-sm text-fg-muted hover:text-fg">
          <ArrowLeft size={13} /> All transfers
        </Link>
        <span className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm ${
          transfer.status === "received" ? "bg-success/10 text-success"
            : transfer.status === "cancelled" ? "bg-bg-subtle text-fg-subtle" : "bg-warn/10 text-warn"}`}>
          {CZ_TRANSFER_STATUS_LABEL[transfer.status]}
          {waiting != null && waiting >= 1 && ` · ${waiting} day${waiting === 1 ? "" : "s"}`}
        </span>
        {transfer.sentBy && (
          <span className="text-sm text-fg-subtle">sent by {transfer.sentBy}</span>
        )}
      </div>

      <CocozuriTransferReceive transfer={transfer} />

      <div className="grid gap-3 sm:grid-cols-3">
        <Tile label={`Left ${transfer.fromLocationName ?? "the kitchen"}`} value={qtyText(check.sent)} />
        <Tile
          label={`Arrived at ${transfer.toLocationName ?? "the shop"}`}
          value={check.received == null ? "not counted yet" : qtyText(check.received)}
          tone={check.received == null ? "muted" : undefined} />
        <Tile
          label={check.received == null ? "On the way" : "Never arrived"}
          value={check.received == null ? qtyText(check.inTransit) : check.variance === 0 ? "none" : qtyText(-check.variance!)}
          tone={check.received == null ? "muted" : check.variance! < 0 ? "danger" : "success"} />
      </div>

      {/* ⚠️ Said plainly. Between the two moments the stock is on neither shelf,
          and that is the truth rather than a gap in the records. */}
      {transfer.status === "sent" && (
        <p className="flex items-start gap-2 rounded-lg border border-warn/30 bg-warn/10 px-3.5 py-2.5 text-sm text-warn">
          <AlertTriangle size={14} className="mt-px shrink-0" />
          <span>
            This is <strong>on its way</strong>. It has come off {transfer.fromLocationName ?? "the sending shelf"} and
            is not yet on {transfer.toLocationName ?? "the other one"} — which is where it actually
            is. Count it at the other end to put it on the shelf.
          </span>
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-border bg-bg-elev">
        <div className="min-w-[34rem]">
          <div className="grid grid-cols-[minmax(10rem,1fr)_100px_100px_110px] items-center gap-2 border-b border-border bg-bg-subtle px-3 py-1.5 text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">
            <span>Chocolate</span>
            <span className="text-right">Sent</span>
            <span className="text-right">Arrived</span>
            <span className="text-right">Missing</span>
          </div>
          {transfer.lines.map((l) => {
            const missing = l.receivedQty == null ? null : Math.round((l.sentQty - l.receivedQty) * 1000) / 1000;
            return (
              <div key={l.id} className="border-b border-border px-3 py-1.5 last:border-0">
                <div className="grid grid-cols-[minmax(10rem,1fr)_100px_100px_110px] items-center gap-2">
                  <span className="min-w-0 truncate text-sm text-fg" title={l.itemName}>
                    {l.itemName}
                    {/* ⚠️ THE BATCH TRAVELS WITH THE CHOCOLATE — without it, a
                        bar reaching the shop loses the thread back to the
                        morning it was made. */}
                    {l.batchNo && <span className="ml-1.5 text-xs text-fg-subtle">{l.batchNo}</span>}
                  </span>
                  <span className="text-right text-sm tabular text-fg-muted">{qtyText(l.sentQty)} {l.uom}</span>
                  <span className="text-right text-sm tabular text-fg">
                    {l.receivedQty == null ? "—" : qtyText(l.receivedQty)}
                  </span>
                  <span className={`text-right text-sm tabular ${missing && missing > 0 ? "text-danger" : "text-fg-subtle"}`}>
                    {missing == null ? "—" : missing === 0 ? "none" : qtyText(missing)}
                  </span>
                </div>
                {l.shortNote && (
                  <p className="mt-0.5 text-xs text-fg-muted">{l.shortNote}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {check.variance != null && check.variance < 0 && (
        <p className="rounded-lg border border-border bg-bg-elev px-3.5 py-2.5 text-sm text-fg-muted">
          <strong className="text-fg">{qtyText(-check.variance)}</strong> left{" "}
          {transfer.fromLocationName ?? "one shelf"} and never reached{" "}
          {transfer.toLocationName ?? "the other"}. It belongs to neither, so there is no third
          movement for it — the loss is the difference between the two sides of this transfer, and
          both of them carry its reference.
        </p>
      )}

      {transfer.notes && (
        <p className="rounded-lg border border-border bg-bg-elev px-3.5 py-2.5 text-sm text-fg-muted">
          {transfer.notes}
        </p>
      )}

      <p className="flex items-center gap-1.5 text-xs text-fg-subtle">
        <ArrowRight size={11} />
        Every movement here carries {transfer.reference}, so what this transfer cost is always
        answerable.
      </p>
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
